const MODEL = 'gpt-oss:120b';

function fallback(products) {
  const winner = [...products].sort((a, b) => (b.valueScore ?? 70) - (a.valueScore ?? 70))[0];
  return { comparable: true, verdict: `${winner?.name ?? 'La opción destacada'} tiene el mejor balance.`, winnerId: winner?.id ?? null, winnerName: winner?.name ?? '', overallScore: Math.round(((winner?.qualityScore ?? 70) * .45) + ((winner?.valueScore ?? 70) * .35) + 17.6), tradeoff: 'Verifica disponibilidad, garantía y precio final.', proofPoints: ['Calidad y valor ponderados.', 'Precio revisado desde el enlace.', 'Comparación basada en los criterios activos.'], chatReply: `Elegiría ${winner?.name ?? 'la opción con mayor valor'} por su balance de calidad y precio.`, canvas: { eyebrow: 'RECOMENDACIÓN', headline: `${winner?.name ?? 'La opción ganadora'} se queda con el primer lugar.`, recommendation: 'Es la alternativa más equilibrada para este uso.', rationale: 'Combina el mejor valor total entre las opciones comparables.', nextStep: 'Confirma stock, garantía y precio final.' } };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const products = Array.isArray(req.body?.products) ? req.body.products.slice(0, 8) : [];
  if (products.length < 2) return res.status(400).json({ error: 'At least two product links are required.' });
  if (!process.env.OLLAMA_API_KEY) return res.status(200).json({ ...fallback(products), provider: 'demo' });
  const context = await Promise.all(products.map(async (product) => {
    try { const page = await fetch(product.url, { headers: { 'User-Agent': 'decide-agent/0.1' } }); return { ...product, page: (await page.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 7500) }; } catch { return { ...product, page: '' }; }
  }));
  const response = await fetch('https://ollama.com/api/chat', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, stream: false, messages: [{ role: 'system', content: 'Eres un analista de compras en español. Devuelve solo JSON válido con comparable, verdict, winnerId, winnerName, overallScore, tradeoff, proofPoints, chatReply y canvas {eyebrow,headline,recommendation,rationale,nextStep}. No recomiendes productos no comparables.' }, { role: 'user', content: JSON.stringify({ products: context, criteria: req.body.criteria ?? [], question: req.body.question ?? '' }) }] }) });
  if (!response.ok) return res.status(200).json({ ...fallback(products), provider: 'demo' });
  const payload = await response.json();
  const raw = payload?.message?.content ?? '';
  const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
  try { return res.status(200).json({ ...fallback(products), ...JSON.parse(raw.slice(start, end + 1)), provider: 'ollama-cloud' }); } catch { return res.status(200).json({ ...fallback(products), provider: 'demo' }); }
}
