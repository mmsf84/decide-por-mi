import {
  getAuthenticatedSupabase,
  unauthorizedResponse,
} from '@/lib/supabase-server';

type DecisionBody = {
  title?: unknown;
  criteria?: unknown;
  products?: Array<Record<string, unknown>>;
  analysis?: Record<string, unknown>;
  messages?: Array<Record<string, unknown>>;
};

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizedRole(value: unknown) {
  return value === 'user' ? 'user' : 'assistant';
}

export async function GET(request: Request) {
  const authenticated = await getAuthenticatedSupabase(request);
  if (!authenticated) return unauthorizedResponse();

  const comparisonId = new URL(request.url).searchParams.get('id');
  let query = authenticated.client
    .from('comparisons')
    .select('id, title, criteria, analysis, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (comparisonId) {
    query = query.eq('id', comparisonId).limit(1);
  } else {
    query = query.limit(8);
  }

  const { data: comparisons, error } = await query;
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!comparisonId) {
    return Response.json({ decisions: comparisons ?? [] });
  }

  const comparison = comparisons?.[0];
  if (!comparison) {
    return Response.json({ error: 'Comparación no encontrada.' }, { status: 404 });
  }

  const [{ data: products, error: productsError }, { data: messages, error: messagesError }] =
    await Promise.all([
      authenticated.client
        .from('comparison_products')
        .select('id, comparison_id, url, name, details, created_at')
        .eq('comparison_id', comparisonId)
        .order('created_at', { ascending: true }),
      authenticated.client
        .from('comparison_messages')
        .select('id, comparison_id, role, content, created_at')
        .eq('comparison_id', comparisonId)
        .order('created_at', { ascending: true }),
    ]);

  if (productsError || messagesError) {
    return Response.json(
      { error: productsError?.message ?? messagesError?.message },
      { status: 500 },
    );
  }

  return Response.json({ decision: { ...comparison, products, messages } });
}

export async function POST(request: Request) {
  const authenticated = await getAuthenticatedSupabase(request);
  if (!authenticated) return unauthorizedResponse();

  try {
    const body = (await request.json()) as DecisionBody;
    const products = Array.isArray(body.products) ? body.products : [];
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const criteria = Array.isArray(body.criteria) ? body.criteria : [];
    const analysis = objectValue(body.analysis);

    const { data: comparison, error: comparisonError } = await authenticated.client
      .from('comparisons')
      .insert({
        user_id: authenticated.user.id,
        title: stringValue(body.title, 'Nueva comparación'),
        criteria,
        analysis,
      })
      .select('id, created_at')
      .single();

    if (comparisonError || !comparison) {
      return Response.json(
        { error: comparisonError?.message ?? 'No se pudo crear la comparación.' },
        { status: 500 },
      );
    }

    const comparisonId = comparison.id;
    const productRows = products
      .map((product) => ({
        comparison_id: comparisonId,
        user_id: authenticated.user.id,
        url: stringValue(product.url),
        name: stringValue(product.name, 'Producto por identificar'),
        details: product,
      }))
      .filter((product) => product.url);

    const messageRows = messages
      .map((message) => ({
        comparison_id: comparisonId,
        user_id: authenticated.user.id,
        role: normalizedRole(message.role),
        content: stringValue(message.content),
      }))
      .filter((message) => message.content);

    const [productsResult, messagesResult] = await Promise.all([
      productRows.length
        ? authenticated.client.from('comparison_products').insert(productRows)
        : Promise.resolve({ error: null }),
      messageRows.length
        ? authenticated.client.from('comparison_messages').insert(messageRows)
        : Promise.resolve({ error: null }),
    ]);

    if (productsResult.error || messagesResult.error) {
      await authenticated.client.from('comparisons').delete().eq('id', comparisonId);
      return Response.json(
        { error: productsResult.error?.message ?? messagesResult.error?.message },
        { status: 500 },
      );
    }

    return Response.json({
      id: comparisonId,
      savedAt: comparison.created_at,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'No se pudo guardar la decisión.' },
      { status: 500 },
    );
  }
}
