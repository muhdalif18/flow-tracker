import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// ── Middleware ────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Static uploads ────────────────────────────────────────────────────────
// In production Railway mounts a volume; DATA_DIR / UPLOADS_DIR env vars override defaults
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// ── Multer ────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => cb(null, `${uuidv4()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── Database ──────────────────────────────────────────────────────────────
const DB_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, 'tracker.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS flows (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    order_idx   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS modules (
    id        TEXT PRIMARY KEY,
    flow_id   TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    label     TEXT NOT NULL,
    name      TEXT NOT NULL,
    side      TEXT NOT NULL DEFAULT 'eDS',
    note      TEXT NOT NULL DEFAULT '',
    order_idx INTEGER NOT NULL DEFAULT 0
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

// ── Helpers ───────────────────────────────────────────────────────────────
function getAllFlows() {
  const flows     = db.prepare('SELECT * FROM flows ORDER BY order_idx, created_at').all() as any[];
  const modules   = db.prepare('SELECT * FROM modules ORDER BY order_idx').all() as any[];
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

// ── Routes ────────────────────────────────────────────────────────────────

// Flows
app.get('/api/flows', (_req, res) => res.json(getAllFlows()));

app.post('/api/flows', (req, res) => {
  const { name, description = '' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  const order = nextOrder('flows', 'id', '');  // global order
  db.prepare('INSERT INTO flows (id, name, description, order_idx) VALUES (?,?,?,?)').run(id, name.trim(), description.trim(), order);
  res.json(getAllFlows().find(f => f.id === id));
});

app.delete('/api/flows/:id', (req, res) => {
  db.prepare('DELETE FROM flows WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Modules
app.post('/api/flows/:flowId/modules', (req, res) => {
  const { label, name, side = 'eDS', note = '' } = req.body;
  if (!label?.trim() || !name?.trim()) return res.status(400).json({ error: 'label and name required' });
  const id = uuidv4();
  const order = nextOrder('modules', 'flow_id', req.params.flowId);
  db.prepare('INSERT INTO modules (id, flow_id, label, name, side, note, order_idx) VALUES (?,?,?,?,?,?,?)').run(id, req.params.flowId, label.trim(), name.trim(), side, note.trim(), order);
  res.json({ ...db.prepare('SELECT * FROM modules WHERE id = ?').get(id) as any, scenarios: [] });
});

app.put('/api/modules/:id', (req, res) => {
  const { label, name, side, note, order_idx } = req.body;
  if (order_idx !== undefined) db.prepare('UPDATE modules SET order_idx = ? WHERE id = ?').run(order_idx, req.params.id);
  if (label !== undefined)     db.prepare('UPDATE modules SET label=?, name=?, side=?, note=? WHERE id=?').run(label, name, side, note, req.params.id);
  const mod = db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id) as any;
  const scenarios = db.prepare('SELECT * FROM scenarios WHERE module_id = ? ORDER BY order_idx').all(req.params.id);
  res.json({ ...mod, scenarios });
});

app.delete('/api/modules/:id', (req, res) => {
  db.prepare('DELETE FROM modules WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Scenarios
app.post('/api/modules/:moduleId/scenarios', (req, res) => {
  const { blid, description } = req.body;
  if (!blid?.trim() || !description?.trim()) return res.status(400).json({ error: 'blid and description required' });
  const id = uuidv4();
  const order = nextOrder('scenarios', 'module_id', req.params.moduleId);
  db.prepare('INSERT INTO scenarios (id, module_id, blid, description, expected, order_idx) VALUES (?,?,?,?,?,?)').run(id, req.params.moduleId, blid.trim(), description.trim(), '', order);
  res.json({ ...db.prepare('SELECT * FROM scenarios WHERE id = ?').get(id) as any, steps: [] });
});

app.put('/api/scenarios/:id', (req, res) => {
  const allowed = ['status','issue_type','date_tested','ado_ticket','evidence_url','evidence_image','remarks'] as const;
  const updates = Object.entries(req.body).filter(([k]) => (allowed as readonly string[]).includes(k));
  if (updates.length) {
    const set = updates.map(([k]) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE scenarios SET ${set} WHERE id = ?`).run(...updates.map(([,v]) => v), req.params.id);
  }
  res.json(db.prepare('SELECT * FROM scenarios WHERE id = ?').get(req.params.id));
});

app.delete('/api/scenarios/:id', (req, res) => {
  const sc = db.prepare('SELECT evidence_image FROM scenarios WHERE id = ?').get(req.params.id) as any;
  if (sc?.evidence_image) {
    const file = path.join(UPLOADS_DIR, path.basename(sc.evidence_image));
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  db.prepare('DELETE FROM scenarios WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Test steps
app.post('/api/scenarios/:scenarioId/steps', (req, res) => {
  const { description, expected = '' } = req.body;
  if (!description?.trim()) return res.status(400).json({ error: 'description required' });
  const id = uuidv4();
  const order = nextOrder('test_steps', 'scenario_id', req.params.scenarioId);
  db.prepare('INSERT INTO test_steps (id, scenario_id, description, expected, order_idx) VALUES (?,?,?,?,?)').run(id, req.params.scenarioId, description.trim(), expected.trim(), order);
  res.json(db.prepare('SELECT * FROM test_steps WHERE id = ?').get(id));
});

app.put('/api/steps/:id', (req, res) => {
  const allowed = ['description','expected','status','issue_type','date_tested','ado_ticket','evidence_url','evidence_image','remarks'] as const;
  const updates = Object.entries(req.body).filter(([k]) => (allowed as readonly string[]).includes(k));
  if (updates.length) {
    const set = updates.map(([k]) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE test_steps SET ${set} WHERE id = ?`).run(...updates.map(([,v]) => v), req.params.id);
  }
  res.json(db.prepare('SELECT * FROM test_steps WHERE id = ?').get(req.params.id));
});

app.delete('/api/steps/:id', (req, res) => {
  const step = db.prepare('SELECT evidence_image FROM test_steps WHERE id = ?').get(req.params.id) as any;
  if (step?.evidence_image) {
    const file = path.join(UPLOADS_DIR, path.basename(step.evidence_image));
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  db.prepare('DELETE FROM test_steps WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Move module up/down
app.put('/api/flows/:flowId/modules/reorder', (req, res) => {
  const { moduleId, direction } = req.body as { moduleId: string; direction: -1 | 1 };
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

// Image upload
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ── Serve React app in production ────────────────────────────────────────
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
