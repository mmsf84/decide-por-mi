import { env } from 'cloudflare:workers';

import { buildFallbackAnalysis, type Product } from '@/lib/decision-engine';

type InspectResult = Product & { sourceText?: string; sourceStatus?: string };

function getRuntimeValue(key: string) {
  const cloudEnv = env as unknown as Record<string, unknown>;
  const nodeEnv = typeof process !== 'undefined' ? process.env : undefined;
  const cloudValue = cloudEnv[key];
  if (typeof cloudValue === 'string') return cloudValue.trim();
  return nodeEnv?.[key]?.trim() ?? '';
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

async function inspectProduct(product: Product): Promise<InspectResult> {
  try {
    const url = new URL(product.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported_protocol');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'decide-agent/0.1' } });
    clearTimeout(timeout);
    const html = await response.text();
    return { ...product, sourceText: cleanHtml(html), sourceStatus: String(response.status) };
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
  try {
    const body = await request.json() as { products?: Product[]; criteria?: unknown[]; question?: string; analysis?: unknown };
    const products = Array.isArray(body.products) ? body.products.slice(0, 8) : [];
    if (products.length < 2) return Response.json({ error: 'At least two product links are required.' }, { status: 400 });
    const inspected = await Promise.all(products.map(inspectProduct));
    const apiKey = getRuntimeValue('OLLAMA_API_KEY');
    if (!apiKey) return Response.json({ ...buildFallbackAnalysis(products, body.criteria ?? []), provider: 'demo' });

    const prompt = body.question
      ? `Responde a la pregunta del usuario sobre esta comparación. Mantén el criterio de no recomendar si no son comparables. Devuelve JSON con las mismas claves de análisis y agrega chatReply. Pregunta: ${body.question}`
      : 'Analiza los productos y prepara una decisión breve, convincente y trazable.';
    const context = inspected.map((product) => ({ id: product.id, name: product.name, url: product.url, category: product.category, price: product.price, merchant: product.merchant, page: product.sourceText })).slice(0, 8);
    const response = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-oss:120b-cloud',
        stream: false,
        messages: [
          { role: 'system', content: 'Eres un analista de compras en español. Compara solo productos comparables. Si difieren mucho en categoría o uso, comparable=false, winnerId=null y no recomiendes. Prioriza evidencia del contenido de los enlaces. Devuelve solo JSON válido con: comparable, verdict, winnerId, winnerName, overallScore, tradeoff, proofPoints (array), chatReply, canvas {eyebrow, headline, recommendation, rationale, nextStep}. El canvas debe ser conciso: máximo 2 frases por campo.' },
          { role: 'user', content: `${prompt}\nCriterios: ${JSON.stringify(body.criteria ?? [])}\nProductos: ${JSON.stringify(context)}` },
        ],
        options: { temperature: 0.15, think: 'low' },
      }),
    });
    if (!response.ok) return Response.json({ ...buildFallbackAnalysis(products, body.criteria ?? []), provider: 'demo' });
    const payload = await response.json() as { message?: { content?: string } };
    const result = normalizeModelResult(parseModelJson(payload.message?.content ?? ''), products);
    return Response.json({ ...result, provider: 'ollama-cloud' });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to analyze products.' }, { status: 500 });
  }
}
