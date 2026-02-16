import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Send, Plus, Play, Pause, SkipForward,
  ListOrdered, RotateCcw, Sparkles, FileText, CheckSquare,
  ClipboardList, Brain, Settings2, X, ChevronRight, ChevronDown,
  Upload, Eye, EyeOff, Paperclip, Trash2, Database
} from 'lucide-react';
import { Room, Agent, Message, OrchestrationType, SummarizerAction, RoomDocument } from '@/types';
import {
  getRoom, upsertRoom, getAgents, getMessages, addMessage, generateId
} from '@/lib/store';
import { callAgent, callSummarizer, ResearchLoopProgress } from '@/lib/llm';
import { getAgentMemories } from '@/lib/agentMemory';
import AgentMemoryPanel from '@/components/AgentMemoryPanel';
import ResearchProgressBar from '@/components/ResearchProgressBar';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

const AGENT_COLORS = ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5', 'agent-6'];

function getAgentColor(index: number) {
  return AGENT_COLORS[index % AGENT_COLORS.length];
}

function InnerThoughtsBlock({ thoughts, agentName }: { thoughts: string; agentName: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Brain className="h-3 w-3 shrink-0" />
        <span className="font-medium">{agentName}'s inner thoughts</span>
        <span className="ml-auto text-[9px] italic opacity-60">(only you can see this)</span>
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
      </button>
      {expanded && (
        <div className="px-2.5 pb-2.5 border-t border-dashed border-muted-foreground/20">
          <div className="mt-2 text-xs text-muted-foreground italic leading-relaxed prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
            <ReactMarkdown>{thoughts}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RoomView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [loadingAgentId, setLoadingAgentId] = useState<string | null>(null);
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [suggestedSpeaker, setSuggestedSpeaker] = useState<string | null>(null);
  const [showDocPanel, setShowDocPanel] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoRoundCount, setAutoRoundCount] = useState(0);
  const [maxAutoRounds, setMaxAutoRounds] = useState(3);
  const [loopProgress, setLoopProgress] = useState<ResearchLoopProgress | null>(null);
  const [memoryPanelAgentId, setMemoryPanelAgentId] = useState<string | null>(null);
  const autoRunningRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!id) return;
    const r = getRoom(id);
    if (!r) { navigate('/'); return; }
    // Migrate old rooms without documents
    if (!r.documents) r.documents = [];
    setRoom(r);
    setAllAgents(getAgents());
    setMessages(getMessages(id));
  }, [id, navigate]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const roomAgents = allAgents.filter(a => room?.agentIds.includes(a.id));
  const availableAgents = allAgents.filter(a => !room?.agentIds.includes(a.id));

  const addAgentToRoom = (agentId: string) => {
    if (!room) return;
    const updated = { ...room, agentIds: [...room.agentIds, agentId], updatedAt: new Date().toISOString() };
    upsertRoom(updated);
    setRoom(updated);
  };

  const removeAgentFromRoom = (agentId: string) => {
    if (!room) return;
    const updated = { ...room, agentIds: room.agentIds.filter(id => id !== agentId), updatedAt: new Date().toISOString() };
    upsertRoom(updated);
    setRoom(updated);
  };

  // --- Document handling ---
  const isTextFile = (name: string): boolean => {
    const textExts = ['.txt', '.md', '.json', '.csv', '.xml', '.html', '.htm', '.js', '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.css', '.scss', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.log', '.sh', '.bat', '.sql', '.r', '.tex', '.bib'];
    return textExts.some(ext => name.toLowerCase().endsWith(ext));
  };

  const extractWithAI = async (file: File): Promise<string> => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) throw new Error('Cloud not configured');

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    const res = await fetch(`${supabaseUrl}/functions/v1/extract-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Extraction failed' }));
      throw new Error(err.error || `Extraction failed (${res.status})`);
    }

    const data = await res.json();
    return data.text || '';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !room) return;

    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        toast({ title: 'File too large', description: `${file.name} exceeds 20MB limit`, variant: 'destructive' });
        continue;
      }

      try {
        let content = '';

        if (isTextFile(file.name)) {
          content = await file.text();
        } else {
          // Use AI extraction for PDFs, DOCX, images, etc.
          toast({ title: `🔍 Extracting text from ${file.name}…`, description: 'Using AI to read document content' });
          content = await extractWithAI(file);
        }

        if (!content || content.trim().length < 10) {
          toast({ title: 'No content extracted', description: `Could not read text from ${file.name}`, variant: 'destructive' });
          continue;
        }

        const doc: RoomDocument = {
          id: generateId(),
          name: file.name,
          content: content.slice(0, 50000),
          addedAt: new Date().toISOString(),
        };
        const updated = {
          ...room,
          documents: [...(room.documents || []), doc],
          updatedAt: new Date().toISOString(),
        };
        upsertRoom(updated);
        setRoom(updated);
        toast({ title: `📄 ${file.name} loaded`, description: `${content.length.toLocaleString()} characters extracted` });
      } catch (err: any) {
        toast({ title: 'Failed to read file', description: err.message || file.name, variant: 'destructive' });
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeDocument = (docId: string) => {
    if (!room) return;
    const updated = {
      ...room,
      documents: (room.documents || []).filter(d => d.id !== docId),
      updatedAt: new Date().toISOString(),
    };
    upsertRoom(updated);
    setRoom(updated);
  };

  const sendUserMessage = () => {
    if (!input.trim() || !room) return;
    const msg: Message = {
      id: generateId(),
      roomId: room.id,
      agentId: null,
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };
    addMessage(msg);
    setMessages(prev => [...prev, msg]);
    setInput('');

    if (roomAgents.length > 0) {
      const suggested = roomAgents[Math.floor(Math.random() * roomAgents.length)];
      setSuggestedSpeaker(suggested.id);
    }
  };

  const triggerAgent = async (agentId: string) => {
    const agent = allAgents.find(a => a.id === agentId);
    if (!agent || !room || loadingAgentId) return;

    setLoadingAgentId(agentId);
    setLoopProgress(null);
    try {
      const result = await callAgent(agent, messages, allAgents, room.documents || [], room.id, (progress) => {
        setLoopProgress(progress);
      });
      const msg: Message = {
        id: generateId(),
        roomId: room.id,
        agentId: agent.id,
        role: 'agent',
        content: result.content,
        innerThoughts: result.innerThoughts,
        timestamp: new Date().toISOString(),
        metadata: {
          model: result.model,
          provider: result.provider,
          tokensUsed: result.tokensUsed,
          latencyMs: result.latencyMs,
        },
      };
      addMessage(msg);
      setMessages(prev => [...prev, msg]);

      const others = roomAgents.filter(a => a.id !== agentId);
      if (others.length > 0) {
        setSuggestedSpeaker(others[Math.floor(Math.random() * others.length)].id);
      }
    } catch (err: any) {
      toast({ title: 'Agent error', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingAgentId(null);
      setLoopProgress(null);
    }
  };

  const runSummarizer = async (action: SummarizerAction) => {
    if (!room || loadingAgentId) return;
    setLoadingAgentId('summarizer');
    try {
      const result = await callSummarizer(action, messages, allAgents);
      const msg: Message = {
        id: generateId(),
        roomId: room.id,
        agentId: null,
        role: 'summarizer',
        content: result.content,
        timestamp: new Date().toISOString(),
        metadata: {
          model: result.model,
          provider: result.provider,
          latencyMs: result.latencyMs,
        },
      };
      addMessage(msg);
      setMessages(prev => [...prev, msg]);
    } catch (err: any) {
      toast({ title: 'Summarizer error', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingAgentId(null);
    }
  };

  const updateOrchestration = (type: OrchestrationType) => {
    if (!room) return;
    const updated = { ...room, orchestration: type, updatedAt: new Date().toISOString() };
    upsertRoom(updated);
    setRoom(updated);
    // Stop auto-run if switching away from auto modes
    if (type === 'manual') {
      stopAutoRun();
    }
  };

  const stopAutoRun = () => {
    autoRunningRef.current = false;
    setAutoRunning(false);
    setAutoRoundCount(0);
  };

  const getNextSpeaker = (
    currentMessages: Message[],
    agents: Agent[],
    orchestration: OrchestrationType,
    sequenceOrder?: string[],
  ): Agent | null => {
    if (agents.length === 0) return null;

    if (orchestration === 'sequence') {
      const order = sequenceOrder?.length ? sequenceOrder : agents.map(a => a.id);
      const lastAgentMsg = [...currentMessages].reverse().find(m => m.role === 'agent');
      if (!lastAgentMsg) return agents.find(a => a.id === order[0]) || agents[0];
      const lastIdx = order.indexOf(lastAgentMsg.agentId || '');
      const nextIdx = (lastIdx + 1) % order.length;
      return agents.find(a => a.id === order[nextIdx]) || agents[0];
    }

    // Auto / Loop: pick the agent who spoke least recently, weighted by balance
    const speakCounts = new Map<string, number>();
    agents.forEach(a => speakCounts.set(a.id, 0));
    currentMessages.filter(m => m.role === 'agent').forEach(m => {
      if (m.agentId) speakCounts.set(m.agentId, (speakCounts.get(m.agentId) || 0) + 1);
    });

    const lastAgentMsg = [...currentMessages].reverse().find(m => m.role === 'agent');
    const eligible = agents.filter(a => a.id !== lastAgentMsg?.agentId);
    if (eligible.length === 0) return agents[0];

    // Sort by least spoken
    eligible.sort((a, b) => (speakCounts.get(a.id) || 0) - (speakCounts.get(b.id) || 0));
    return eligible[0];
  };

  const startAutoRun = async () => {
    if (!room || roomAgents.length < 2) {
      toast({ title: 'Need at least 2 agents', description: 'Add more agents to use auto mode.', variant: 'destructive' });
      return;
    }

    autoRunningRef.current = true;
    setAutoRunning(true);
    setAutoRoundCount(0);

    let currentMessages = [...messages];
    const totalTurns = maxAutoRounds * roomAgents.length;

    for (let turn = 0; turn < totalTurns; turn++) {
      if (!autoRunningRef.current) break;

      const nextAgent = getNextSpeaker(currentMessages, roomAgents, room.orchestration, room.sequenceOrder);
      if (!nextAgent) break;

      setLoadingAgentId(nextAgent.id);
      setLoopProgress(null);
      try {
        const result = await callAgent(nextAgent, currentMessages, allAgents, room.documents || [], room.id, (progress) => {
          setLoopProgress(progress);
        });
        if (!autoRunningRef.current) break;

        const msg: Message = {
          id: generateId(),
          roomId: room.id,
          agentId: nextAgent.id,
          role: 'agent',
          content: result.content,
          innerThoughts: result.innerThoughts,
          timestamp: new Date().toISOString(),
          metadata: {
            model: result.model,
            provider: result.provider,
            tokensUsed: result.tokensUsed,
            latencyMs: result.latencyMs,
          },
        };
        addMessage(msg);
        currentMessages = [...currentMessages, msg];
        setMessages([...currentMessages]);

        // Update round count
        const completedRound = Math.floor((turn + 1) / roomAgents.length);
        setAutoRoundCount(completedRound);
      } catch (err: any) {
        toast({ title: `${nextAgent.name} error`, description: err.message, variant: 'destructive' });
        break;
      } finally {
        setLoadingAgentId(null);
        setLoopProgress(null);
      }
    }

    autoRunningRef.current = false;
    setAutoRunning(false);
  };

  if (!room) return null;

  const documents = room.documents || [];

  return (
    <div className="flex h-full animate-fade-in">
      {/* Main chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Room header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 bg-card">
          <button onClick={() => navigate('/')} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-foreground truncate">{room.title}</h2>
            {room.goal && <p className="text-xs text-muted-foreground truncate">{room.goal}</p>}
          </div>
          <div className="flex items-center gap-2">
            {/* Document indicator */}
            {documents.length > 0 && (
              <button
                onClick={() => setShowDocPanel(!showDocPanel)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted border border-border"
              >
                <FileText className="h-3 w-3" />
                <span>{documents.length} doc{documents.length > 1 ? 's' : ''}</span>
              </button>
            )}
            <Select value={room.orchestration} onValueChange={(v) => updateOrchestration(v as OrchestrationType)}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="sequence">Sequence</SelectItem>
                <SelectItem value="loop">Loop</SelectItem>
                <SelectItem value="auto">Auto</SelectItem>
              </SelectContent>
            </Select>
            <button
              onClick={() => setShowAgentPanel(!showAgentPanel)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted md:hidden"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Document panel (collapsible) */}
        {showDocPanel && (
          <div className="border-b border-border bg-muted/30 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-foreground">📄 Loaded Documents</p>
              <button onClick={() => setShowDocPanel(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center gap-2 rounded border border-border bg-card px-2.5 py-1.5">
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-foreground truncate flex-1">{doc.name}</span>
                <span className="text-[10px] text-muted-foreground">{doc.content.length.toLocaleString()} chars</span>
                <button onClick={() => removeDocument(doc.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <Sparkles className="h-8 w-8 text-accent/50 mb-3" />
              <p className="text-sm text-muted-foreground">Add agents and start the conversation.</p>
              {documents.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  📄 {documents.length} document{documents.length > 1 ? 's' : ''} loaded — agents will analyze {documents.length > 1 ? 'them' : 'it'} when responding.
                </p>
              )}
            </div>
          )}
          {messages.map((msg) => {
            const agent = msg.agentId ? allAgents.find(a => a.id === msg.agentId) : null;
            const isSummarizer = msg.role === 'summarizer';
            const isUser = msg.role === 'user';
            const isSystem = msg.role === 'system';

            return (
              <div key={msg.id} className={`animate-fade-in ${isUser ? 'flex justify-end' : ''}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2.5 text-sm ${
                  isUser
                    ? 'bg-primary text-primary-foreground ml-auto'
                    : isSummarizer
                    ? 'bg-accent/10 border border-accent/20'
                    : 'bg-card border border-border'
                }`}>
                  {agent && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`h-5 w-5 rounded-full bg-${getAgentColor(agent.colorIndex)} flex items-center justify-center text-[10px] font-bold text-primary-foreground`}>
                        {agent.name[0]}
                      </div>
                      <span className="font-medium text-xs">{agent.name}</span>
                      <span className="text-[10px] text-muted-foreground">{agent.role}</span>
                    </div>
                  )}
                  {isSummarizer && (
                    <div className="flex items-center gap-1.5 mb-1.5 text-accent">
                      <Brain className="h-3.5 w-3.5" />
                      <span className="font-medium text-xs">Summarizer</span>
                    </div>
                  )}
                  <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded-md [&_blockquote]:border-accent [&_blockquote]:text-muted-foreground">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                  {/* Inner thoughts - only visible to the user, styled differently */}
                  {msg.innerThoughts && agent && (
                    <InnerThoughtsBlock thoughts={msg.innerThoughts} agentName={agent.name} />
                  )}
                  {msg.metadata && (
                    <div className="mt-1.5 flex gap-3 text-[10px] text-muted-foreground">
                      <span>{msg.metadata.model}</span>
                      <span>{msg.metadata.tokensUsed} tokens</span>
                      <span>{msg.metadata.latencyMs}ms</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {/* Research Loop Progress Bar */}
          {loopProgress && loadingAgentId && (() => {
            const agent = allAgents.find(a => a.id === loadingAgentId);
            return agent ? <ResearchProgressBar progress={loopProgress} agentName={agent.name} /> : null;
          })()}
          <div ref={chatEndRef} />
        </div>

        {/* Auto-orchestration controls */}
        {room.orchestration !== 'manual' && (
          <div className="border-t border-border bg-accent/5 px-4 py-2 flex items-center gap-3">
            {autoRunning ? (
              <>
                <Button variant="destructive" size="sm" className="gap-1.5 text-xs" onClick={stopAutoRun}>
                  <Pause className="h-3 w-3" /> Stop
                </Button>
                <span className="text-xs text-muted-foreground">
                  Round {autoRoundCount}/{maxAutoRounds} • {loadingAgentId ? `${allAgents.find(a => a.id === loadingAgentId)?.name} thinking…` : 'waiting…'}
                </span>
              </>
            ) : (
              <>
                <Button variant="default" size="sm" className="gap-1.5 text-xs" onClick={startAutoRun} disabled={!!loadingAgentId || roomAgents.length < 2}>
                  <Play className="h-3 w-3" /> Run {room.orchestration === 'sequence' ? 'Sequence' : room.orchestration === 'loop' ? 'Loop' : 'Auto'}
                </Button>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Rounds:</span>
                  <Select value={String(maxAutoRounds)} onValueChange={(v) => setMaxAutoRounds(Number(v))}>
                    <SelectTrigger className="w-14 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1,2,3,5,10].map(n => (
                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        )}

        {/* Suggested speaker (manual mode only) */}
        {room.orchestration === 'manual' && suggestedSpeaker && roomAgents.length > 0 && (
          <div className="border-t border-border bg-accent/5 px-4 py-2 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="text-xs text-muted-foreground">Suggested:</span>
            <button
              onClick={() => triggerAgent(suggestedSpeaker)}
              className="text-xs font-medium text-accent hover:underline"
            >
              {allAgents.find(a => a.id === suggestedSpeaker)?.name}
            </button>
          </div>
        )}

        {/* Summarizer actions */}
        <div className="border-t border-border bg-card px-4 py-2 flex gap-2 overflow-x-auto">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0" onClick={() => runSummarizer('summarize')} disabled={!!loadingAgentId || messages.length === 0}>
            <FileText className="h-3 w-3" /> {loadingAgentId === 'summarizer' ? 'Working…' : 'Summarize'}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0" onClick={() => runSummarizer('decisions')} disabled={!!loadingAgentId || messages.length === 0}>
            <CheckSquare className="h-3 w-3" /> Decisions
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0" onClick={() => runSummarizer('actionPlan')} disabled={!!loadingAgentId || messages.length === 0}>
            <ClipboardList className="h-3 w-3" /> Action Plan
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0" onClick={() => runSummarizer('updateMemory')} disabled={!!loadingAgentId || messages.length === 0}>
            <Brain className="h-3 w-3" /> Update Memory
          </Button>
        </div>

        {/* Input */}
        <div className="border-t border-border p-3 bg-card">
          <div className="flex gap-2">
            {/* Document upload button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.csv,.json,.xml,.html,.js,.ts,.py,.java,.go,.rs,.c,.cpp,.h,.css,.yaml,.yml,.toml,.ini,.cfg,.log,.sql,.pdf,.docx,.doc,.pptx,.xlsx,.png,.jpg,.jpeg,.webp"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              title="Upload documents: PDF, Word, PowerPoint, Excel, images, text files, code files"
              className="shrink-0"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendUserMessage()}
              placeholder="Type a message to steer the conversation..."
              className="flex-1"
            />
            <Button onClick={sendUserMessage} size="icon" disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Right panel - Agent roster */}
      <div className={`border-l border-border bg-card w-72 flex-col overflow-y-auto ${showAgentPanel ? 'flex fixed inset-y-0 right-0 z-50 md:relative' : 'hidden md:flex'}`}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Agents</h3>
          <button onClick={() => setShowAgentPanel(false)} className="md:hidden rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3 space-y-2">
          {roomAgents.map((agent) => (
            <div key={agent.id} className="rounded-md border border-border p-2.5 group">
              <div className="flex items-center gap-2">
                <div className={`h-6 w-6 rounded-full bg-${getAgentColor(agent.colorIndex)} flex items-center justify-center text-[11px] font-bold text-primary-foreground`}>
                  {agent.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{agent.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{agent.role}</div>
                </div>
                <button
                  onClick={() => removeAgentFromRoom(agent.id)}
                  className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <button
                onClick={() => triggerAgent(agent.id)}
                disabled={!!loadingAgentId}
                className="mt-2 w-full rounded bg-muted px-2 py-1 text-[10px] font-medium text-foreground hover:bg-muted-foreground/10 transition-colors disabled:opacity-50"
              >
                {loadingAgentId === agent.id
                  ? (loopProgress
                    ? `Loop ${loopProgress.currentLoop}/${loopProgress.totalLoops}: ${loopProgress.activity}`
                    : 'Thinking…')
                  : 'Speak now'}
              </button>
              <div className="mt-1.5 flex items-center gap-1.5">
                {agent.memoryEnabled && (agent.researchLoops || 0) > 0 && (
                  <span className="text-[9px] text-accent bg-accent/10 rounded px-1.5 py-0.5">
                    🔄 {agent.researchLoops} loops
                  </span>
                )}
                {agent.memoryEnabled && (
                  <button
                    onClick={() => setMemoryPanelAgentId(memoryPanelAgentId === agent.id ? null : agent.id)}
                    className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                  >
                    <Database className="h-2.5 w-2.5" /> Memory
                  </button>
                )}
              </div>
            </div>
          ))}

          {availableAgents.length > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-[10px] text-muted-foreground mb-2">Add to room:</p>
              {availableAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => addAgentToRoom(agent.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Plus className="h-3 w-3" />
                  {agent.name}
                </button>
              ))}
            </div>
          )}

          {allAgents.length === 0 && (
            <div className="text-center py-6">
              <p className="text-xs text-muted-foreground mb-2">No agents created yet.</p>
              <Button variant="outline" size="sm" onClick={() => navigate('/agents')}>
                Create Agents
              </Button>
            </div>
          )}
        </div>

        {/* Documents section */}
        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Documents</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          {documents.length === 0 ? (
            <div>
              <p className="text-[10px] text-muted-foreground italic">No documents loaded</p>
              <p className="text-[9px] text-muted-foreground/60 mt-1">Supports: PDF, Word, PowerPoint, Excel, images, text & code files</p>
            </div>
          ) : (
            <div className="space-y-1">
              {documents.map(doc => (
                <div key={doc.id} className="flex items-center gap-1.5 text-[10px] group">
                  <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-foreground truncate flex-1">{doc.name}</span>
                  <button
                    onClick={() => removeDocument(doc.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Orchestration settings */}
        <div className="mt-auto border-t border-border p-3">
          <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">Balance</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Debate</span>
            <Slider
              value={[room.balanceSlider]}
              onValueChange={([v]) => {
                const updated = { ...room, balanceSlider: v, updatedAt: new Date().toISOString() };
                upsertRoom(updated);
                setRoom(updated);
              }}
              max={100}
              step={1}
              className="flex-1"
            />
            <span className="text-[10px] text-muted-foreground">Equal</span>
          </div>
        </div>
      </div>

      {/* Agent Memory Panel */}
      {memoryPanelAgentId && (() => {
        const agent = allAgents.find(a => a.id === memoryPanelAgentId);
        if (!agent) return null;
        return (
          <AgentMemoryPanel
            agentId={agent.id}
            agentName={agent.name}
            roomId={room.id}
            onClose={() => setMemoryPanelAgentId(null)}
          />
        );
      })()}
    </div>
  );
}
