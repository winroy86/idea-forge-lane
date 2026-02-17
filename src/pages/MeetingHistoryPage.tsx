import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, Clock, Users, MessageSquare, Target, ChevronDown, ChevronRight, Download, FileText } from 'lucide-react';
import { Room, Agent, Message, MeetingSession } from '@/types';
import { getRoom, getAgents, getMessages, getMeetingSessions } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

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

function generateMarkdown(entries: MeetingTimelineEntry[], allAgents: Agent[], roomTitle: string): string {
  let md = `# Meeting History — ${roomTitle}\n\n`;
  md += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;

  for (const { meeting, messages } of entries) {
    md += `## ${meeting.topic}\n\n`;
    md += `- **Date:** ${new Date(meeting.startTime).toLocaleString()}\n`;
    md += `- **Duration:** ${formatDuration(meeting.durationMinutes)}\n`;
    md += `- **Status:** ${meeting.status}\n`;
    if (meeting.goals) md += `- **Goals:** ${meeting.goals}\n`;
    if (meeting.additionalInfo) md += `- **Additional Info:** ${meeting.additionalInfo}\n`;

    const counts = new Map<string, number>();
    messages.filter(m => m.role === 'agent' && m.agentId).forEach(m => {
      counts.set(m.agentId!, (counts.get(m.agentId!) || 0) + 1);
    });
    if (counts.size > 0) {
      md += `\n### Participants\n\n`;
      counts.forEach((count, agentId) => {
        const agent = allAgents.find(a => a.id === agentId);
        md += `- **${agent?.name || 'Unknown'}** (${agent?.role || ''}) — ${count} messages\n`;
      });
    }

    const wrapUpIdx = messages.findIndex(m => m.role === 'system' && m.content.includes('final phase'));
    const closingSummaries = wrapUpIdx >= 0 ? messages.slice(wrapUpIdx + 1).filter(m => m.role === 'agent') : [];
    if (closingSummaries.length > 0) {
      md += `\n### Closing Summaries\n\n`;
      for (const msg of closingSummaries) {
        const agent = allAgents.find(a => a.id === msg.agentId);
        md += `#### ${agent?.name || 'Agent'} (${agent?.role || ''})\n\n${msg.content}\n\n`;
      }
    }

    const summarizerMsgs = messages.filter(m => m.role === 'summarizer');
    if (summarizerMsgs.length > 0) {
      md += `\n### Summaries & Decisions\n\n`;
      for (const msg of summarizerMsgs) {
        md += `${msg.content}\n\n`;
      }
    }

    md += `\n### Full Conversation\n\n`;
    for (const msg of messages) {
      const agent = msg.agentId ? allAgents.find(a => a.id === msg.agentId) : null;
      if (msg.role === 'system') {
        md += `> *${msg.content.replace(/\*\*/g, '')}*\n\n`;
      } else if (msg.role === 'user') {
        md += `**You:** ${msg.content}\n\n`;
      } else if (msg.role === 'summarizer') {
        md += `**Summarizer:** ${msg.content}\n\n`;
      } else if (agent) {
        md += `**${agent.name}:** ${msg.content}\n\n`;
      }
    }
    md += `---\n\n`;
  }
  return md;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportAsPdf(markdown: string, title: string) {
  let html = markdown
    .replace(/^# (.+)$/gm, '<h1 style="font-size:24px;margin-bottom:8px;">$1</h1>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:20px;margin-top:24px;margin-bottom:8px;border-bottom:1px solid #ddd;padding-bottom:4px;">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:16px;margin-top:16px;margin-bottom:6px;">$1</h3>')
    .replace(/^#### (.+)$/gm, '<h4 style="font-size:14px;margin-top:12px;margin-bottom:4px;">$1</h4>')
    .replace(/^\- \*\*(.+?)\*\*(.*)$/gm, '<li><strong>$1</strong>$2</li>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#666;margin:8px 0;">$1</blockquote>')
    .replace(/^---$/gm, '<hr style="margin:24px 0;border:none;border-top:1px solid #ddd;">')
    .replace(/\n\n/g, '<br><br>');

  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#222;line-height:1.6;font-size:13px;}
h1{color:#111;}h2{color:#333;}h3{color:#444;}li{margin:2px 0;}
@media print{body{margin:20px;padding:0;}}</style>
</head><body>${html}</body></html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(fullHtml);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }
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
                    <div className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold text-primary-foreground" style={{ backgroundColor: `hsl(var(--agent-${(agent.colorIndex % 6) + 1}))` }}>
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
                          <div className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-primary-foreground" style={{ backgroundColor: `hsl(var(--agent-${(agent.colorIndex % 6) + 1}))` }}>
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
  const { toast } = useToast();
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
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">Meeting History</h1>
          <p className="text-sm text-muted-foreground">{room.title} — {entries.length} session{entries.length !== 1 ? 's' : ''}</p>
        </div>
        {entries.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                const md = generateMarkdown(entries, allAgents, room.title);
                downloadFile(md, `${room.title.replace(/\s+/g, '-').toLowerCase()}-meetings.md`, 'text/markdown');
                toast({ title: '📄 Exported as Markdown' });
              }}
            >
              <FileText className="h-3.5 w-3.5" /> Markdown
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                const md = generateMarkdown(entries, allAgents, room.title);
                exportAsPdf(md, `${room.title} — Meeting History`);
                toast({ title: '🖨️ PDF print dialog opened' });
              }}
            >
              <Download className="h-3.5 w-3.5" /> PDF
            </Button>
          </div>
        )}
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
