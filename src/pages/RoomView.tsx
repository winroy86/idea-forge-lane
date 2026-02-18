import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Send, Plus, Play, Pause, SkipForward,
  ListOrdered, RotateCcw, Sparkles, FileText, CheckSquare,
  ClipboardList, Brain, Settings2, X, ChevronRight, ChevronDown,
  Upload, Eye, EyeOff, Paperclip, Trash2, Database, Timer, Clock, Square, Menu
} from 'lucide-react';
import { Room, Agent, Message, OrchestrationType, SummarizerAction, SummarizerSettings, LLMProvider, RoomDocument, CodeBlockMeta, MeetingSession, MeetingContext } from '@/types';
import {
  getRoom, upsertRoom, getAgents, getMessages, addMessage, generateId,
  getMeetingSessions, saveMeetingSession, getActiveMeeting, getProviders,
  getChatBubbleMode,
} from '@/lib/store';
import { callAgent, callSummarizer, ResearchLoopProgress } from '@/lib/llm';
import { getDefaultLlmSelection } from '@/lib/providerSelection';
import { getAgentMemories } from '@/lib/agentMemory';
import AgentMemoryPanel from '@/components/AgentMemoryPanel';
import ResearchProgressBar from '@/components/ResearchProgressBar';
import CodeExecutionPanel from '@/components/CodeExecutionPanel';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const AGENT_COLORS = ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5', 'agent-6'];

interface MeetingTemplate {
  name: string;
  icon: string;
  topic: string;
  goals: string;
  additionalInfo: string;
  duration: string;
}

const MEETING_TEMPLATES: MeetingTemplate[] = [
  {
    name: 'Brainstorm',
    icon: '💡',
    topic: 'Brainstorming Session',
    goals: 'Generate creative ideas and explore unconventional approaches. Quantity over quality — diverge first, converge later.',
    additionalInfo: 'Encourage wild ideas. No criticism during ideation phase. Build on each other\'s suggestions.',
    duration: '30',
  },
  {
    name: 'Sprint Retro',
    icon: '🔄',
    topic: 'Sprint Retrospective',
    goals: 'Identify what went well, what didn\'t, and actionable improvements for the next sprint.',
    additionalInfo: 'Focus on processes, not people. Be specific with examples. Prioritize the top 3 action items.',
    duration: '45',
  },
  {
    name: 'Design Review',
    icon: '🎨',
    topic: 'Design Review',
    goals: 'Evaluate the current design approach, identify usability issues, and align on visual direction.',
    additionalInfo: 'Consider accessibility, consistency with design system, and user journey impact.',
    duration: '30',
  },
  {
    name: 'Strategy',
    icon: '🎯',
    topic: 'Strategic Planning',
    goals: 'Define priorities, assess risks and opportunities, and establish a clear action plan with owners and deadlines.',
    additionalInfo: 'Consider market trends, competitive landscape, and resource constraints.',
    duration: '60',
  },
  {
    name: 'Debate',
    icon: '⚔️',
    topic: 'Structured Debate',
    goals: 'Explore opposing viewpoints on a key decision. Each side presents evidence, rebuts, and finds common ground.',
    additionalInfo: 'Steel-man opposing arguments. Focus on evidence and logic over rhetoric.',
    duration: '30',
  },
  {
    name: 'Decision',
    icon: '✅',
    topic: 'Decision Meeting',
    goals: 'Evaluate options against criteria, surface trade-offs, and commit to a clear decision with rationale documented.',
    additionalInfo: 'List options upfront. Use explicit criteria. Assign a decision owner.',
    duration: '15',
  },
];

function getAgentColor(index: number) {
  return AGENT_COLORS[index % AGENT_COLORS.length];
}

