import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, Clock, Users, MessageSquare, Target, ChevronDown, ChevronRight } from 'lucide-react';
import { Room, Agent, Message, MeetingSession } from '@/types';
import { getRoom, getAgents, getMessages, getMeetingSessions } from '@/lib/store';

const AGENT_COLORS = ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5', 'agent-6'];
function getAgentColor(index: number) {
  return AGENT_COLORS[index % AGENT_COLORS.length];
}

interface MeetingTimelineEntry {
  meeting: MeetingSession;
  messages: Message[];
  agents: Agent[];
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function MeetingCard({ entry, allAgents }: { entry: MeetingTimelineEntry; allAgents: Agent[] }) {
  const [expanded, setExpanded] = useState(false);
  const { meeting, messages } = entry;

  const agentMessages = messages.filter(m => m.role === 'agent');
  const userMessages = messages.filter(m => m.role === 'user');
  const systemMessages = messages.filter(m => m.role === 'system');
  const summarizerMessages = messages.filter(m => m.role === 'summarizer');

  // Count contributions per agent
  const contributions = new Map<string, { count: number; agent: Agent }>();
  agentMessages.forEach(m => {
    if (!m.agentId) return;
    const agent = allAgents.find(a => a.id === m.agentId);
    if (!agent) return;
    const existing = contributions.get(m.agentId);
    if (existing) {
      existing.count++;
    } else {
      contributions.set(m.agentId, { count: 1, agent });
    }
  });

  // Extract closing summaries (last agent messages that came after wrap-up system message)
  const wrapUpIdx = messages.findIndex(m => m.role === 'system' && m.content.includes('final phase'));
  const closingSummaries = wrapUpIdx >= 0 ? messages.slice(wrapUpIdx + 1).filter(m => m.role === 'agent') : [];

  return (
    <div className="relative pl-8 pb-8 group">
      {/* Timeline connector */}
      <div className="absolute left-3 top-0 bottom-0 w-px bg-border group-last:bg-gradient-to-b group-last:from-border group-last:to-transparent" />
      <div className="absolute left-1.5 top-2 h-3.5 w-3.5 rounded-full border-2 border-accent bg-card" />

      <div className="rounded-lg border border-border bg-card shadow-soft overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground truncate">{meeting.topic}</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                meeting.status === 'ended' ? 'bg-muted text-muted-foreground' :
                meeting.status === 'active' ? 'bg-green-500/10 text-green-600' :
                'bg-yellow-500/10 text-yellow-600'
              }`}>
                {meeting.status}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(meeting.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                {' '}
                {new Date(meeting.startTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span>{formatDuration(meeting.durationMinutes)}</span>
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {agentMessages.length + userMessages.length} messages
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {contributions.size} agents
              </span>
            </div>
          </div>
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
        </button>

        {expanded && (
          <div className="border-t border-border">
            {/* Goals */}
            {meeting.goals && (
              <div className="px-4 py-2.5 bg-accent/5 border-b border-border">
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-accent uppercase tracking-wider mb-1">
                  <Target className="h-3 w-3" /> Goals
                </div>
                <p className="text-xs text-foreground">{meeting.goals}</p>
                {meeting.additionalInfo && (
                  <p className="text-[11px] text-muted-foreground mt-1">{meeting.additionalInfo}</p>
                )}
              </div>
            )}

            {/* Agent Contributions */}
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Participant Contributions</p>
              <div className="flex flex-wrap gap-2">
                {Array.from(contributions.values()).sort((a, b) => b.count - a.count).map(({ agent, count }) => (
                  <div key={agent.id} className="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1">
                    <div className={`h-4 w-4 rounded-full bg-${getAgentColor(agent.colorIndex)} flex items-center justify-center text-[8px] font-bold text-primary-foreground`}>
                      {agent.name[0]}
                    </div>
                    <span className="text-[11px] font-medium text-foreground">{agent.name}</span>
                    <span className="text-[10px] text-muted-foreground">{count} msg{count > 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Closing Summaries */}
            {closingSummaries.length > 0 && (
              <div className="px-4 py-3 border-b border-border">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Closing Summaries</p>
                <div className="space-y-2.5">
                  {closingSummaries.map(msg => {
                    const agent = allAgents.find(a => a.id === msg.agentId);
                    if (!agent) return null;
                    return (
                      <div key={msg.id} className="rounded-md border border-border bg-muted/20 p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`h-5 w-5 rounded-full bg-${getAgentColor(agent.colorIndex)} flex items-center justify-center text-[10px] font-bold text-primary-foreground`}>
                            {agent.name[0]}
                          </div>
                          <span className="text-xs font-medium text-foreground">{agent.name}</span>
                          <span className="text-[10px] text-muted-foreground">{agent.role}</span>
                        </div>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Summarizer outputs */}
            {summarizerMessages.length > 0 && (
              <div className="px-4 py-3 border-b border-border">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Summaries & Decisions</p>
                <div className="space-y-2">
                  {summarizerMessages.map(msg => (
                    <div key={msg.id} className="rounded-md border border-accent/20 bg-accent/5 p-3">
                      <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full Conversation (collapsible) */}
            <ConversationThread messages={messages} allAgents={allAgents} />
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationThread({ messages, allAgents }: { messages: Message[]; allAgents: Agent[] }) {
  const [showFull, setShowFull] = useState(false);

  return (
    <div className="px-4 py-3">
      <button
        onClick={() => setShowFull(!showFull)}
        className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground"
      >
        {showFull ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Full Conversation ({messages.length} messages)
      </button>
      {showFull && (
        <div className="mt-2 space-y-1.5 max-h-96 overflow-y-auto">
          {messages.map(msg => {
            const agent = msg.agentId ? allAgents.find(a => a.id === msg.agentId) : null;
            const isUser = msg.role === 'user';
            const isSystem = msg.role === 'system';

            return (
              <div key={msg.id} className={`text-[11px] ${isUser ? 'text-right' : ''}`}>
                <div className={`inline-block max-w-[90%] rounded px-2.5 py-1.5 ${
                  isUser ? 'bg-primary/10 text-foreground' :
                  isSystem ? 'bg-muted/40 text-muted-foreground italic text-center w-full' :
                  'bg-card border border-border'
                }`}>
                  {agent && (
                    <span className="font-medium text-foreground">{agent.name}: </span>
                  )}
                  {isUser && <span className="font-medium text-muted-foreground">You: </span>}
                  <span className="text-foreground/80">{msg.content.slice(0, 300)}{msg.content.length > 300 ? '…' : ''}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MeetingHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [entries, setEntries] = useState<MeetingTimelineEntry[]>([]);

  useEffect(() => {
    if (!id) return;
    const r = getRoom(id);
    if (!r) { navigate('/'); return; }
    setRoom(r);
    const agents = getAgents();
    setAllAgents(agents);

    const sessions = getMeetingSessions(id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const allMessages = getMessages(id);

    const timeline: MeetingTimelineEntry[] = sessions.map(session => {
      const start = new Date(session.startTime).getTime();
      const end = start + session.durationMinutes * 60 * 1000 + 60000; // +1min buffer
      const meetingMsgs = allMessages.filter(m => {
        const t = new Date(m.timestamp).getTime();
        return t >= start && t <= end;
      });
      const participantAgents = agents.filter(a =>
        meetingMsgs.some(m => m.agentId === a.id)
      );
      return { meeting: session, messages: meetingMsgs, agents: participantAgents };
    });

    setEntries(timeline);
  }, [id, navigate]);

  if (!room) return null;

  return (
    <div className="animate-fade-in p-4 md:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/room/${room.id}`)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Meeting History</h1>
          <p className="text-sm text-muted-foreground">{room.title} — {entries.length} session{entries.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Clock className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <h2 className="text-base font-medium text-foreground mb-1">No meetings yet</h2>
          <p className="text-sm text-muted-foreground">Start a meeting in this room to see the history here.</p>
        </div>
      ) : (
        <div className="relative">
          {entries.map(entry => (
            <MeetingCard key={entry.meeting.id} entry={entry} allAgents={allAgents} />
          ))}
        </div>
      )}
    </div>
  );
}
