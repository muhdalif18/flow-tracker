import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { v2 as cloudinary } from 'cloudinary';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';
import { signToken, requireAuth } from './auth';
import type { AuthRequest } from './auth';

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// ── Middleware ────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Cloudinary (production) / local disk (dev) ────────────────────────────
const USE_CLOUDINARY = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

if (USE_CLOUDINARY) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// ── Static uploads (local dev only) ──────────────────────────────────────
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.resolve(__dirname, '../../uploads');
if (!USE_CLOUDINARY) {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  app.use('/uploads', express.static(UPLOADS_DIR));
}

// ── Multer (memory storage so we can stream to Cloudinary) ────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Database ──────────────────────────────────────────────────────────────
const DB_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, 'tracker.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS flows (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    order_idx   INTEGER NOT NULL DEFAULT 0,
    created_by  TEXT REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS modules (
    id         TEXT PRIMARY KEY,
    flow_id    TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    label      TEXT NOT NULL,
    name       TEXT NOT NULL,
    side       TEXT NOT NULL DEFAULT 'eDS',
    note       TEXT NOT NULL DEFAULT '',
    order_idx  INTEGER NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES users(id)
  );

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
  );

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
  );
`);

// Migrations: add columns to existing tables that predate this schema
try { db.exec("ALTER TABLE flows   ADD COLUMN created_by TEXT"); } catch {}
try { db.exec("ALTER TABLE modules ADD COLUMN created_by TEXT"); } catch {}

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

// ── Data helpers ──────────────────────────────────────────────────────────
function getAllFlows() {
  const flows = db.prepare(`
    SELECT f.*, u.username AS created_by_name
    FROM flows f LEFT JOIN users u ON u.id = f.created_by
    ORDER BY f.order_idx, f.created_at
  `).all() as any[];
  const modules = db.prepare(`
    SELECT m.*, u.username AS created_by_name
    FROM modules m LEFT JOIN users u ON u.id = m.created_by
    ORDER BY m.order_idx
  `).all() as any[];
  const scenarios = db.prepare('SELECT * FROM scenarios ORDER BY order_idx').all() as any[];
  const steps     = db.prepare('SELECT * FROM test_steps ORDER BY order_idx').all() as any[];
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

function nextOrder(table: string, col: string, val: string): number {
  const row = db.prepare(`SELECT MAX(order_idx) as mx FROM ${table} WHERE ${col} = ?`).get(val) as any;
  return (row?.mx ?? -1) + 1;
}

function getFlowOwner(flowId: string): string | null {
  const row = db.prepare('SELECT created_by FROM flows WHERE id = ?').get(flowId) as any;
  return row?.created_by ?? null;
}

function getFlowOwnerByModule(moduleId: string): string | null {
  const row = db.prepare(`
    SELECT f.created_by FROM flows f
    JOIN modules m ON m.flow_id = f.id WHERE m.id = ?
  `).get(moduleId) as any;
  return row?.created_by ?? null;
}

function getFlowOwnerByScenario(scenarioId: string): string | null {
  const row = db.prepare(`
    SELECT f.created_by FROM flows f
    JOIN modules m ON m.flow_id = f.id
    JOIN scenarios s ON s.module_id = m.id WHERE s.id = ?
  `).get(scenarioId) as any;
  return row?.created_by ?? null;
}

function getFlowOwnerByStep(stepId: string): string | null {
  const row = db.prepare(`
    SELECT f.created_by FROM flows f
    JOIN modules m ON m.flow_id = f.id
    JOIN scenarios sc ON sc.module_id = m.id
    JOIN test_steps st ON st.scenario_id = sc.id WHERE st.id = ?
  `).get(stepId) as any;
  return row?.created_by ?? null;
}

// ── Auth routes (public) ──────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username?.trim() || !password)
    return res.status(400).json({ error: 'Username and password required' });
  if (username.trim().length < 2)
    return res.status(400).json({ error: 'Username must be at least 2 characters' });
  if (password.length < 4)
    return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const id = uuidv4();
  db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?,?,?)')
    .run(id, username.trim(), hashPassword(password));

  res.json({ token: signToken(id, username.trim()), userId: id, username: username.trim() });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username?.trim() || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim()) as any;
  if (!user || !verifyPassword(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid username or password' });

  res.json({ token: signToken(user.id, user.username), userId: user.id, username: user.username });
});

// ── Global auth middleware (all /api routes except login/register) ─────────
app.use('/api', (req: AuthRequest, res, next) => {
  if (req.path === '/auth/login' || req.path === '/auth/register') return next();
  return requireAuth(req, res, next);
});

app.get('/api/auth/me', (req: AuthRequest, res) => {
  res.json({ userId: req.user!.userId, username: req.user!.username });
});

// ── Flows ─────────────────────────────────────────────────────────────────
app.get('/api/flows', (_req, res) => res.json(getAllFlows()));

app.post('/api/flows', (req: AuthRequest, res) => {
  const { name, description = '' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  const mx = db.prepare('SELECT MAX(order_idx) as mx FROM flows').get() as any;
  const order = (mx?.mx ?? -1) + 1;
  db.prepare('INSERT INTO flows (id, name, description, order_idx, created_by) VALUES (?,?,?,?,?)')
    .run(id, name.trim(), description.trim(), order, req.user!.userId);
  res.json(getAllFlows().find(f => f.id === id));
});

app.delete('/api/flows/:id', (req: AuthRequest, res) => {
  const flow = db.prepare('SELECT created_by FROM flows WHERE id = ?').get(req.params.id) as any;
  if (!flow) return res.status(404).json({ error: 'Not found' });
  if (!canEdit(flow.created_by, req.user!.userId))
    return res.status(403).json({ error: 'You can only delete your own flows' });
  db.prepare('DELETE FROM flows WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Modules ───────────────────────────────────────────────────────────────
app.post('/api/flows/:flowId/modules', (req: AuthRequest, res) => {
  if (!canEdit(getFlowOwner(req.params.flowId), req.user!.userId))
    return res.status(403).json({ error: 'You can only add modules to your own flows' });
  const { label, name, side = 'eDS', note = '' } = req.body;
  if (!label?.trim() || !name?.trim()) return res.status(400).json({ error: 'label and name required' });
  const id = uuidv4();
  const order = nextOrder('modules', 'flow_id', req.params.flowId);
  db.prepare('INSERT INTO modules (id, flow_id, label, name, side, note, order_idx, created_by) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, req.params.flowId, label.trim(), name.trim(), side, note.trim(), order, req.user!.userId);
  const mod = db.prepare(`
    SELECT m.*, u.username AS created_by_name FROM modules m
    LEFT JOIN users u ON u.id = m.created_by WHERE m.id = ?
  `).get(id) as any;
  res.json({ ...mod, scenarios: [] });
});

app.put('/api/modules/:id', (req: AuthRequest, res) => {
  const mod = db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id) as any;
  if (!mod) return res.status(404).json({ error: 'Not found' });
  if (!canEdit(getFlowOwnerByModule(req.params.id), req.user!.userId))
    return res.status(403).json({ error: 'You can only edit modules in your own flows' });
  const { label, name, side, note, order_idx } = req.body;
  if (order_idx !== undefined) db.prepare('UPDATE modules SET order_idx = ? WHERE id = ?').run(order_idx, req.params.id);
  if (label !== undefined)     db.prepare('UPDATE modules SET label=?, name=?, side=?, note=? WHERE id=?').run(label, name, side, note, req.params.id);
  const updated = db.prepare(`
    SELECT m.*, u.username AS created_by_name FROM modules m
    LEFT JOIN users u ON u.id = m.created_by WHERE m.id = ?
  `).get(req.params.id) as any;
  const scenarios = db.prepare('SELECT * FROM scenarios WHERE module_id = ? ORDER BY order_idx').all(req.params.id);
  res.json({ ...updated, scenarios });
});

app.delete('/api/modules/:id', (req: AuthRequest, res) => {
  const mod = db.prepare('SELECT created_by FROM modules WHERE id = ?').get(req.params.id) as any;
  if (!mod) return res.status(404).json({ error: 'Not found' });
  if (!canEdit(getFlowOwnerByModule(req.params.id), req.user!.userId))
    return res.status(403).json({ error: 'You can only delete modules in your own flows' });
  db.prepare('DELETE FROM modules WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Scenarios ─────────────────────────────────────────────────────────────
app.post('/api/modules/:moduleId/scenarios', (req: AuthRequest, res) => {
  if (!canEdit(getFlowOwnerByModule(req.params.moduleId), req.user!.userId))
    return res.status(403).json({ error: 'You can only add scenarios to modules in your own flows' });
  const { blid, description } = req.body;
  if (!blid?.trim() || !description?.trim()) return res.status(400).json({ error: 'blid and description required' });
  const id = uuidv4();
  const order = nextOrder('scenarios', 'module_id', req.params.moduleId);
  db.prepare('INSERT INTO scenarios (id, module_id, blid, description, expected, order_idx) VALUES (?,?,?,?,?,?)')
    .run(id, req.params.moduleId, blid.trim(), description.trim(), '', order);
  res.json({ ...db.prepare('SELECT * FROM scenarios WHERE id = ?').get(id) as any, steps: [] });
});

app.put('/api/scenarios/:id', (req: AuthRequest, res) => {
  if (!canEdit(getFlowOwnerByScenario(req.params.id), req.user!.userId))
    return res.status(403).json({ error: 'You can only edit scenarios in your own flows' });
  const allowed = ['status','issue_type','date_tested','ado_ticket','evidence_url','evidence_image','remarks'] as const;
  const updates = Object.entries(req.body).filter(([k]) => (allowed as readonly string[]).includes(k));
  if (updates.length) {
    const set = updates.map(([k]) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE scenarios SET ${set} WHERE id = ?`).run(...updates.map(([,v]) => v), req.params.id);
  }
  res.json(db.prepare('SELECT * FROM scenarios WHERE id = ?').get(req.params.id));
});

