import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadProviderKeyringFromEnv, encryptProviderSecret, decryptProviderSecret, type ProviderSecretEnvelope } from "../_shared/provider-secrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !serviceRole) throw new Error("Supabase env not configured");

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Use getClaims() — the modern JWT-verification approach
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub as string;

    // Service-role client for database ops (bypasses RLS)
    const admin = createClient(supabaseUrl, serviceRole);

    if (req.method === "GET") {
      const { data, error } = await admin
        .from("user_provider_credentials")
        .select("id, provider, label, base_url, is_active, created_at, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ providers: data ?? [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST") {
      const body = await req.json();
      // Lovable provider doesn't need an API key
      if (body.provider === 'lovable') {
        return new Response(JSON.stringify({ provider: { provider: 'lovable', label: body.label || 'Lovable AI' } }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const keyring = loadProviderKeyringFromEnv(Deno.env.toObject());

      let apiKey = body.apiKey;
      if (!apiKey || apiKey === "unchanged") {
        // Fetch the existing encrypted key and decrypt it so we can re-encrypt under the current key
        const { data: existing } = await admin
          .from("user_provider_credentials")
          .select("api_key_encrypted, api_key_iv, api_key_tag, key_version, encryption_algorithm, api_key")
          .eq("id", body.id)
          .eq("user_id", userId)
          .maybeSingle();
        if (existing?.api_key_encrypted && existing?.api_key_iv && existing?.api_key_tag && existing?.key_version) {
          // Already encrypted — keep as-is (will re-encrypt below with same plaintext)
          const envelope: ProviderSecretEnvelope = {
            ciphertext: existing.api_key_encrypted,
            iv: existing.api_key_iv,
            tag: existing.api_key_tag,
            keyVersion: existing.key_version,
            algorithm: existing.encryption_algorithm || "AES-256-GCM",
          };
          apiKey = await decryptProviderSecret(envelope, keyring);
        } else if (existing?.api_key) {
          // Legacy plain-text row — migrate it
          apiKey = existing.api_key;
        }
      }
      if (!apiKey) throw new Error("apiKey is required for this provider");

      // Encrypt the API key before storing
      const envelope = await encryptProviderSecret(apiKey, keyring);

      const payload = {
        id: body.id,
        user_id: userId,
        provider: body.provider,
        label: body.label,
        base_url: body.baseUrl ?? null,
        // Store encrypted fields; clear plain-text column
        api_key: null,
        api_key_encrypted: envelope.ciphertext,
        api_key_iv: envelope.iv,
        api_key_tag: envelope.tag,
        key_version: envelope.keyVersion,
        encryption_algorithm: envelope.algorithm,
        is_active: body.isActive ?? true,
      };
      const { data, error } = await admin
        .from("user_provider_credentials")
        .upsert(payload, { onConflict: "id" })
        .select("id, provider, label, base_url, is_active, created_at, updated_at")
        .single();
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ provider: data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "DELETE") {
      const { id } = await req.json();
      const { error } = await admin.from("user_provider_credentials").delete().eq("id", id).eq("user_id", userId);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("provider-secrets error:", message);
    return new Response(JSON.stringify({ error: message || "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
