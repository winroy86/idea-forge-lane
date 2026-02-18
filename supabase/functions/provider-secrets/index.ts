import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !serviceRole) throw new Error("Supabase env not configured");

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(supabaseUrl, serviceRole);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = userData.user.id;

    if (req.method === "GET") {
      const { data, error } = await admin
        .from("user_provider_credentials")
        .select("id, provider, label, base_url, is_active, created_at, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return new Response(JSON.stringify({ providers: data ?? [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST") {
      const body = await req.json();
      // Lovable provider doesn't need an API key
      if (body.provider === 'lovable') {
        return new Response(JSON.stringify({ provider: { provider: 'lovable', label: body.label || 'Lovable AI' } }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let apiKey = body.apiKey;
      if (!apiKey || apiKey === "unchanged") {
        const { data: existing } = await admin
          .from("user_provider_credentials")
          .select("api_key")
          .eq("id", body.id)
          .eq("user_id", userId)
          .maybeSingle();
        apiKey = existing?.api_key;
      }
      if (!apiKey) throw new Error("apiKey is required for this provider");

      const payload = {
        id: body.id,
        user_id: userId,
        provider: body.provider,
        label: body.label,
        base_url: body.baseUrl ?? null,
        api_key: apiKey,
        is_active: body.isActive ?? true,
      };
      const { data, error } = await admin
        .from("user_provider_credentials")
        .upsert(payload, { onConflict: "id" })
        .select("id, provider, label, base_url, is_active, created_at, updated_at")
        .single();
      if (error) throw error;
      return new Response(JSON.stringify({ provider: data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "DELETE") {
      const { id } = await req.json();
      const { error } = await admin.from("user_provider_credentials").delete().eq("id", id).eq("user_id", userId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
