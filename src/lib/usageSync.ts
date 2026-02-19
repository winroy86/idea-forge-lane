/**
 * usageSync.ts — fire-and-forget background sync of room/agent metadata.
 * Never blocks the UI. Never stores message content, API keys, or system prompts.
 */

import { hasSupabaseConfig, supabase } from '@/integrations/supabase/client';
import type { Room, Agent } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

async function getAuthUserId(): Promise<string | null> {
  if (!hasSupabaseConfig || !supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as unknown as SupabaseClient<any>;

/** Upsert a room snapshot — call after creating or opening a room. */
export async function syncRoom(room: Room): Promise<void> {
  try {
    const userId = await getAuthUserId();
    if (!userId) return;

    await db().from('room_snapshots').upsert(
      {
        user_id: userId,
        room_id: room.id,
        title: room.title,
        goal: room.goal ?? '',
        orchestration: room.orchestration ?? 'manual',
        agent_count: room.agentIds?.length ?? 0,
        last_opened_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,room_id' }
    );
  } catch {
    // Silently ignore — never affect the UI
  }
}

/** Upsert an agent snapshot — call after saving an agent. */
export async function syncAgent(agent: Agent): Promise<void> {
  try {
    const userId = await getAuthUserId();
    if (!userId) return;

    await db().from('agent_snapshots').upsert(
      {
        user_id: userId,
        agent_id: agent.id,
        name: agent.name ?? '',
        role: agent.role ?? '',
        domain: agent.domain ?? '',
        provider: agent.config?.provider ?? '',
        model: agent.config?.model ?? '',
      },
      { onConflict: 'user_id,agent_id' }
    );
  } catch {
    // Silently ignore — never affect the UI
  }
}
