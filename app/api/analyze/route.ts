import {
  getAuthenticatedSupabase,
  unauthorizedResponse,
} from '@/lib/supabase-server';
import { buildFallbackAnalysis, type Product } from '@/lib/decision-engine';

type InspectResult = Product & { sourceText?: string; sourceStatus?: string };

function getRuntimeValue(key: string) {
  return typeof process !== "undefined" ? process.env[key]?.trim() ?? "" : "";
}

function cleanHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 7500);
}

function readHtmlAttribute(tag: string, name: string) {
  const doubleQuoted = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i'));
  const singleQuoted = tag.match(new RegExp(name + "\\s*=\\s*'([^']*)'", 'i'));
  const bare = tag.match(new RegExp(name + '\\s*=\\s*([^\\s>]+)', 'i'));
  return normalizeText(doubleQuoted?.[1] ?? singleQuoted?.[1] ?? bare?.[1] ?? '');
}

function normalizeText(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function metaValue(html: string, wantedKey: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const wanted = wantedKey.toLowerCase();
  for (const tag of tags) {
    const key = readHtmlAttribute(tag, 'property') || readHtmlAttribute(tag, 'name');
    if (key.toLowerCase() === wanted) return readHtmlAttribute(tag, 'content');
  }
  return '';
}

function titleValue(html: string) {
  return normalizeText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
}

function findProductSchema(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findProductSchema(item);
      if (match) return match;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  const type = value['@type'];
  const isProductType =
    (typeof type === 'string' && type.toLowerCase().includes('product')) ||
    (Array.isArray(type) && type.some((item) => typeof item === 'string' && item.toLowerCase().includes('product')));
  if (isProductType) return value;
  for (const nested of Object.values(value)) {
    const match = findProductSchema(nested);
    if (match) return match;
  }
  return null;
}

function jsonLdProduct(html: string) {
  const scripts = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  for (const script of scripts) {
    const raw = script.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      const parsed = JSON.parse(raw) as unknown;
      const product = findProductSchema(parsed);
      if (product) return product;
    } catch {
      // Some stores include invalid JSON-LD; other metadata can still be used.
    }
  }
  return null;
}

function numericValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^\d,.-]/g, '');
  if (!cleaned) return null;
  const comma = cleaned.lastIndexOf(',');
  const dot = cleaned.lastIndexOf('.');
  const normalized = comma > dot
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function productMetadata(html: string, product: Product) {
  const schema = jsonLdProduct(html);
  const offersValue = schema?.offers;
  const offers = Array.isArray(offersValue)
    ? offersValue.find((value) => isRecord(value))
    : isRecord(offersValue)
      ? offersValue
      : {};
  const schemaBrand = isRecord(schema?.brand) ? schema.brand.name : schema?.brand;
  const schemaName = typeof schema?.name === 'string' ? schema.name : '';
  const name = normalizeText(
    schemaName ||
    metaValue(html, 'og:title') ||
    metaValue(html, 'twitter:title') ||
    titleValue(html) ||
    product.name,
  );
  const merchant = normalizeText(
    metaValue(html, 'og:site_name') ||
    (typeof schemaBrand === 'string' ? schemaBrand : '') ||
    product.merchant ||
    new URL(product.url).hostname.replace(/^www\./, ''),
  );
  const rawPrice = offers.price ?? schema?.price ?? metaValue(html, 'product:price:amount');
  const price = numericValue(rawPrice) ?? numericValue(metaValue(html, 'og:price:amount')) ?? product.price;
  const rawCurrency = offers.priceCurrency ?? schema?.priceCurrency ?? metaValue(html, 'product:price:currency');
  const currency = normalizeText(String(rawCurrency || product.currency || 'USD'));
  const category = normalizeText(
    typeof schema?.category === 'string' ? schema.category : product.category,
  );
  return { name, merchant, price, currency, category };
}

function publicProducts(products: InspectResult[]) {
  return products.map(({ sourceText: _sourceText, sourceStatus: _sourceStatus, ...product }) => product);
}

