import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

type AuthenticatedSupabase = {
  client: SupabaseClient;
  user: User;
};

function getServerConfig() {
  const nodeEnv = typeof process !== 'undefined' ? process.env : undefined;
  const url =
    nodeEnv?.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
  const key =
    nodeEnv?.SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Faltan SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en las variables de entorno.',
    );
  }

  return { key, url };
}

export async function getAuthenticatedSupabase(
  request: Request,
): Promise<AuthenticatedSupabase | null> {
  const authorization = request.headers.get('Authorization');

  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const { key, url } = getServerConfig();
  const client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: { Authorization: authorization },
    },
  });

  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    return null;
  }

  return { client, user };
}

export function unauthorizedResponse() {
  return Response.json(
    { error: 'Autenticación requerida.' },
    { status: 401 },
  );
}
