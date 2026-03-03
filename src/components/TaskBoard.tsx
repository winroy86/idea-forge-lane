import { useState } from 'react';
import { AgentTask, AgentTaskStatus, Agent } from '@/types';
import { updateTask, deleteTask, addTask } from '@/lib/taskStore';
import { CheckCircle2, Circle, Clock, AlertTriangle, Trash2, ChevronDown, ChevronRight, Flag, Plus, X } from 'lucide-react';
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

const STATUS_CONFIG: Record<AgentTaskStatus, { label: string; icon: typeof Circle; color: string }> = {
  'todo': { label: 'To Do', icon: Circle, color: 'text-muted-foreground' },
  'in-progress': { label: 'In Progress', icon: Clock, color: 'text-accent' },
  'done': { label: 'Done', icon: CheckCircle2, color: 'text-emerald-500' },
  'blocked': { label: 'Blocked', icon: AlertTriangle, color: 'text-destructive' },
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-destructive',
  medium: 'text-amber-500',
  low: 'text-muted-foreground',
};

interface TaskBoardProps {
  tasks: AgentTask[];
  agents: Agent[];
  roomId: string;
  onTasksChanged: () => void;
}

function TaskCard({ task, agents, onChanged }: { task: AgentTask; agents: Agent[]; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const StatusIcon = STATUS_CONFIG[task.status].icon;
  const assignee = agents.find(a => a.id === task.assigneeAgentId);
  const creator = agents.find(a => a.id === task.createdByAgentId);

  const cycleStatus = () => {
    const order: AgentTaskStatus[] = ['todo', 'in-progress', 'done'];
    const idx = order.indexOf(task.status);
    const next = order[(idx + 1) % order.length];
    updateTask(task.id, { status: next });
    onChanged();
  };

  return (
    <div className="rounded-md border border-border p-2 bg-card hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-1.5">
        <button onClick={cycleStatus} className={`mt-0.5 shrink-0 ${STATUS_CONFIG[task.status].color}`}>
          <StatusIcon className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <button onClick={() => setExpanded(!expanded)} className="flex items-start gap-1 text-left w-full">
            <span className={`text-[11px] font-medium leading-tight ${task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
              {task.title}
            </span>
          </button>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <Flag className={`h-2.5 w-2.5 ${PRIORITY_COLORS[task.priority]}`} />
            {assignee && (
              <span className="text-[9px] bg-muted rounded px-1 py-0.5 text-muted-foreground">
                {assignee.name}
              </span>
            )}
          </div>
        </div>
        <button onClick={() => { deleteTask(task.id); onChanged(); }} className="shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {expanded && (
        <div className="mt-2 pl-5 space-y-1">
          <p className="text-[10px] text-muted-foreground">{task.description}</p>
          {task.deliverable && (
            <div className="rounded bg-muted p-1.5 text-[10px] text-foreground">
              <span className="font-medium">📦 Deliverable:</span> {task.deliverable}
            </div>
          )}
          {creator && (
            <p className="text-[9px] text-muted-foreground/60">Created by {creator.name}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function TaskBoard({ tasks, agents, roomId, onTasksChanged }: TaskBoardProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newAssignee, setNewAssignee] = useState<string>('');

  const grouped: Record<AgentTaskStatus, AgentTask[]> = {
    'todo': [],
    'in-progress': [],
    'blocked': [],
    'done': [],
  };

  tasks.forEach(t => {
    if (grouped[t.status]) grouped[t.status].push(t);
  });

  const statuses: AgentTaskStatus[] = ['in-progress', 'todo', 'blocked', 'done'];

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    const task: AgentTask = {
      id: crypto.randomUUID(),
      roomId,
      title: newTitle.trim(),
      description: newDesc.trim(),
      status: 'todo',
      priority: newPriority,
      assigneeAgentId: newAssignee || null,
      createdByAgentId: 'user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    addTask(task);
    setNewTitle('');
    setNewDesc('');
    setNewPriority('medium');
    setNewAssignee('');
    setShowForm(false);
    onTasksChanged();
  };

  return (
    <div className="space-y-2">
      {/* Add Task Button / Form */}
      {!showForm ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowForm(true)}
          className="w-full text-[10px] h-7 gap-1"
        >
          <Plus className="h-3 w-3" /> Add Task
        </Button>
      ) : (
        <div className="rounded-md border border-border p-2 bg-card space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">New Task</span>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
          <Input
            placeholder="Task title"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            className="h-7 text-[11px]"
          />
          <Textarea
            placeholder="Description (optional)"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            className="text-[11px] min-h-[40px] resize-none"
            rows={2}
          />
          <div className="flex gap-1.5">
            <Select value={newPriority} onValueChange={(v) => setNewPriority(v as 'low' | 'medium' | 'high')}>
              <SelectTrigger className="h-7 text-[10px] flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            {agents.length > 0 && (
              <Select value={newAssignee} onValueChange={setNewAssignee}>
                <SelectTrigger className="h-7 text-[10px] flex-1">
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <Button size="sm" onClick={handleCreate} disabled={!newTitle.trim()} className="w-full h-7 text-[10px]">
            Create Task
          </Button>
        </div>
      )}

      {tasks.length === 0 && !showForm && (
        <p className="text-[10px] text-muted-foreground italic text-center py-2">No tasks yet. Add one or let agents create them.</p>
      )}

      {statuses.map(status => {
        const items = grouped[status];
        if (items.length === 0) return null;
        const config = STATUS_CONFIG[status];
        const isCollapsed = collapsed[status];
        const Icon = config.icon;
        return (
          <div key={status}>
            <button
              onClick={() => setCollapsed(c => ({ ...c, [status]: !c[status] }))}
              className="flex items-center gap-1.5 w-full text-left mb-1"
            >
              {isCollapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
              <Icon className={`h-3 w-3 ${config.color}`} />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {config.label} ({items.length})
              </span>
            </button>
            {!isCollapsed && (
              <div className="space-y-1 ml-1">
                {items.map(task => (
                  <TaskCard key={task.id} task={task} agents={agents} onChanged={onTasksChanged} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