app.delete('/api/scenarios/:id', (req: AuthRequest, res) => {
  if (!canEdit(getFlowOwnerByScenario(req.params.id), req.user!.userId))
    return res.status(403).json({ error: 'You can only delete scenarios from your own flows' });
  const sc = db.prepare('SELECT evidence_image FROM scenarios WHERE id = ?').get(req.params.id) as any;
  if (sc?.evidence_image) {
    const file = path.join(UPLOADS_DIR, path.basename(sc.evidence_image));
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  db.prepare('DELETE FROM scenarios WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Test Steps ────────────────────────────────────────────────────────────
app.post('/api/scenarios/:scenarioId/steps', (req: AuthRequest, res) => {
  if (!canEdit(getFlowOwnerByScenario(req.params.scenarioId), req.user!.userId))
    return res.status(403).json({ error: 'You can only add steps to scenarios in your own flows' });
  const { description, expected = '' } = req.body;
  if (!description?.trim()) return res.status(400).json({ error: 'description required' });
  const id = uuidv4();
  const order = nextOrder('test_steps', 'scenario_id', req.params.scenarioId);
  db.prepare('INSERT INTO test_steps (id, scenario_id, description, expected, order_idx) VALUES (?,?,?,?,?)')
    .run(id, req.params.scenarioId, description.trim(), expected.trim(), order);
  res.json(db.prepare('SELECT * FROM test_steps WHERE id = ?').get(id));
});

app.put('/api/steps/:id', (req: AuthRequest, res) => {
  if (!canEdit(getFlowOwnerByStep(req.params.id), req.user!.userId))
    return res.status(403).json({ error: 'You can only edit steps in your own flows' });
  const allowed = ['description','expected','status','issue_type','date_tested','ado_ticket','evidence_url','evidence_image','remarks'] as const;
  const updates = Object.entries(req.body).filter(([k]) => (allowed as readonly string[]).includes(k));
  if (updates.length) {
    const set = updates.map(([k]) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE test_steps SET ${set} WHERE id = ?`).run(...updates.map(([,v]) => v), req.params.id);
  }
  res.json(db.prepare('SELECT * FROM test_steps WHERE id = ?').get(req.params.id));
});

app.delete('/api/steps/:id', (req: AuthRequest, res) => {
  if (!canEdit(getFlowOwnerByStep(req.params.id), req.user!.userId))
    return res.status(403).json({ error: 'You can only delete steps in your own flows' });
  const step = db.prepare('SELECT evidence_image FROM test_steps WHERE id = ?').get(req.params.id) as any;
  if (step?.evidence_image) {
    const file = path.join(UPLOADS_DIR, path.basename(step.evidence_image));
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  db.prepare('DELETE FROM test_steps WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Module reorder ────────────────────────────────────────────────────────
app.put('/api/flows/:flowId/modules/reorder', (req: AuthRequest, res) => {
  const { moduleId, direction } = req.body as { moduleId: string; direction: -1 | 1 };
  if (!canEdit(getFlowOwner(req.params.flowId), req.user!.userId))
    return res.status(403).json({ error: 'You can only reorder modules in your own flows' });
  const mods = db.prepare('SELECT * FROM modules WHERE flow_id = ? ORDER BY order_idx').all(req.params.flowId) as any[];
  const idx = mods.findIndex(m => m.id === moduleId);
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= mods.length) return res.json({ ok: false });
  const swap = db.transaction(() => {
    db.prepare('UPDATE modules SET order_idx = ? WHERE id = ?').run(mods[newIdx].order_idx, mods[idx].id);
    db.prepare('UPDATE modules SET order_idx = ? WHERE id = ?').run(mods[idx].order_idx, mods[newIdx].id);
  });
  swap();
  res.json({ ok: true });
});

// ── Image upload ──────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  if (USE_CLOUDINARY) {
    try {
      const result = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'flow-tracker', resource_type: 'image' },
          (err, result) => err ? reject(err) : resolve(result)
        );
        stream.end(req.file!.buffer);
      });
      res.json({ url: result.secure_url });
    } catch (err) {
      res.status(500).json({ error: 'Cloudinary upload failed' });
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
app.listen(PORT, () => {
  console.log(`\n🚀 Server ready → http://localhost:${PORT}`);
  console.log(`📦 Database    → ${DB_PATH}`);
  console.log(`🖼  Uploads    → ${UPLOADS_DIR}`);
  console.log(`🌍 Mode        → ${IS_PROD ? 'production' : 'development'}\n`);
});
