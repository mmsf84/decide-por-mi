export type Product = {
  id: string;
  url: string;
  name: string;
  merchant: string;
  price: number | null;
  currency?: string;
  category: string;
  shipping?: string;
  qualityScore: number;
  valueScore: number;
  accent?: 'blue' | 'amber';
};

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string };

export type Analysis = {
  comparable: boolean;
  verdict: string;
  winnerId?: string | null;
  winnerName?: string;
  overallScore: number;
  tradeoff: string;
  proofPoints: string[];
  chatReply: string;
  canvas: {
    eyebrow: string;
    headline: string;
    recommendation: string;
    rationale: string;
    nextStep: string;
  };
};

export function buildFallbackAnalysis(products: Product[], _criteria: unknown[]): Analysis {
  const winner = [...products].sort((a, b) => b.valueScore - a.valueScore)[0] ?? products[0];
  const qualityLeader = [...products].sort((a, b) => b.qualityScore - a.qualityScore)[0] ?? winner;
  const priceLeader = [...products].filter((product) => product.price !== null).sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))[0] ?? winner;
  const overallScore = Math.round((winner?.qualityScore ?? 0) * 0.45 + (winner?.valueScore ?? 0) * 0.35 + 88 * 0.2);
  const isClose = Math.abs((qualityLeader?.qualityScore ?? 0) - (winner?.qualityScore ?? 0)) <= 3;
  return {
    comparable: true,
    verdict: `${winner?.name ?? 'La opción destacada'} tiene el mejor balance de calidad y precio.`,
    winnerId: winner?.id,
    winnerName: winner?.name,
    overallScore,
    tradeoff: `${priceLeader?.name ?? 'La alternativa más económica'} puede ahorrar dinero, pero ${isClose ? 'la diferencia de calidad es pequeña.' : 'cede algo de calidad para conseguirlo.'}`,
    proofPoints: [
      `${qualityLeader?.name ?? 'La opción ganadora'} lidera en señales de calidad.`,
      `${priceLeader?.name ?? 'La alternativa más económica'} marca el precio de entrada más bajo.`,
      'La recomendación pondera calidad, precio y valor de uso.',
    ],
    chatReply: `Mi elección sería ${winner?.name ?? 'la opción con mayor valor'}: entrega el balance más convincente entre calidad y precio. ${priceLeader?.id !== winner?.id ? `Si tu prioridad es gastar menos, revisaría ${priceLeader?.name}.` : ''}`,
    canvas: {
      eyebrow: 'RECOMENDACIÓN',
      headline: `${winner?.name ?? 'La opción ganadora'} se queda con el primer lugar.`,
      recommendation: 'Es la alternativa más equilibrada para el uso descrito: mejor resultado total sin pagar de más por una diferencia marginal.',
      rationale: `${winner?.name ?? 'La opción ganadora'} combina ${winner?.qualityScore ?? 0}/100 en calidad y ${winner?.valueScore ?? 0}/100 en valor de uso.`,
      nextStep: 'Confirma stock, garantía y el precio final antes de comprar.',
    },
  };
}
