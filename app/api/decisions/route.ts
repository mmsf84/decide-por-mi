import { env } from 'cloudflare:workers';

function id(prefix: string) { return `${prefix}_${crypto.randomUUID()}`; }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export async function GET() {
  try {
    const database = (env as unknown as { DB?: D1Database }).DB;
    if (!database) return Response.json({ decisions: [] });
    const result = await database.prepare('SELECT id, title, created_at, analysis FROM comparisons ORDER BY created_at DESC LIMIT 8').all();
    return Response.json({ decisions: result.results ?? [] });
  } catch {
    return Response.json({ decisions: [] });
  }
}

export async function POST(request: Request) {
  try {
    const database = (env as unknown as { DB?: D1Database }).DB;
    if (!database) return Response.json({ error: 'SQLite binding is not configured.' }, { status: 503 });
    const body = await request.json() as { title?: string; criteria?: unknown; products?: Array<Record<string, unknown>>; analysis?: Record<string, unknown>; messages?: Array<Record<string, unknown>> };
    const comparisonId = id('cmp');
    const products = Array.isArray(body.products) ? body.products : [];
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const now = Date.now();
    const analysis = body.analysis ?? {};
    const canvas = isRecord(analysis.canvas) ? analysis.canvas : {};
    const statements: D1PreparedStatement[] = [database.prepare('INSERT INTO comparisons (id, title, criteria, analysis, canvas, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(comparisonId, stringValue(body.title, 'Nueva comparación'), JSON.stringify(body.criteria ?? []), JSON.stringify(analysis), JSON.stringify(canvas), now)];
    for (const product of products) statements.push(database.prepare('INSERT INTO comparison_products (id, comparison_id, url, name, merchant, category, price, currency, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id('product'), comparisonId, stringValue(product.url), stringValue(product.name), stringValue(product.merchant), stringValue(product.category, 'otro'), typeof product.price === 'number' ? product.price : null, stringValue(product.currency, 'USD'), JSON.stringify(product)));
    for (const message of messages) statements.push(database.prepare('INSERT INTO comparison_messages (id, comparison_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').bind(id('message'), comparisonId, stringValue(message.role, 'assistant'), stringValue(message.content), now));
    await database.batch(statements);
    return Response.json({ id: comparisonId, savedAt: now });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to save decision.' }, { status: 500 });
  }
}
