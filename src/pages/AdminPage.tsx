import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Users, MessageSquare, Calendar, Filter, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminRole } from '@/lib/useAdminRole';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as unknown as SupabaseClient<any>;

interface RoomRow {
  id: string;
  user_id: string;
  room_id: string;
  title: string;
  goal: string;
  orchestration: string;
  agent_count: number;
  created_at: string;
  last_opened_at: string;
  user_email?: string;
}

interface AgentRow {
  id: string;
  user_id: string;
  agent_id: string;
  name: string;
  role: string;
  domain: string;
  provider: string;
  model: string;
  created_at: string;
  user_email?: string;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminPage() {
  const { isAdmin, loading: roleLoading } = useAdminRole();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'rooms' | 'agents'>('rooms');

  // Redirect non-admins
  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      navigate('/', { replace: true });
    }
  }, [isAdmin, roleLoading, navigate]);

  const fetchData = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const [roomsRes, agentsRes] = await Promise.all([
        db().from('room_snapshots').select('*').order('last_opened_at', { ascending: false }),
        db().from('agent_snapshots').select('*').order('updated_at', { ascending: false }),
      ]);

      // Collect unique user IDs to resolve emails via auth
      const userIds = new Set<string>([
        ...(roomsRes.data ?? []).map((r: RoomRow) => r.user_id),
        ...(agentsRes.data ?? []).map((a: AgentRow) => a.user_id),
      ]);

      // Build email map from user_id → email by querying a profiles-like view
      // We store user emails by checking each user's own session isn't available,
      // so we use the user_id as display fallback with truncated UUID
      const emailMap: Record<string, string> = {};
      for (const uid of userIds) {
        emailMap[uid] = uid.slice(0, 8) + '…'; // fallback: short UUID
      }

      // Try to get emails from auth admin endpoint via edge function if available
      // For now display truncated user_id as identifier
      const roomsWithEmail = (roomsRes.data ?? []).map((r: RoomRow) => ({
        ...r,
        user_email: emailMap[r.user_id],
      }));
      const agentsWithEmail = (agentsRes.data ?? []).map((a: AgentRow) => ({
        ...a,
        user_email: emailMap[a.user_id],
      }));

      setRooms(roomsWithEmail);
      setAgents(agentsWithEmail);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) return null;

  // Unique users for filter
  const allUserIds = [...new Set([...rooms.map(r => r.user_id), ...agents.map(a => a.user_id)])];

  const filteredRooms = selectedUser === 'all' ? rooms : rooms.filter(r => r.user_id === selectedUser);
  const filteredAgents = selectedUser === 'all' ? agents : agents.filter(a => a.user_id === selectedUser);

  return (
    <div className="animate-fade-in p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-accent" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Platform usage overview — metadata only, no conversation content</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Total Rooms</div>
          <div className="text-2xl font-semibold text-foreground">{rooms.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Total Agents</div>
          <div className="text-2xl font-semibold text-foreground">{agents.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Unique Users</div>
          <div className="text-2xl font-semibold text-foreground">{allUserIds.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Avg Agents / Room</div>
          <div className="text-2xl font-semibold text-foreground">
            {rooms.length > 0 ? (rooms.reduce((s, r) => s + r.agent_count, 0) / rooms.length).toFixed(1) : '—'}
          </div>
        </div>
      </div>

      {/* Filters + Tabs */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setActiveTab('rooms')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'rooms'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Rooms ({filteredRooms.length})
          </button>
          <button
            onClick={() => setActiveTab('agents')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'agents'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Agents ({filteredAgents.length})
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="Filter by user" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {allUserIds.map(uid => (
                <SelectItem key={uid} value={uid}>
                  {uid.slice(0, 8)}…
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : activeTab === 'rooms' ? (
        /* Rooms Table */
        filteredRooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">No rooms tracked yet.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">User</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Room Title</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Goal</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Agents</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Orchestration</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Created</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Last Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRooms.map((room, i) => (
                    <tr key={room.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                          {room.user_id.slice(0, 8)}…
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground max-w-[160px] truncate">{room.title}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate text-xs">{room.goal || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Users className="h-3 w-3" />
                          {room.agent_count}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="capitalize text-xs text-muted-foreground">{room.orchestration}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {fmt(room.created_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDatetime(room.last_opened_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        /* Agents Table */
        filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <Users className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">No agents tracked yet.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">User</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Agent Name</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Domain</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Provider / Model</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map((agent, i) => (
                    <tr key={agent.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                          {agent.user_id.slice(0, 8)}…
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{agent.name}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{agent.role || '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{agent.domain || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-muted rounded px-1.5 py-0.5">
                          {agent.provider}/{agent.model}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {fmt(agent.created_at)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}
