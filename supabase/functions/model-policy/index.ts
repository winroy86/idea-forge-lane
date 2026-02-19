import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // Create a client with the user's JWT to respect RLS
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  // Admin client for write operations (after we verify admin status)
  const adminClient = createClient(supabaseUrl, serviceKey);

  // Verify caller identity
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // GET — any authenticated user can fetch the policy
  if (req.method === 'GET') {
    const { data, error } = await userClient
      .from('allowed_models')
      .select('*')
      .order('provider')
      .order('label');
    if (error) return json({ error: error.message }, 500);
    return json({ models: data ?? [] });
  }

  // POST / DELETE — admin only
  const { data: roleData } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleData) {
    return json({ error: 'Forbidden — admin only' }, 403);
  }

  if (req.method === 'POST') {
    const body = await req.json();
    const { provider, model_id, label, is_allowed } = body;
    if (!provider || !model_id) return json({ error: 'provider and model_id are required' }, 400);

    const { data, error } = await adminClient
      .from('allowed_models')
      .upsert({ provider, model_id, label: label ?? model_id, is_allowed: is_allowed ?? true }, { onConflict: 'provider,model_id' })
      .select()
      .single();

    if (error) return json({ error: error.message }, 500);
    return json({ model: data });
  }

  if (req.method === 'DELETE') {
    const body = await req.json();
    const { provider, model_id } = body;
    if (!provider || !model_id) return json({ error: 'provider and model_id are required' }, 400);

    const { error } = await adminClient
      .from('allowed_models')
      .delete()
      .eq('provider', provider)
      .eq('model_id', model_id);

    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  return json({ error: 'Method not allowed' }, 405);
});
