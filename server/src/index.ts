import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';
import { signToken, requireAuth } from './auth';
import type { AuthRequest } from './auth';

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Database (Supabase / PostgreSQL) ──────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});

// ── Storage (Cloudflare R2 / local disk fallback) ─────────────────────────
const USE_R2 = !!(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME &&
  process.env.R2_PUBLIC_URL
);

let r2: S3Client | null = null;
if (USE_R2) {
  r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
if (!USE_R2) {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  app.use('/uploads', express.static(UPLOADS_DIR));
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── DB schema init ────────────────────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        username      TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS flows (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        group_name  TEXT NOT NULL DEFAULT '',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        order_idx   INTEGER NOT NULL DEFAULT 0,
        created_by  TEXT REFERENCES users(id)
      )
    `);
    await client.query(`ALTER TABLE flows ADD COLUMN IF NOT EXISTS group_name TEXT NOT NULL DEFAULT ''`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS modules (
        id             TEXT PRIMARY KEY,
        flow_id        TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
        label          TEXT NOT NULL,
        name           TEXT NOT NULL,
        side           TEXT NOT NULL DEFAULT 'eDS',
        note           TEXT NOT NULL DEFAULT '',
        parallel_group TEXT,
        order_idx      INTEGER NOT NULL DEFAULT 0,
        created_by     TEXT REFERENCES users(id)
      )
    `);
    await client.query(`ALTER TABLE modules ADD COLUMN IF NOT EXISTS parallel_group TEXT`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS scenarios (
        id             TEXT PRIMARY KEY,
        module_id      TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
        blid           TEXT NOT NULL,
        description    TEXT NOT NULL,
        expected       TEXT NOT NULL DEFAULT '',
        status         TEXT NOT NULL DEFAULT 'untested',
        issue_type     TEXT,
        date_tested    TEXT NOT NULL DEFAULT '',
        ado_ticket     TEXT NOT NULL DEFAULT '',
        evidence_url   TEXT NOT NULL DEFAULT '',
        evidence_image TEXT,
        remarks        TEXT NOT NULL DEFAULT '',
        order_idx      INTEGER NOT NULL DEFAULT 0
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS test_steps (
        id             TEXT PRIMARY KEY,
        scenario_id    TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
        description    TEXT NOT NULL DEFAULT '',
        expected       TEXT NOT NULL DEFAULT '',
        status         TEXT NOT NULL DEFAULT 'untested',
        issue_type     TEXT,
        date_tested    TEXT NOT NULL DEFAULT '',
        ado_ticket     TEXT NOT NULL DEFAULT '',
        evidence_url   TEXT NOT NULL DEFAULT '',
        evidence_image TEXT,
        remarks        TEXT NOT NULL DEFAULT '',
        order_idx      INTEGER NOT NULL DEFAULT 0
      )
    `);
  } finally {
    client.release();
  }
}

// ── Password helpers ──────────────────────────────────────────────────────
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':');
    const computed = pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
    return timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  } catch {
    return false;
  }
}

// ── Ownership helper ──────────────────────────────────────────────────────
function canEdit(owner: string | null | undefined, userId: string): boolean {
  return !owner || owner === userId;
}

// ── Storage helpers ───────────────────────────────────────────────────────
async function deleteEvidence(imageUrl: string | null | undefined) {
  if (!imageUrl) return;
  if (USE_R2 && r2) {
    try {
      const key = imageUrl.replace(R2_PUBLIC_URL + '/', '');
      await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }));
    } catch {}
  } else {
    try {
      const file = path.join(UPLOADS_DIR, path.basename(imageUrl));
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
  }
}

// ── Data helpers ──────────────────────────────────────────────────────────
async function getAllFlows() {
  const { rows: flows } = await pool.query(`
    SELECT f.*, u.username AS created_by_name
    FROM flows f LEFT JOIN users u ON u.id = f.created_by
    ORDER BY f.order_idx, f.created_at
  `);
  const { rows: modules } = await pool.query(`
    SELECT m.*, u.username AS created_by_name
    FROM modules m LEFT JOIN users u ON u.id = m.created_by
    ORDER BY m.order_idx
  `);
  const { rows: scenarios } = await pool.query('SELECT * FROM scenarios ORDER BY order_idx');
  const { rows: steps }     = await pool.query('SELECT * FROM test_steps ORDER BY order_idx');
  return flows.map(f => ({
    ...f,
    modules: modules
      .filter(m => m.flow_id === f.id)
      .map(m => ({
        ...m,
        scenarios: scenarios
          .filter(s => s.module_id === m.id)
          .map(s => ({ ...s, steps: steps.filter(st => st.scenario_id === s.id) })),
      })),
  }));
}

async function nextOrder(table: string, col: string, val: string): Promise<number> {
  const { rows } = await pool.query(`SELECT MAX(order_idx) AS mx FROM ${table} WHERE ${col} = $1`, [val]);
  return (rows[0]?.mx ?? -1) + 1;
}

async function getFlowOwner(flowId: string): Promise<string | null> {
  const { rows } = await pool.query('SELECT created_by FROM flows WHERE id = $1', [flowId]);
  return rows[0]?.created_by ?? null;
}

async function getFlowOwnerByModule(moduleId: string): Promise<string | null> {
  const { rows } = await pool.query(`
    SELECT f.created_by FROM flows f JOIN modules m ON m.flow_id = f.id WHERE m.id = $1
  `, [moduleId]);
  return rows[0]?.created_by ?? null;
}

async function getFlowOwnerByScenario(scenarioId: string): Promise<string | null> {
  const { rows } = await pool.query(`
    SELECT f.created_by FROM flows f
    JOIN modules m ON m.flow_id = f.id
    JOIN scenarios s ON s.module_id = m.id WHERE s.id = $1
  `, [scenarioId]);
  return rows[0]?.created_by ?? null;
}

async function getFlowOwnerByStep(stepId: string): Promise<string | null> {
  const { rows } = await pool.query(`
    SELECT f.created_by FROM flows f
    JOIN modules m ON m.flow_id = f.id
    JOIN scenarios sc ON sc.module_id = m.id
    JOIN test_steps st ON st.scenario_id = sc.id WHERE st.id = $1
  `, [stepId]);
  return rows[0]?.created_by ?? null;
}

// ── Auth routes (public) ──────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username?.trim() || !password)
    return res.status(400).json({ error: 'Username and password required' });
  if (username.trim().length < 2)
    return res.status(400).json({ error: 'Username must be at least 2 characters' });
  if (password.length < 4)
    return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const { rows } = await pool.query('SELECT id FROM users WHERE username = $1', [username.trim()]);
  if (rows.length) return res.status(409).json({ error: 'Username already taken' });

  const id = uuidv4();
  await pool.query('INSERT INTO users (id, username, password_hash) VALUES ($1,$2,$3)',
    [id, username.trim(), hashPassword(password)]);

  res.json({ token: signToken(id, username.trim()), userId: id, username: username.trim() });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username?.trim() || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid username or password' });

  res.json({ token: signToken(user.id, user.username), userId: user.id, username: user.username });
});

// ── Global auth middleware ────────────────────────────────────────────────
app.use('/api', (req: AuthRequest, res, next) => {
  if (req.path === '/auth/login' || req.path === '/auth/register') return next();
  return requireAuth(req, res, next);
});

app.get('/api/auth/me', (req: AuthRequest, res) => {
  res.json({ userId: req.user!.userId, username: req.user!.username });
});

// ── Flows ─────────────────────────────────────────────────────────────────
app.get('/api/flows', async (_req, res) => {
  res.json(await getAllFlows());
});

app.post('/api/flows', async (req: AuthRequest, res) => {
  const { name, description = '', group_name = '' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  const { rows } = await pool.query('SELECT MAX(order_idx) AS mx FROM flows');
  const order = (rows[0]?.mx ?? -1) + 1;
  await pool.query(
    'INSERT INTO flows (id, name, description, group_name, order_idx, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, name.trim(), description.trim(), group_name.trim(), order, req.user!.userId]
  );
  const flows = await getAllFlows();
  res.json(flows.find(f => f.id === id));
});

app.delete('/api/flows/:id', async (req: AuthRequest, res) => {
  const { rows } = await pool.query('SELECT created_by FROM flows WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (!canEdit(rows[0].created_by, req.user!.userId))
    return res.status(403).json({ error: 'You can only delete your own flows' });
  await pool.query('DELETE FROM flows WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ── Modules ───────────────────────────────────────────────────────────────
app.post('/api/flows/:flowId/modules', async (req: AuthRequest, res) => {
  if (!canEdit(await getFlowOwner(req.params.flowId), req.user!.userId))
    return res.status(403).json({ error: 'You can only add modules to your own flows' });
  const { label, name, side = 'eDS', note = '', parallel_group = null } = req.body;
  if (!label?.trim() || !name?.trim()) return res.status(400).json({ error: 'label and name required' });
  const id = uuidv4();
  const order = await nextOrder('modules', 'flow_id', req.params.flowId);
  await pool.query(
    'INSERT INTO modules (id, flow_id, label, name, side, note, parallel_group, order_idx, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [id, req.params.flowId, label.trim(), name.trim(), side, note.trim(), parallel_group || null, order, req.user!.userId]
  );
  const { rows } = await pool.query(`
    SELECT m.*, u.username AS created_by_name FROM modules m
    LEFT JOIN users u ON u.id = m.created_by WHERE m.id = $1
  `, [id]);
  res.json({ ...rows[0], scenarios: [] });
});

app.put('/api/modules/:id', async (req: AuthRequest, res) => {
  const { rows: mRows } = await pool.query('SELECT * FROM modules WHERE id = $1', [req.params.id]);
  if (!mRows.length) return res.status(404).json({ error: 'Not found' });
  if (!canEdit(await getFlowOwnerByModule(req.params.id), req.user!.userId))
    return res.status(403).json({ error: 'You can only edit modules in your own flows' });
  const { label, name, side, note, order_idx } = req.body;
  if (order_idx !== undefined)
    await pool.query('UPDATE modules SET order_idx = $1 WHERE id = $2', [order_idx, req.params.id]);
  if (label !== undefined)
    await pool.query('UPDATE modules SET label=$1, name=$2, side=$3, note=$4 WHERE id=$5',
      [label, name, side, note, req.params.id]);
  const { rows: updated } = await pool.query(`
    SELECT m.*, u.username AS created_by_name FROM modules m
    LEFT JOIN users u ON u.id = m.created_by WHERE m.id = $1
  `, [req.params.id]);
  const { rows: scenarios } = await pool.query(
    'SELECT * FROM scenarios WHERE module_id = $1 ORDER BY order_idx', [req.params.id]);
  res.json({ ...updated[0], scenarios });
});

app.delete('/api/modules/:id', async (req: AuthRequest, res) => {
  const { rows } = await pool.query('SELECT created_by FROM modules WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (!canEdit(await getFlowOwnerByModule(req.params.id), req.user!.userId))
    return res.status(403).json({ error: 'You can only delete modules in your own flows' });
  await pool.query('DELETE FROM modules WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ── Scenarios ─────────────────────────────────────────────────────────────
app.post('/api/modules/:moduleId/scenarios', async (req: AuthRequest, res) => {
  if (!canEdit(await getFlowOwnerByModule(req.params.moduleId), req.user!.userId))
    return res.status(403).json({ error: 'You can only add scenarios to modules in your own flows' });
  const { blid, description } = req.body;
  if (!blid?.trim() || !description?.trim()) return res.status(400).json({ error: 'blid and description required' });
  const id = uuidv4();
  const order = await nextOrder('scenarios', 'module_id', req.params.moduleId);
  await pool.query(
    'INSERT INTO scenarios (id, module_id, blid, description, expected, order_idx) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, req.params.moduleId, blid.trim(), description.trim(), '', order]
  );
  const { rows } = await pool.query('SELECT * FROM scenarios WHERE id = $1', [id]);
  res.json({ ...rows[0], steps: [] });
});

app.put('/api/scenarios/:id', async (req: AuthRequest, res) => {
  if (!canEdit(await getFlowOwnerByScenario(req.params.id), req.user!.userId))
    return res.status(403).json({ error: 'You can only edit scenarios in your own flows' });
  const allowed = ['status','issue_type','date_tested','ado_ticket','evidence_url','evidence_image','remarks'] as const;
  const updates = Object.entries(req.body).filter(([k]) => (allowed as readonly string[]).includes(k));
  if (updates.length) {
    const set = updates.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = [...updates.map(([, v]) => v), req.params.id];
    await pool.query(`UPDATE scenarios SET ${set} WHERE id = $${updates.length + 1}`, vals);
  }
  const { rows } = await pool.query('SELECT * FROM scenarios WHERE id = $1', [req.params.id]);
  res.json(rows[0]);
});

app.delete('/api/scenarios/:id', async (req: AuthRequest, res) => {
  if (!canEdit(await getFlowOwnerByScenario(req.params.id), req.user!.userId))
    return res.status(403).json({ error: 'You can only delete scenarios from your own flows' });
  const { rows } = await pool.query('SELECT evidence_image FROM scenarios WHERE id = $1', [req.params.id]);
  await deleteEvidence(rows[0]?.evidence_image);
  await pool.query('DELETE FROM scenarios WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ── Test Steps ────────────────────────────────────────────────────────────
app.post('/api/scenarios/:scenarioId/steps', async (req: AuthRequest, res) => {
  if (!canEdit(await getFlowOwnerByScenario(req.params.scenarioId), req.user!.userId))
    return res.status(403).json({ error: 'You can only add steps to scenarios in your own flows' });
  const { description, expected = '' } = req.body;
  if (!description?.trim()) return res.status(400).json({ error: 'description required' });
  const id = uuidv4();
  const order = await nextOrder('test_steps', 'scenario_id', req.params.scenarioId);
  await pool.query(
    'INSERT INTO test_steps (id, scenario_id, description, expected, order_idx) VALUES ($1,$2,$3,$4,$5)',
    [id, req.params.scenarioId, description.trim(), expected.trim(), order]
  );
  const { rows } = await pool.query('SELECT * FROM test_steps WHERE id = $1', [id]);
  res.json(rows[0]);
});

app.put('/api/steps/:id', async (req: AuthRequest, res) => {
  if (!canEdit(await getFlowOwnerByStep(req.params.id), req.user!.userId))
    return res.status(403).json({ error: 'You can only edit steps in your own flows' });
  const allowed = ['description','expected','status','issue_type','date_tested','ado_ticket','evidence_url','evidence_image','remarks'] as const;
  const updates = Object.entries(req.body).filter(([k]) => (allowed as readonly string[]).includes(k));
  if (updates.length) {
    const set = updates.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = [...updates.map(([, v]) => v), req.params.id];
    await pool.query(`UPDATE test_steps SET ${set} WHERE id = $${updates.length + 1}`, vals);
  }
  const { rows } = await pool.query('SELECT * FROM test_steps WHERE id = $1', [req.params.id]);
  res.json(rows[0]);
});

app.delete('/api/steps/:id', async (req: AuthRequest, res) => {
  if (!canEdit(await getFlowOwnerByStep(req.params.id), req.user!.userId))
    return res.status(403).json({ error: 'You can only delete steps in your own flows' });
  const { rows } = await pool.query('SELECT evidence_image FROM test_steps WHERE id = $1', [req.params.id]);
  await deleteEvidence(rows[0]?.evidence_image);
  await pool.query('DELETE FROM test_steps WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ── Module reorder ────────────────────────────────────────────────────────
app.put('/api/flows/:flowId/modules/reorder', async (req: AuthRequest, res) => {
  const { moduleId, direction } = req.body as { moduleId: string; direction: -1 | 1 };
  if (!canEdit(await getFlowOwner(req.params.flowId), req.user!.userId))
    return res.status(403).json({ error: 'You can only reorder modules in your own flows' });
  const { rows: mods } = await pool.query(
    'SELECT * FROM modules WHERE flow_id = $1 ORDER BY order_idx', [req.params.flowId]);
  const idx = mods.findIndex(m => m.id === moduleId);
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= mods.length) return res.json({ ok: false });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE modules SET order_idx = $1 WHERE id = $2', [mods[newIdx].order_idx, mods[idx].id]);
    await client.query('UPDATE modules SET order_idx = $1 WHERE id = $2', [mods[idx].order_idx, mods[newIdx].id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.json({ ok: true });
});

// ── Image upload ──────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  if (USE_R2 && r2) {
    try {
      const key = `${uuidv4()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await r2.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }));
      res.json({ url: `${R2_PUBLIC_URL}/${key}` });
    } catch (err) {
      console.error('R2 upload error:', err);
      res.status(500).json({ error: 'R2 upload failed' });
    }
  } else {
    const filename = `${uuidv4()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), req.file.buffer);
    res.json({ url: `/uploads/${filename}` });
  }
});

// ── Serve React app in production ─────────────────────────────────────────
if (IS_PROD) {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// ── Start ─────────────────────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n  Server ready → http://localhost:${PORT}`);
      console.log(`  Database    → Supabase PostgreSQL`);
      console.log(`  Storage     → ${USE_R2 ? 'Cloudflare R2' : 'local disk'}`);
      console.log(`  Mode        → ${IS_PROD ? 'production' : 'development'}\n`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
