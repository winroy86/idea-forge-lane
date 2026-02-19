
-- 1. Lock down user_roles: add RESTRICTIVE INSERT/UPDATE/DELETE policies
--    so no client can ever write role records directly.
--    Only the service-role key (used by edge functions) bypasses RLS.

CREATE POLICY "No direct role inserts by clients"
  ON public.user_roles
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "No direct role updates by clients"
  ON public.user_roles
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "No direct role deletes by clients"
  ON public.user_roles
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

-- 2. Prevent clients from reading the api_key column directly.
--    Drop the broad ALL policy and replace with column-safe policies.

DROP POLICY IF EXISTS "Users can manage their own provider credentials" ON public.user_provider_credentials;

-- SELECT: allow users to read their own rows but never the api_key column.
-- RLS cannot restrict individual columns, so we block direct SELECT entirely
-- and rely on the provider-secrets edge function (service role) as the only accessor.
-- Instead, we re-create the policy scoped to authenticated users owning the row,
-- but add a separate security note: the edge function already strips api_key from responses.

-- Re-create scoped CRUD policies (no api_key is ever returned by the edge function GET handler)
CREATE POLICY "Users can insert own provider credentials"
  ON public.user_provider_credentials
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own provider credentials"
  ON public.user_provider_credentials
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own provider credentials"
  ON public.user_provider_credentials
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Block direct SELECT of credentials from clients entirely.
-- All reads go through the provider-secrets edge function (service role key).
-- This prevents any client from doing: supabase.from('user_provider_credentials').select('api_key')
CREATE POLICY "Block direct client SELECT of provider credentials"
  ON public.user_provider_credentials
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (false);
