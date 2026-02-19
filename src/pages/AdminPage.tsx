import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck, Users, MessageSquare, Calendar, Filter, RefreshCw,
  ChevronDown, ChevronRight, Clock, Target, Zap,
} from 'lucide-react';
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
}

interface MeetingRow {
  id: string;
  user_id: string;
  room_id: string;
  meeting_id: string;
  topic: string;
  goals: string;
  duration_minutes: number;
  status: string;
  started_at: string;
  created_at: string;
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
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-emerald-500/15 text-emerald-600',
    ended: 'bg-muted text-muted-foreground',
    'wrap-up': 'bg-amber-500/15 text-amber-600',
    scheduled: 'bg-blue-500/15 text-blue-600',
  };
  return (
    <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded capitalize ${map[status] ?? 'bg-muted text-muted-foreground'}`}>
      {status}
    </span>
  );
}

function RoomRowItem({ room, meetings }: { room: RoomRow; meetings: MeetingRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const roomMeetings = meetings.filter(m => m.room_id === room.room_id && m.user_id === room.user_id);

  return (
    <>
      <tr
        className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => roomMeetings.length > 0 && setExpanded(v => !v)}
      >
        <td className="px-4 py-3">
          <span className="font-mono text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">
            {room.user_id.slice(0, 8)}…
          </span>
        </td>
        <td className="px-4 py-3 font-medium text-foreground max-w-[160px] truncate">
          <div className="flex items-center gap-2">
            {roomMeetings.length > 0 ? (
              expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            {room.title}
          </div>
        </td>
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
        <td className="px-4 py-3 text-center">
          {roomMeetings.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
              <Calendar className="h-3 w-3 text-accent" />
              {roomMeetings.length}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
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

      {/* Meeting sub-rows */}
      {expanded && roomMeetings.map(meeting => (
        <tr key={meeting.id} className="border-b border-border bg-accent/5">
          <td className="px-4 py-2" />
          <td className="px-4 py-2" colSpan={1}>
            <div className="flex items-center gap-2 pl-5 border-l-2 border-accent/40 ml-1.5">
              <Calendar className="h-3 w-3 text-accent shrink-0" />
              <span className="text-xs font-medium text-foreground truncate max-w-[140px]">{meeting.topic}</span>
            </div>
          </td>
          <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-[200px]">
            <div className="flex items-center gap-1">
              <Target className="h-3 w-3 shrink-0" />
              {meeting.goals || '—'}
            </div>
          </td>
          <td className="px-4 py-2" />
          <td className="px-4 py-2">
            <StatusBadge status={meeting.status} />
          </td>
          <td className="px-4 py-2 text-xs text-muted-foreground text-center">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {meeting.duration_minutes}m
            </span>
          </td>
          <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {fmtDatetime(meeting.started_at)}
            </span>
          </td>
          <td className="px-4 py-2" />
        </tr>
      ))}
    </>
  );
}

export default function AdminPage() {
  const { isAdmin, loading: roleLoading } = useAdminRole();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
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
      const [roomsRes, meetingsRes, agentsRes] = await Promise.all([
        db().from('room_snapshots').select('*').order('last_opened_at', { ascending: false }),
        db().from('meeting_snapshots').select('*').order('started_at', { ascending: false }),
        db().from('agent_snapshots').select('*').order('updated_at', { ascending: false }),
      ]);

      setRooms(roomsRes.data ?? []);
      setMeetings(meetingsRes.data ?? []);
      setAgents(agentsRes.data ?? []);
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
  const filteredMeetings = selectedUser === 'all' ? meetings : meetings.filter(m => m.user_id === selectedUser);

  const totalMeetings = filteredMeetings.length;

  return (
    <div className="animate-fade-in p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
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
          <div className="text-xs text-muted-foreground mb-1">Total Meetings</div>
          <div className="text-2xl font-semibold text-foreground">{meetings.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Total Agents</div>
          <div className="text-2xl font-semibold text-foreground">{agents.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Unique Users</div>
          <div className="text-2xl font-semibold text-foreground">{allUserIds.length}</div>
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
            Rooms &amp; Meetings ({filteredRooms.length} / {totalMeetings})
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
        /* Rooms + Meetings Table */
        filteredRooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">No rooms tracked yet.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-2">
              Click on a room row to expand its meetings.
            </p>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">User</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Room Title</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Goal / Topic</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Agents</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Orchestration / Status</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Meetings</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Created</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Last Opened / Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRooms.map(room => (
                      <RoomRowItem key={room.id} room={room} meetings={filteredMeetings} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
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