function InnerThoughtsBlock({ thoughts, agentName, codeBlocks }: { thoughts: string; agentName: string; codeBlocks?: CodeBlockMeta[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Brain className="h-3 w-3 shrink-0" />
        <span className="font-medium">{agentName}'s inner thoughts</span>
        {codeBlocks && codeBlocks.length > 0 && (
          <span className="text-[9px] bg-muted px-1 py-0.5 rounded">💻 {codeBlocks.length} code exec</span>
        )}
        <span className="ml-auto text-[9px] italic opacity-60">(only you can see this)</span>
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
      </button>
      {expanded && (
        <div className="px-2.5 pb-2.5 border-t border-dashed border-muted-foreground/20">
          <div className="mt-2 text-xs text-muted-foreground italic leading-relaxed prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
            <ReactMarkdown>{thoughts}</ReactMarkdown>
          </div>
          {codeBlocks && codeBlocks.length > 0 && (
            <CodeExecutionPanel blocks={codeBlocks} />
          )}
        </div>
      )}
    </div>
  );
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
  const messagesRef = useRef<Message[]>([]);
  const { toast } = useToast();
  const [bubbleMode] = useState(() => getChatBubbleMode());
  const [bubblePanelOpen, setBubblePanelOpen] = useState(false);

  // Meeting state
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);
  const [meetingTopic, setMeetingTopic] = useState('');
  const [meetingGoals, setMeetingGoals] = useState('');
  const [meetingAdditionalInfo, setMeetingAdditionalInfo] = useState('');
  const [meetingDuration, setMeetingDuration] = useState('30');
  const [activeMeeting, setActiveMeeting] = useState<MeetingSession | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0); // seconds
  const [showPastMeetings, setShowPastMeetings] = useState(false);
  const wrapUpTriggeredRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    const r = getRoom(id);
    if (!r) { navigate('/'); return; }
    // Migrate old rooms
    if (!r.documents) r.documents = [];
    if (!r.meetings) r.meetings = [];
    setRoom(r);
    setAllAgents(getAgents());
    setMessages(getMessages(id));
    // Restore active meeting
    const active = getActiveMeeting(id);
    if (active && (active.status === 'active' || active.status === 'wrap-up')) {
      setActiveMeeting(active);
      wrapUpTriggeredRef.current = active.status === 'wrap-up';
    }
  }, [id, navigate]);

  // Keep messagesRef in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Meeting timer
  useEffect(() => {
    if (!activeMeeting || activeMeeting.status === 'ended') return;

    const interval = setInterval(() => {
      const start = new Date(activeMeeting.startTime).getTime();
      const end = start + activeMeeting.durationMinutes * 60 * 1000;
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((end - now) / 1000));
      setTimeRemaining(remaining);

      // Check if we need to transition to wrap-up
      if (remaining <= 300 && remaining > 0 && activeMeeting.status === 'active') {
        const updated = { ...activeMeeting, status: 'wrap-up' as const };
        saveMeetingSession(updated);
        setActiveMeeting(updated);
      }

      // Meeting ended
      if (remaining <= 0) {
        const updated = { ...activeMeeting, status: 'ended' as const };
        saveMeetingSession(updated);
        setActiveMeeting(updated);
        if (room) {
          const roomUpdated = { ...room, activeMeetingId: undefined, updatedAt: new Date().toISOString() };
          upsertRoom(roomUpdated);
          setRoom(roomUpdated);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeMeeting, room]);

  // Auto wrap-up summaries trigger
  useEffect(() => {
    if (!activeMeeting || activeMeeting.status !== 'wrap-up' || wrapUpTriggeredRef.current || loadingAgentId) return;
    wrapUpTriggeredRef.current = true;
    triggerWrapUpSummaries();
  }, [activeMeeting?.status, loadingAgentId]);

  const roomAgents = allAgents.filter(a => room?.agentIds.includes(a.id));
  const availableAgents = allAgents.filter(a => !room?.agentIds.includes(a.id));

  const getMeetingContextNow = useCallback((): MeetingContext | undefined => {
    if (!activeMeeting || activeMeeting.status === 'ended') return undefined;
    const start = new Date(activeMeeting.startTime).getTime();
    const end = start + activeMeeting.durationMinutes * 60 * 1000;
    const remaining = Math.max(0, (end - Date.now()) / 60000);
    return {
      topic: activeMeeting.topic,
      goals: activeMeeting.goals,
      additionalInfo: activeMeeting.additionalInfo,
      timeRemainingMinutes: remaining,
      totalDurationMinutes: activeMeeting.durationMinutes,
      phase: activeMeeting.status === 'wrap-up' ? 'wrap-up' : 'active',
    };
  }, [activeMeeting]);

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
    if (!supabaseUrl || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
      throw new Error('Document extraction is disabled. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    const llm = getDefaultLlmSelection('google/gemini-2.5-flash');
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
        llm,
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

  const triggerAgent = async (agentId: string, promptOverride?: string) => {
    const agent = allAgents.find(a => a.id === agentId);
    if (!agent || !room || loadingAgentId) return;

    setLoadingAgentId(agentId);
    setLoopProgress(null);
    try {
      const meetingCtx = getMeetingContextNow();

      // Always read the latest messages from ref to avoid stale closures
      const currentMessages = messagesRef.current;

      // If there's a prompt override (e.g. wrap-up), inject as a user message temporarily
      let messagesForCall = currentMessages;
      if (promptOverride) {
        const overrideMsg: Message = {
          id: 'temp-override',
          roomId: room.id,
          agentId: null,
          role: 'user',
          content: promptOverride,
          timestamp: new Date().toISOString(),
        };
        messagesForCall = [...currentMessages, overrideMsg];
      }

      const result = await callAgent(agent, messagesForCall, allAgents, room.documents || [], room.id, (progress) => {
        setLoopProgress(progress);
      }, meetingCtx);
      const msg: Message = {
        id: generateId(),
        roomId: room.id,
        agentId: agent.id,
        role: 'agent',
        content: result.content,
        innerThoughts: result.innerThoughts,
        codeBlocks: result.codeBlocks,
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

  const triggerWrapUpSummaries = async () => {
    if (!room) return;
    // Insert system message
    const sysMsg: Message = {
      id: generateId(),
      roomId: room.id,
      agentId: null,
      role: 'system',
      content: '⏰ **Meeting entering final phase — 5 minutes remaining.** Each agent will now summarize their position.',
      timestamp: new Date().toISOString(),
    };
    addMessage(sysMsg);
    setMessages(prev => [...prev, sysMsg]);

    const wrapUpPrompt = `The meeting is ending. Provide your CLOSING SUMMARY:
1. Your key position and conclusions on the topic
2. Points of agreement/disagreement with other agents
3. Recommended next steps from your perspective

Draw on your persona, expertise, and memory. Be concise — this is your final statement.`;

    // Trigger each agent sequentially
    for (const agent of roomAgents) {
      await triggerAgent(agent.id, wrapUpPrompt);
    }

    // Insert meeting ended message
    const endMsg: Message = {
      id: generateId(),
      roomId: room.id,
      agentId: null,
      role: 'system',
      content: '✅ **Meeting ended.** All agents have delivered their closing summaries.',
      timestamp: new Date().toISOString(),
    };
    addMessage(endMsg);
    setMessages(prev => [...prev, endMsg]);
  };

  const startMeeting = () => {
    if (!room) return;
    const session: MeetingSession = {
      id: generateId(),
      roomId: room.id,
      topic: meetingTopic || room.title,
      goals: meetingGoals || room.goal,
      additionalInfo: meetingAdditionalInfo,
      documents: room.documents || [],
      startTime: new Date().toISOString(),
      durationMinutes: Number(meetingDuration),
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    saveMeetingSession(session);
    const updated = {
      ...room,
      meetings: [...(room.meetings || []), session],
      activeMeetingId: session.id,
      updatedAt: new Date().toISOString(),
    };
    upsertRoom(updated);
    setRoom(updated);
    setActiveMeeting(session);
    wrapUpTriggeredRef.current = false;
    setMeetingDialogOpen(false);

    // Insert system message
    const sysMsg: Message = {
      id: generateId(),
      roomId: room.id,
      agentId: null,
      role: 'system',
      content: `🎯 **Meeting started:** "${session.topic}"\n\n**Goals:** ${session.goals}\n${session.additionalInfo ? `**Additional Info:** ${session.additionalInfo}\n` : ''}**Duration:** ${session.durationMinutes} minutes`,
      timestamp: new Date().toISOString(),
    };
    addMessage(sysMsg);
    setMessages(prev => [...prev, sysMsg]);
    toast({ title: '🎯 Meeting started', description: `${session.durationMinutes} min — ${session.topic}` });
  };

  const endMeetingEarly = () => {
    if (!activeMeeting || !room) return;
    const updated = { ...activeMeeting, status: 'ended' as const };
    saveMeetingSession(updated);
    setActiveMeeting(null);
    const roomUpdated = { ...room, activeMeetingId: undefined, updatedAt: new Date().toISOString() };
    upsertRoom(roomUpdated);
    setRoom(roomUpdated);
    const sysMsg: Message = {
      id: generateId(),
      roomId: room.id,
      agentId: null,
      role: 'system',
      content: '⏹️ **Meeting ended early.**',
      timestamp: new Date().toISOString(),
    };
    addMessage(sysMsg);
    setMessages(prev => [...prev, sysMsg]);
  };

  const runSummarizer = async (action: SummarizerAction) => {
    if (!room || loadingAgentId) return;
    setLoadingAgentId('summarizer');
    try {
      // Use room-level summarizer override if set, otherwise fall back to Lovable AI
      const summarizerSettings: SummarizerSettings | undefined =
        room.summarizer?.provider && room.summarizer?.model
          ? room.summarizer
          : undefined;

      const result = await callSummarizer(action, messages, allAgents, summarizerSettings);
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

  const updateRoomSummarizer = (patch: Partial<SummarizerSettings>) => {
    if (!room) return;
    const current = room.summarizer || { provider: 'lovable' as LLMProvider, model: 'google/gemini-3-flash-preview' };
    const updated: Room = {
      ...room,
      summarizer: { ...current, ...patch },
      updatedAt: new Date().toISOString(),
    };
    upsertRoom(updated);
    setRoom(updated);
  };

  const updateOrchestration = (type: OrchestrationType) => {
    if (!room) return;
    const updated = { ...room, orchestration: type, updatedAt: new Date().toISOString() };
    upsertRoom(updated);
    setRoom(updated);
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

    const speakCounts = new Map<string, number>();
    agents.forEach(a => speakCounts.set(a.id, 0));
    currentMessages.filter(m => m.role === 'agent').forEach(m => {
      if (m.agentId) speakCounts.set(m.agentId, (speakCounts.get(m.agentId) || 0) + 1);
    });

    const lastAgentMsg = [...currentMessages].reverse().find(m => m.role === 'agent');
    const eligible = agents.filter(a => a.id !== lastAgentMsg?.agentId);
    if (eligible.length === 0) return agents[0];

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
        const meetingCtx = getMeetingContextNow();
        const result = await callAgent(nextAgent, currentMessages, allAgents, room.documents || [], room.id, (progress) => {
          setLoopProgress(progress);
        }, meetingCtx);
        if (!autoRunningRef.current) break;

        const msg: Message = {
          id: generateId(),
          roomId: room.id,
          agentId: nextAgent.id,
          role: 'agent',
          content: result.content,
          innerThoughts: result.innerThoughts,
          codeBlocks: result.codeBlocks,
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
  const pastMeetings = getMeetingSessions(room.id).filter(m => m.status === 'ended').sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Timer color
  const timerColor = timeRemaining > 600 ? 'text-green-500' : timeRemaining > 300 ? 'text-yellow-500' : 'text-destructive';
  const timerBgColor = timeRemaining > 600 ? 'bg-green-500/10 border-green-500/30' : timeRemaining > 300 ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-destructive/10 border-destructive/30';

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
            {/* Meeting button */}
            <Dialog open={meetingDialogOpen} onOpenChange={setMeetingDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => {
                  setMeetingTopic(room.title);
                  setMeetingGoals(room.goal);
                  setMeetingAdditionalInfo('');
                  setMeetingDuration('30');
                }}>
                  <Timer className="h-3.5 w-3.5" />
                  Start Meeting
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Timer className="h-4 w-4" /> Start a Timed Meeting</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  {/* Meeting Templates */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Quick Templates</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {MEETING_TEMPLATES.map(tpl => (
                        <button
                          key={tpl.name}
                          onClick={() => {
                            setMeetingTopic(tpl.topic);
                            setMeetingGoals(tpl.goals);
                            setMeetingAdditionalInfo(tpl.additionalInfo);
                            setMeetingDuration(tpl.duration);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/10 hover:border-accent/40 transition-colors"
                        >
                          <span>{tpl.icon}</span>
                          <span>{tpl.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="meeting-topic">Topic</Label>
                    <Input id="meeting-topic" value={meetingTopic} onChange={e => setMeetingTopic(e.target.value)} placeholder="Meeting topic" />
                  </div>
                  <div>
                    <Label htmlFor="meeting-goals">Goals</Label>
                    <Textarea id="meeting-goals" value={meetingGoals} onChange={e => setMeetingGoals(e.target.value)} placeholder="What should the meeting achieve?" rows={2} />
                  </div>
                  <div>
                    <Label htmlFor="meeting-info">Additional Information</Label>
                    <Textarea id="meeting-info" value={meetingAdditionalInfo} onChange={e => setMeetingAdditionalInfo(e.target.value)} placeholder="Any extra context, constraints, or background..." rows={3} />
                  </div>
                  <div>
                    <Label>Duration</Label>
                    <Select value={meetingDuration} onValueChange={setMeetingDuration}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[2, 15, 30, 45, 60, 90, 120].map(n => (
                          <SelectItem key={n} value={String(n)}>{n} minutes</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {documents.length > 0 && (
                    <div className="rounded-md border border-border p-2.5 bg-muted/30">
                      <p className="text-xs text-muted-foreground mb-1">📄 {documents.length} document{documents.length > 1 ? 's' : ''} will be shared with agents</p>
                    </div>
                  )}
                  <Button onClick={startMeeting} className="w-full gap-2" disabled={!meetingTopic.trim()}>
                    <Play className="h-3.5 w-3.5" /> Start Meeting Now
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

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
            {/* Mobile toggle — or bubble mode panel trigger */}
            {bubbleMode ? (
              <button
                onClick={() => setBubblePanelOpen(true)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              >
                <Menu className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={() => setShowAgentPanel(!showAgentPanel)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted md:hidden"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Meeting Timer Bar */}
        {activeMeeting && activeMeeting.status !== 'ended' && (
          <div className={`flex items-center gap-3 border-b px-4 py-2 ${timerBgColor}`}>
            <Timer className={`h-4 w-4 ${timerColor} ${timeRemaining <= 300 ? 'animate-pulse' : ''}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{activeMeeting.topic}</p>
              <p className="text-[10px] text-muted-foreground">
                {activeMeeting.status === 'wrap-up' ? '⚠️ Wrap-up phase' : 'In progress'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-mono font-bold ${timerColor}`}>
                {formatTime(timeRemaining)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                / {formatTime(activeMeeting.durationMinutes * 60)}
              </span>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive" onClick={endMeetingEarly}>
                <Square className="h-3 w-3 mr-1" /> End
              </Button>
            </div>
          </div>
        )}

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

        {/* Bubble mode: Agent avatar strip */}
        {bubbleMode && roomAgents.length > 0 && (
          <div className="border-b border-border bg-card px-3 py-2.5 overflow-x-auto">
            <div className="flex items-start gap-3 min-w-max">
              {roomAgents.map((agent, idx) => (
                <button
                  key={agent.id}
                  onClick={() => !loadingAgentId && triggerAgent(agent.id)}
                  disabled={!!loadingAgentId}
                  className="flex flex-col items-center gap-1 group"
                  title={`${agent.name} — ${agent.role}`}
                >
                  <div
                    className={`relative h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground transition-transform group-hover:scale-105 ${
                      loadingAgentId === agent.id ? 'ring-2 ring-offset-1 ring-accent animate-pulse' : ''
                    }`}
                    style={{ backgroundColor: `hsl(var(--agent-${(agent.colorIndex % 6) + 1}))` }}
                  >
                    {agent.name[0].toUpperCase()}
                  </div>
                  <span className="text-[9px] font-medium text-foreground max-w-[52px] truncate leading-none">{agent.name}</span>
                  <span className="text-[8px] text-muted-foreground max-w-[52px] truncate leading-none">{agent.role}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${bubbleMode ? 'bg-amber-50/20 dark:bg-neutral-900/40' : ''}`}>
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
          {messages.map((msg, msgIdx) => {
            const agent = msg.agentId ? allAgents.find(a => a.id === msg.agentId) : null;
            const isSummarizer = msg.role === 'summarizer';
            const isUser = msg.role === 'user';
            const isSystem = msg.role === 'system';
            const agentColorIdx = agent ? (agent.colorIndex % 6) + 1 : 1;

            const metaFooter = (
              <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {msg.metadata && (
                  <>
                    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${
                      msg.metadata.provider === 'lovable' ? 'bg-accent/15 text-accent' :
                      msg.metadata.provider === 'openai' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                      msg.metadata.provider === 'anthropic' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' :
                      msg.metadata.provider === 'gemini' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                      msg.metadata.provider === 'ollama' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {msg.metadata.provider === 'lovable' ? '⚡' :
                       msg.metadata.provider === 'openai' ? '🟢' :
                       msg.metadata.provider === 'anthropic' ? '🟠' :
                       msg.metadata.provider === 'gemini' ? '🔵' :
                       msg.metadata.provider === 'ollama' ? '🟣' : '⚙️'}
                      {' '}{msg.metadata.provider}
                    </span>
                    <span className="text-muted-foreground/70 truncate max-w-[120px]" title={msg.metadata.model}>{msg.metadata.model}</span>
                    {msg.metadata.tokensUsed != null && <span>{msg.metadata.tokensUsed} tok</span>}
                    {msg.metadata.latencyMs != null && <span>{msg.metadata.latencyMs}ms</span>}
                  </>
                )}
              </div>
            );

            const proseClasses = `prose prose-sm max-w-none leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded-md [&_blockquote]:border-accent [&_blockquote]:text-muted-foreground ${isUser ? 'prose-invert' : 'dark:prose-invert'}`;

            // ---- BUBBLE MODE ----
            if (bubbleMode) {
              if (isSystem || isSummarizer) {
                // Centered pill for system/summarizer (unchanged)
                return (
                  <div key={msg.id} className="animate-fade-in">
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2.5 text-sm mx-auto text-center ${
                      isSystem
                        ? 'bg-muted/60 border border-dashed border-muted-foreground/30'
                        : 'bg-accent/10 border border-accent/20'
                    }`}>
                      {isSummarizer && (
                        <div className="flex items-center justify-center gap-1.5 mb-1.5 text-accent">
                          <Brain className="h-3.5 w-3.5" />
                          <span className="font-medium text-xs">Summarizer</span>
                        </div>
                      )}
                      <div className={proseClasses}><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                      {metaFooter}
                    </div>
                  </div>
                );
              }

              if (isUser) {
                return (
                  <div key={msg.id} className="animate-fade-in">
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm bg-secondary text-secondary-foreground">
                        <div className={proseClasses}><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                        <div className="mt-1 text-[10px] text-secondary-foreground/60 text-right">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                    {loadingAgentId && msgIdx === messages.map((m, i) => m.role === 'user' ? i : -1).filter(i => i >= 0).pop() && (
                      <div className="flex justify-end mt-1.5 animate-fade-in">
                        <div className="flex items-center gap-2 rounded-lg bg-muted/60 border border-border px-3 py-1.5 text-xs text-muted-foreground">
                          <div className="flex gap-0.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0ms' }} />
                            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '150ms' }} />
                            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '300ms' }} />
                          </div>
                          <span>{allAgents.find(a => a.id === loadingAgentId)?.name ?? 'Agent'} is thinking…</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              // Agent bubble
              return (
                <div key={msg.id} className="animate-fade-in">
                  <div className="flex items-start gap-2">
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold text-primary-foreground shrink-0 mt-0.5"
                      style={{ backgroundColor: `hsl(var(--agent-${agentColorIdx}))` }}
                    >
                      {agent?.name[0] ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5 mb-1">
                        <span className="text-xs font-semibold" style={{ color: `hsl(var(--agent-${agentColorIdx}))` }}>
                          {agent?.name}
                        </span>
                        <span className="text-[9px] text-muted-foreground">{agent?.role}</span>
                      </div>
                      <div
                        className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm"
                        style={{
                          backgroundColor: `hsl(var(--agent-${agentColorIdx}) / 0.13)`,
                          borderWidth: 1,
                          borderStyle: 'solid',
                          borderColor: `hsl(var(--agent-${agentColorIdx}) / 0.3)`,
                        }}
                      >
                        <div className={proseClasses}><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                        {msg.codeBlocks && msg.codeBlocks.filter(b => b.context === 'public').length > 0 && (
                          <CodeExecutionPanel blocks={msg.codeBlocks.filter(b => b.context === 'public')} />
                        )}
                        {msg.innerThoughts && agent && (
                          <InnerThoughtsBlock thoughts={msg.innerThoughts} agentName={agent.name} codeBlocks={msg.codeBlocks?.filter(b => b.context === 'inner')} />
                        )}
                        {metaFooter}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            // ---- DEFAULT MODE ----
            return (
              <div key={msg.id}>
                <div className={`animate-fade-in ${isUser ? 'flex justify-end' : ''}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2.5 text-sm ${
                  isUser
                    ? 'bg-secondary text-secondary-foreground ml-auto'
                    : isSystem
                    ? 'bg-muted/60 border border-dashed border-muted-foreground/30 text-center mx-auto'
                    : isSummarizer
                    ? 'bg-accent/10 border border-accent/20'
                    : agent
                    ? `border border-border`
                    : 'bg-card border border-border'
                }`}
                  style={agent ? {
                    backgroundColor: `hsl(var(--agent-${agentColorIdx}) / 0.12)`,
                    borderColor: `hsl(var(--agent-${agentColorIdx}) / 0.3)`,
                  } : undefined}
                >
                  {agent && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`h-5 w-5 rounded-full bg-${getAgentColor(agent.colorIndex)} flex items-center justify-center text-[10px] font-bold text-primary-foreground`}>
                        {agent.name[0]}
                      </div>
                      <span className="font-semibold text-xs" style={{ color: `hsl(var(--agent-${agentColorIdx}))` }}>{agent.name}</span>
                      <span className="text-[10px] text-muted-foreground">{agent.role}</span>
                    </div>
                  )}
                  {isSummarizer && (
                    <div className="flex items-center gap-1.5 mb-1.5 text-accent">
                      <Brain className="h-3.5 w-3.5" />
                      <span className="font-medium text-xs">Summarizer</span>
                    </div>
                  )}
                  <div className={proseClasses}>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.codeBlocks && msg.codeBlocks.filter(b => b.context === 'public').length > 0 && (
                    <CodeExecutionPanel blocks={msg.codeBlocks.filter(b => b.context === 'public')} />
                  )}
                  {msg.innerThoughts && agent && (
                    <InnerThoughtsBlock thoughts={msg.innerThoughts} agentName={agent.name} codeBlocks={msg.codeBlocks?.filter(b => b.context === 'inner')} />
                  )}
                  {metaFooter}
                </div>
                </div>
                {/* Processing indicator after the last user message */}
                {isUser && loadingAgentId && msgIdx === messages.map((m, i) => m.role === 'user' ? i : -1).filter(i => i >= 0).pop() && (
                  <div className="flex justify-end mt-1.5 animate-fade-in">
                    <div className="flex items-center gap-2 rounded-lg bg-muted/60 border border-border px-3 py-1.5 text-xs text-muted-foreground">
                      <div className="flex gap-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0ms' }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '150ms' }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span>
                        {(() => {
                          const loadingAgent = allAgents.find(a => a.id === loadingAgentId);
                          return loadingAgent ? `${loadingAgent.name} is thinking…` : 'Processing…';
                        })()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
        <div className="border-t border-border bg-card px-4 py-2 flex items-center gap-2 overflow-x-auto">
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
          <div className="ml-auto shrink-0">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                  <Settings2 className="h-3 w-3" />
                  {room.summarizer?.provider
                    ? <span className="hidden sm:inline">{room.summarizer.provider}</span>
                    : <span className="hidden sm:inline text-muted-foreground/60">Lovable AI</span>
                  }
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="end">
                {(() => {
                  const configuredProviders = getProviders().filter(p => p.isActive);
                  // Always include Lovable AI + all configured providers
                  const providerOptions = [
                    { id: '__lovable__', provider: 'lovable' as LLMProvider, label: '⚡ Lovable AI (built-in)', baseUrl: undefined },
                    ...configuredProviders.map(p => ({ id: p.id, provider: p.provider, label: p.label, baseUrl: p.baseUrl })),
                  ];

                  const PROVIDER_DEFAULT_MODELS: Record<string, string[]> = {
                    lovable: ['google/gemini-3-flash-preview', 'google/gemini-2.5-flash', 'google/gemini-2.5-pro', 'openai/gpt-5-mini', 'openai/gpt-5'],
                    openai: ['gpt-4o-mini', 'gpt-4o', 'o1-mini', 'o3-mini'],
                    anthropic: ['claude-haiku-4-20250514', 'claude-sonnet-4-20250514', 'claude-opus-4-20250514'],
                    gemini: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
                    azure: ['gpt-4o-mini', 'gpt-4o'],
                    ollama: [],
                    custom: [],
                  };

                  const selectedKey = room.summarizer?.provider
                    ? (room.summarizer.provider === 'lovable' ? '__lovable__' : configuredProviders.find(p => p.provider === room.summarizer?.provider && p.baseUrl === room.summarizer?.baseUrl)?.id || room.summarizer.provider)
                    : '__lovable__';

                  const selectedProviderObj = room.summarizer?.provider || 'lovable';
                  const modelOptions = PROVIDER_DEFAULT_MODELS[selectedProviderObj] || [];

                  return (
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground mb-0.5">Summarizer provider</p>
                        <p className="text-[10px] text-muted-foreground mb-2">Select from your configured providers. Defaults to Lovable AI.</p>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Provider</Label>
                        <Select
                          value={selectedKey}
                          onValueChange={(v) => {
                            if (v === '__lovable__') {
                              const updated: Room = { ...room, summarizer: undefined, updatedAt: new Date().toISOString() };
                              upsertRoom(updated);
                              setRoom(updated);
                            } else {
                              const picked = providerOptions.find(p => p.id === v);
                              if (!picked) return;
                              const defaultModels = PROVIDER_DEFAULT_MODELS[picked.provider] || [];
                              updateRoomSummarizer({ provider: picked.provider, model: defaultModels[0] || '', baseUrl: picked.baseUrl });
                            }
                          }}
                        >
                          <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {providerOptions.map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {room.summarizer?.provider && (
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Model</Label>
                          {modelOptions.length > 0 ? (
                            <Select
                              value={room.summarizer?.model || modelOptions[0]}
                              onValueChange={v => updateRoomSummarizer({ model: v })}
                            >
                              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {modelOptions.map(m => (
                                  <SelectItem key={m} value={m}>{m}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              className="mt-1 h-8 text-xs"
                              value={room.summarizer?.model || ''}
                              onChange={e => updateRoomSummarizer({ model: e.target.value })}
                              placeholder="e.g. llama3.2"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-border p-3 bg-card">
          <div className="flex gap-2">
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

      {/* Right panel - Agent roster (hidden in bubble mode) */}
      {!bubbleMode && (
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
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-medium rounded px-1.5 py-0.5 ${
                    agent.config.provider === 'lovable' ? 'bg-accent/15 text-accent' :
                    agent.config.provider === 'openai' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                    agent.config.provider === 'anthropic' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' :
                    agent.config.provider === 'gemini' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                    agent.config.provider === 'ollama' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {agent.config.provider === 'lovable' ? '⚡' :
                     agent.config.provider === 'openai' ? '🟢' :
                     agent.config.provider === 'anthropic' ? '🟠' :
                     agent.config.provider === 'gemini' ? '🔵' :
                     agent.config.provider === 'ollama' ? '🟣' : '⚙️'}
                    {' '}
                    <span className="max-w-[80px] truncate" title={agent.config.model}>
                      {agent.config.model?.split('/').pop() || agent.config.provider}
                    </span>
                  </span>
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
              <button onClick={() => fileInputRef.current?.click()} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
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
                    <button onClick={() => removeDocument(doc.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past Meetings */}
          {pastMeetings.length > 0 && (
            <div className="border-t border-border p-3">
              <button
                onClick={() => setShowPastMeetings(!showPastMeetings)}
                className="flex items-center gap-1.5 w-full text-[10px] font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground"
              >
                {showPastMeetings ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Past Meetings ({pastMeetings.length})
              </button>
              {showPastMeetings && (
                <div className="mt-2 space-y-1.5">
                  {pastMeetings.slice(0, 5).map(m => (
                    <div key={m.id} className="rounded border border-border p-2 bg-muted/20">
                      <p className="text-[10px] font-medium text-foreground truncate">{m.topic}</p>
                      <p className="text-[9px] text-muted-foreground">{m.durationMinutes}min • {new Date(m.createdAt).toLocaleDateString()}</p>
                    </div>
                  ))}
                  <button onClick={() => navigate(`/room/${room.id}/history`)} className="w-full text-center text-[10px] text-accent hover:underline mt-1">
                    View Full History →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Balance */}
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
                max={100} step={1} className="flex-1"
              />
              <span className="text-[10px] text-muted-foreground">Equal</span>
            </div>
          </div>
        </div>
      )}

      {/* Bubble mode: Sheet panel with all right-panel controls */}
      {bubbleMode && (
        <Sheet open={bubblePanelOpen} onOpenChange={setBubblePanelOpen}>
          <SheetContent side="right" className="w-72 overflow-y-auto p-0">
            <SheetHeader className="border-b border-border px-4 py-3">
              <SheetTitle className="text-sm">Room Controls</SheetTitle>
            </SheetHeader>
            <div className="p-3 space-y-2">
              {roomAgents.map((agent) => (
                <div key={agent.id} className="rounded-md border border-border p-2.5 group">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold text-primary-foreground"
                      style={{ backgroundColor: `hsl(var(--agent-${(agent.colorIndex % 6) + 1}))` }}
                    >
                      {agent.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">{agent.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{agent.role}</div>
                    </div>
                    <button onClick={() => removeAgentFromRoom(agent.id)} className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    onClick={() => { triggerAgent(agent.id); setBubblePanelOpen(false); }}
                    disabled={!!loadingAgentId}
                    className="mt-2 w-full rounded bg-muted px-2 py-1 text-[10px] font-medium text-foreground hover:bg-muted-foreground/10 transition-colors disabled:opacity-50"
                  >
                    {loadingAgentId === agent.id ? 'Thinking…' : 'Speak now'}
                  </button>
                  {agent.memoryEnabled && (
                    <button
                      onClick={() => setMemoryPanelAgentId(memoryPanelAgentId === agent.id ? null : agent.id)}
                      className="mt-1 text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                    >
                      <Database className="h-2.5 w-2.5" /> Memory
                    </button>
                  )}
                </div>
              ))}
              {availableAgents.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-[10px] text-muted-foreground mb-2">Add to room:</p>
                  {availableAgents.map((agent) => (
                    <button key={agent.id} onClick={() => addAgentToRoom(agent.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                      <Plus className="h-3 w-3" /> {agent.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Documents */}
            <div className="border-t border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Documents</p>
                <button onClick={() => fileInputRef.current?.click()} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              {documents.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic">No documents loaded</p>
              ) : (
                <div className="space-y-1">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-1.5 text-[10px] group">
                      <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-foreground truncate flex-1">{doc.name}</span>
                      <button onClick={() => removeDocument(doc.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Past Meetings */}
            {pastMeetings.length > 0 && (
              <div className="border-t border-border p-3">
                <button onClick={() => setShowPastMeetings(!showPastMeetings)} className="flex items-center gap-1.5 w-full text-[10px] font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground">
                  {showPastMeetings ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Past Meetings ({pastMeetings.length})
                </button>
                {showPastMeetings && (
                  <div className="mt-2 space-y-1.5">
                    {pastMeetings.slice(0, 5).map(m => (
                      <div key={m.id} className="rounded border border-border p-2 bg-muted/20">
                        <p className="text-[10px] font-medium text-foreground truncate">{m.topic}</p>
                        <p className="text-[9px] text-muted-foreground">{m.durationMinutes}min • {new Date(m.createdAt).toLocaleDateString()}</p>
                      </div>
                    ))}
                    <button onClick={() => navigate(`/room/${room.id}/history`)} className="w-full text-center text-[10px] text-accent hover:underline mt-1">
                      View Full History →
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* Balance */}
            <div className="border-t border-border p-3">
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
                  max={100} step={1} className="flex-1"
                />
                <span className="text-[10px] text-muted-foreground">Equal</span>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

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
