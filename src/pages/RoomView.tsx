import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Send, Plus, Play, Pause, SkipForward,
  ListOrdered, RotateCcw, Sparkles, FileText, CheckSquare,
  ClipboardList, Brain, Settings2, X, ChevronRight
} from 'lucide-react';
import { Room, Agent, Message, OrchestrationType, SummarizerAction } from '@/types';
import {
  getRoom, upsertRoom, getAgents, getMessages, addMessage, generateId
} from '@/lib/store';
import { callAgent, callSummarizer } from '@/lib/llm';
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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!id) return;
    const r = getRoom(id);
    if (!r) { navigate('/'); return; }
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

    // Suggest next speaker
    if (roomAgents.length > 0) {
      const suggested = roomAgents[Math.floor(Math.random() * roomAgents.length)];
      setSuggestedSpeaker(suggested.id);
    }
  };

  const triggerAgent = async (agentId: string) => {
    const agent = allAgents.find(a => a.id === agentId);
    if (!agent || !room || loadingAgentId) return;

    setLoadingAgentId(agentId);
    try {
      const result = await callAgent(agent, messages, allAgents);
      const msg: Message = {
        id: generateId(),
        roomId: room.id,
        agentId: agent.id,
        role: 'agent',
        content: result.content,
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

      // Suggest next
      const others = roomAgents.filter(a => a.id !== agentId);
      if (others.length > 0) {
        setSuggestedSpeaker(others[Math.floor(Math.random() * others.length)].id);
      }
    } catch (err: any) {
      toast({ title: 'Agent error', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingAgentId(null);
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
  };

  if (!room) return null;

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

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <Sparkles className="h-8 w-8 text-accent/50 mb-3" />
              <p className="text-sm text-muted-foreground">Add agents and start the conversation.</p>
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
                  <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
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
          <div ref={chatEndRef} />
        </div>

        {/* Suggested speaker */}
        {suggestedSpeaker && roomAgents.length > 0 && (
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
                {loadingAgentId === agent.id ? 'Thinking…' : 'Speak now'}
              </button>
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
    </div>
  );
}