async function inspectProduct(product: Product): Promise<InspectResult> {
  try {
    const url = new URL(product.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported_protocol');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'decide-agent/0.1' } });
    clearTimeout(timeout);
    const html = await response.text();
    return { ...product, ...productMetadata(html, product), sourceText: cleanHtml(html), sourceStatus: String(response.status) };
  } catch {
    return { ...product, sourceText: '', sourceStatus: 'unavailable' };
  }
}

function parseModelJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { return JSON.parse(fenced.slice(start, end + 1)); } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function normalizeModelResult(result: unknown, products: Product[]) {
  const fallback = buildFallbackAnalysis(products, []);
  const model = isRecord(result) ? result : {};
  const comparable = model.comparable === true;
  const winnerId = products.some((product) => product.id === model.winnerId) ? model.winnerId : fallback.winnerId;
  const winner = products.find((product) => product.id === winnerId) ?? products[0];
  const canvas = isRecord(model.canvas) ? model.canvas : {};
  const points = Array.isArray(model.proofPoints) ? model.proofPoints.map((point) => stringValue(point, '')).filter(Boolean).slice(0, 4) : fallback.proofPoints;
  return {
    ...fallback,
    comparable,
    verdict: stringValue(model.verdict, fallback.verdict),
    winnerId: comparable ? (typeof winnerId === 'string' ? winnerId : null) : null,
    winnerName: comparable ? stringValue(model.winnerName, winner?.name ?? '') : undefined,
    overallScore: Math.max(0, Math.min(100, typeof model.overallScore === 'number' ? model.overallScore : fallback.overallScore)),
    tradeoff: stringValue(model.tradeoff, fallback.tradeoff),
    proofPoints: points.length ? points : fallback.proofPoints,
    chatReply: stringValue(model.chatReply, fallback.chatReply),
    canvas: {
      eyebrow: stringValue(canvas.eyebrow, fallback.canvas.eyebrow),
      headline: stringValue(canvas.headline, fallback.canvas.headline),
      recommendation: stringValue(canvas.recommendation, fallback.canvas.recommendation),
      rationale: stringValue(canvas.rationale, fallback.canvas.rationale),
      nextStep: stringValue(canvas.nextStep, fallback.canvas.nextStep),
    },
  };
}

export async function POST(request: Request) {
  const authenticated = await getAuthenticatedSupabase(request);
  if (!authenticated) return unauthorizedResponse();

  try {
    const body = await request.json() as { products?: Product[]; criteria?: unknown[]; question?: string; analysis?: unknown };
    const products = Array.isArray(body.products) ? body.products.slice(0, 8) : [];
    if (products.length < 2) return Response.json({ error: 'At least two product links are required.' }, { status: 400 });
    const inspected = await Promise.all(products.map(inspectProduct));
    const apiKey = getRuntimeValue('OLLAMA_API_KEY');
    if (!apiKey) return Response.json({ ...buildFallbackAnalysis(inspected, body.criteria ?? []), products: publicProducts(inspected), provider: 'demo' });

    const prompt = body.question
      ? `Responde a la pregunta del usuario sobre esta comparación. Mantén el criterio de no recomendar si no son comparables. Devuelve JSON con las mismas claves de análisis y agrega chatReply. Pregunta: ${body.question}`
      : 'Analiza los productos y prepara una decisión breve, convincente y trazable.';
    const context = inspected.map((product) => ({ id: product.id, name: product.name, url: product.url, category: product.category, price: product.price, merchant: product.merchant, page: product.sourceText })).slice(0, 8);
    const response = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-oss:120b',
        stream: false,
        messages: [
          { role: 'system', content: 'Eres un analista de compras en español. Compara solo productos comparables. Si difieren mucho en categoría o uso, comparable=false, winnerId=null y no recomiendes. Prioriza evidencia del contenido de los enlaces. Devuelve solo JSON válido con: comparable, verdict, winnerId, winnerName, overallScore, tradeoff, proofPoints (array), chatReply, canvas {eyebrow, headline, recommendation, rationale, nextStep}. El canvas debe ser conciso: máximo 2 frases por campo.' },
          { role: 'user', content: `${prompt}\nCriterios: ${JSON.stringify(body.criteria ?? [])}\nProductos: ${JSON.stringify(context)}` },
        ],
        options: { temperature: 0.15, think: 'low' },
      }),
    });
    if (!response.ok) return Response.json({ ...buildFallbackAnalysis(inspected, body.criteria ?? []), products: publicProducts(inspected), provider: 'demo' });
    const payload = await response.json() as { message?: { content?: string } };
    const result = normalizeModelResult(parseModelJson(payload.message?.content ?? ''), inspected);
    return Response.json({ ...result, products: publicProducts(inspected), provider: 'ollama-cloud' });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to analyze products.' }, { status: 500 });
  }
}
