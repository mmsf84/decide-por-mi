import { DatabaseSync } from 'node:sqlite';

const path = process.env.SQLITE_DB_PATH || '/tmp/decide-por-mi.sqlite';
let database;

function getDatabase() {
  if (!database) {
    database = new DatabaseSync(path);
    database.exec(`CREATE TABLE IF NOT EXISTS comparisons (id TEXT PRIMARY KEY, title TEXT NOT NULL, criteria TEXT NOT NULL, analysis TEXT NOT NULL, canvas TEXT NOT NULL, created_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS idx_comparisons_created_at ON comparisons(created_at); CREATE TABLE IF NOT EXISTS comparison_products (id TEXT PRIMARY KEY, comparison_id TEXT NOT NULL, url TEXT NOT NULL, name TEXT NOT NULL, merchant TEXT NOT NULL, category TEXT NOT NULL, price REAL, currency TEXT, metadata TEXT NOT NULL); CREATE TABLE IF NOT EXISTS comparison_messages (id TEXT PRIMARY KEY, comparison_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL);`);
  }
  return database;
}

export default function handler(req, res) {
  try {
    const db = getDatabase();
    if (req.method === 'GET') return res.status(200).json({ decisions: db.prepare('SELECT id, title, created_at, analysis FROM comparisons ORDER BY created_at DESC LIMIT 8').all() });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body || {}; const comparisonId = `cmp_${crypto.randomUUID()}`; const now = Date.now();
    db.prepare('INSERT INTO comparisons (id,title,criteria,analysis,canvas,created_at) VALUES (?,?,?,?,?,?)').run(comparisonId, body.title || 'Nueva comparación', JSON.stringify(body.criteria || []), JSON.stringify(body.analysis || {}), JSON.stringify(body.analysis?.canvas || {}), now);
    for (const product of body.products || []) db.prepare('INSERT INTO comparison_products (id,comparison_id,url,name,merchant,category,price,currency,metadata) VALUES (?,?,?,?,?,?,?,?,?)').run(`product_${crypto.randomUUID()}`, comparisonId, product.url || '', product.name || '', product.merchant || '', product.category || 'otro', typeof product.price === 'number' ? product.price : null, product.currency || 'USD', JSON.stringify(product));
    for (const message of body.messages || []) db.prepare('INSERT INTO comparison_messages (id,comparison_id,role,content,created_at) VALUES (?,?,?,?,?)').run(`message_${crypto.randomUUID()}`, comparisonId, message.role || 'assistant', message.content || '', now);
    return res.status(200).json({ id: comparisonId, savedAt: now });
  } catch (error) { return res.status(500).json({ error: error?.message || 'Unable to save decision.' }); }
}
