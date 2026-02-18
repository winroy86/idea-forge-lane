
# Full System Audit & Fix Plan

## Root Cause Analysis

After a thorough review of all code paths, I identified **5 critical bugs** that prevent the system from working correctly in either local or server mode.

---

## Bug 1 (Critical): `user_provider_credentials` Table Does Not Exist

The entire provider-storage architecture depends on a database table that was **never migrated**. The `supabase/functions/provider-secrets/index.ts` and the lookup inside `agent-chat/index.ts` both query `user_provider_credentials`, but the database schema is completely empty (`Tables: { [_ in never]: never }`). 

**Effect:** Every provider save/load/lookup silently fails. Users cannot store or retrieve provider keys server-side.

**Fix:** Create the migration for `user_provider_credentials` with proper RLS policies.

---

## Bug 2 (Critical): `callViaEdgeFunction` Sends Anon Key Instead of User JWT

In `src/lib/llm.ts` (line 303), `callViaEdgeFunction` sends `VITE_SUPABASE_PUBLISHABLE_KEY` (the anon key) as the `Authorization: Bearer` header:

```typescript
Authorization: `Bearer ${supabaseKey}`,  // ← This is the ANON key, not a user JWT
```

The `agent-chat` edge function then tries to verify this token via `admin.auth.getUser(token)` to look up the user's stored API keys. Because the anon key has no `sub` claim, this always returns 403 → `userData.user` is null → `resolvedApiKey` remains undefined.

The auth logs confirm this: `403: invalid claim: missing sub claim` on every agent call.

**Effect:** User-stored API keys are NEVER retrieved from the database — even if the table existed. The global `OPENAI_API_KEY` fallback for `openai` provider works, but all other providers (anthropic, gemini, custom, azure) always fail.

**Fix:** In `callViaEdgeFunction`, fetch the user's active Supabase session JWT and send it as the Bearer token. Fall back to the anon key only when no session exists (for the lovable provider which doesn't need key lookup).

---

## Bug 3 (Critical): `provider-secrets` Edge Function Is Not JWT-Verified

`supabase/config.toml` only sets `verify_jwt = false` for `agent-chat`, but not for `provider-secrets`. This means `provider-secrets` enforces JWT verification at the gateway level even before the function code runs. Since `ProvidersPage.tsx` correctly sends the session access token, this should be fine — but it needs `verify_jwt = false` in config so the function's own auth logic can handle it consistently.

Actually, looking more carefully — `ProvidersPage.tsx` does correctly fetch the session token via `getAuthToken()`. The provider-secrets function does also validate the JWT manually. So this is OK as-is.

---

## Bug 4 (Moderate): Provider Hydration Runs Before Login

`App.tsx` calls `hydrateProvidersFromServer()` at mount time (line 25-28). At that moment, the user may not be logged in — `supabase.auth.getSession()` returns `null`. The hydration silently exits, sets `hydrationComplete = true`, and the `hydrationPromise` is cached. This means that even **after** login, `waitForProviderHydration()` immediately returns (it thinks hydration is done) without actually fetching the user's providers.

**Fix:** Reset the hydration cache after successful login, or hydrate lazily per-call. The simplest fix is to not cache the promise globally and always re-check the session.

---

## Bug 5 (Moderate): Auth Architecture Conflict — Supabase Auth vs. Local Auth

The system has two competing auth systems:
- `src/lib/auth.ts` — a custom localStorage session using `admin / password` fallback
- Supabase Auth — email/password handled by the Supabase client

`ProtectedRoute.tsx` uses `getSession()` from `src/lib/auth.ts`, which checks for a session token in localStorage. But Supabase Auth manages its own session in localStorage. These two systems are completely disconnected.

**Effect:** When the app is deployed (Lovable Cloud), Supabase Auth is available but the `ProtectedRoute` only checks the local custom session — so the app either lets everyone in (if `AUTH_ENABLED` is not set) or blocks everyone (if it is set, since no Supabase login was ever built).

**Fix:** Unify auth — replace the custom login/session with Supabase Auth (email/password). This enables proper user sessions (JWTs) that can be used to authenticate edge function calls.

---

## Technical Implementation Plan

### Step 1: Database Migration — Create `user_provider_credentials` Table

```sql
CREATE TABLE public.user_provider_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  api_key TEXT,
  base_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row-level security: users can only access their own credentials
ALTER TABLE public.user_provider_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own credentials"
  ON public.user_provider_credentials
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_provider_credentials_updated_at
  BEFORE UPDATE ON public.user_provider_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

### Step 2: Replace Login Page with Supabase Auth

Replace `src/pages/LoginPage.tsx` with Supabase email/password auth:
- Sign up form (email + password)
- Sign in form
- Password reset link
- Use `supabase.auth.signInWithPassword()` and `supabase.auth.signUp()`

### Step 3: Update `ProtectedRoute` to Use Supabase Session

Replace the local `getSession()` check with `supabase.auth.getSession()` — redirect to `/login` if no Supabase session exists.

### Step 4: Fix `callViaEdgeFunction` to Send User JWT

In `src/lib/llm.ts`, update `callViaEdgeFunction` to:
1. Call `supabase.auth.getSession()` to get the user's access token
2. Send `Authorization: Bearer ${session.access_token}` when a session exists
3. Fall back to the anon key for requests that don't need user lookup (lovable provider)

### Step 5: Fix Provider Hydration Cache

In `src/lib/providerHydration.ts`:
- Remove the module-level `hydrationPromise` caching
- Always re-run hydration when a user session is present
- Export a `resetHydration()` function to be called after login

Call `resetHydration()` + `hydrateProvidersFromServer()` from the login success handler.

### Step 6: Update `supabase/config.toml` for Edge Functions

Add `verify_jwt = false` to all functions that do their own JWT validation (`provider-secrets`, `generate-persona`, `extract-document`), so the Supabase gateway doesn't block requests with non-standard tokens.

### Step 7: Fix `agent-chat` Edge Function Auth Verification

The function already handles the case where `userData.user` is null (it just skips the DB lookup). But with the JWT fix in Step 4, user lookup will now work correctly. The existing `OPENAI_API_KEY` environment fallback for openai provider will still work for agents using the global key.

---

## Local Mode Behavior (No Supabase Auth Session)

When running locally (e.g. Ollama, or local dev mode):
- `getLocalDevMode()` flag is checked — API keys stored in localStorage
- `callViaEdgeFunction` falls back to anon key (no user lookup needed)
- `callOpenAICompatible` / `callAnthropic` / `callGemini` call APIs directly from the browser using localStorage keys

This path already works correctly and requires no changes.

---

## Files to Change

| File | Change |
|---|---|
| `supabase/migrations/YYYYMMDD_create_provider_credentials.sql` | New — creates `user_provider_credentials` table with RLS |
| `supabase/config.toml` | Add `verify_jwt = false` for `provider-secrets`, `generate-persona`, `extract-document` |
| `src/pages/LoginPage.tsx` | Replace local auth with Supabase email/password sign-in/up |
| `src/components/ProtectedRoute.tsx` | Check Supabase session instead of local session |
| `src/lib/llm.ts` | `callViaEdgeFunction` — send user JWT, not anon key |
| `src/lib/providerHydration.ts` | Remove stale promise cache; add `resetHydration()` |
| `src/lib/auth.ts` | Remove or stub out (replaced by Supabase auth) |
| `src/App.tsx` | Hydrate providers after auth state confirmed |
