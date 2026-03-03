import { useState, useEffect, useMemo } from 'react';
import { X, Trash2, FileText, ChevronDown, ChevronRight, Database, Edit2, Save, Plus, Download, AlertTriangle, BarChart3 } from 'lucide-react';
import { Agent, AgentMemoryFile, MemoryCategory, MemoryScope } from '@/types';
import { getAgentMemories, getMemoriesByScope, deleteMemoryFile, writeMemoryFile, deleteAgentMemories, getCompactMemorySummary } from '@/lib/agentMemory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const CATEGORY_ICONS: Record<MemoryCategory, string> = {
  'long-term': '🧠',
  'short-term': '⚡',
  'research': '🔬',
  'task': '📋',
  'scratch': '📝',
};

const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  'long-term': 'bg-primary/10 text-primary border-primary/20',
  'short-term': 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  'research': 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  'task': 'bg-green-500/10 text-green-600 border-green-500/20',
  'scratch': 'bg-muted text-muted-foreground border-border',
};

function ContextWindowIndicator({ agent, roomId }: { agent: Agent; roomId?: string }) {
  const stats = useMemo(() => {
    // System prompt size
    const systemPromptBase = (agent.systemPrompt || `You are ${agent.name}, a ${agent.role}.`).length;
    const domainLen = agent.domain ? agent.domain.length + 30 : 0;
    const styleLen = agent.styleVoice ? agent.styleVoice.length + 30 : 0;
    const workStyleLen = 400; // approximate work style directive
    const systemPromptChars = systemPromptBase + domainLen + styleLen + workStyleLen;

    // Memory injection size (what actually gets injected)
    const memoryInjection = agent.memoryEnabled
      ? getCompactMemorySummary(agent.id, roomId, undefined, agent.memoryTokenBudget).length
      : 0;

    const memoryBudget = agent.memoryTokenBudget || 2000;
    const historyWindow = agent.historyWindowSize || 20;
    // Estimate: avg message ~200 chars
    const estimatedHistoryChars = historyWindow * 200;

    const totalEstimated = systemPromptChars + memoryInjection + estimatedHistoryChars;
    // Rough context limits by model type (chars, ~4 chars/token)
    const contextLimitChars = (agent.config.maxTokens || 4096) * 4 * 4; // assume 4x output tokens for input

    return {
      systemPromptChars,
      memoryInjection,
      memoryBudget,
      historyWindow,
      estimatedHistoryChars,
      totalEstimated,
      contextLimitChars,
    };
  }, [agent, roomId]);

  const segments = [
    { label: 'System Prompt', chars: stats.systemPromptChars, color: 'bg-blue-500' },
    { label: 'Memory', chars: stats.memoryInjection, color: 'bg-amber-500' },
    { label: `History (~${stats.historyWindow} msgs)`, chars: stats.estimatedHistoryChars, color: 'bg-emerald-500' },
  ];

  const total = segments.reduce((s, seg) => s + seg.chars, 0);

  return (
    <div className="px-4 py-2 border-b border-border space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
        <BarChart3 className="h-3 w-3" />
        Context Window Usage (estimated)
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-muted">
        {segments.map(seg => {
          const pct = total > 0 ? (seg.chars / Math.max(total, stats.contextLimitChars)) * 100 : 0;
          return (
            <div
              key={seg.label}
              className={`${seg.color} transition-all`}
              style={{ width: `${Math.max(pct, 0.5)}%` }}
              title={`${seg.label}: ~${(seg.chars / 4).toFixed(0)} tokens`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {segments.map(seg => (
          <span key={seg.label} className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${seg.color}`} />
            {seg.label}: ~{(seg.chars / 4).toFixed(0)}t
          </span>
        ))}
        <span className="text-[9px] text-muted-foreground/60 ml-auto">
          Total: ~{(total / 4).toFixed(0)} tokens
        </span>
      </div>
    </div>
  );
}

interface AgentMemoryPanelProps {
  agentId: string;
  agentName: string;
  roomId?: string;
  agent?: Agent; // optional, for context window stats
  onClose: () => void;
}

export default function AgentMemoryPanel({ agentId, agentName, roomId, agent, onClose }: AgentMemoryPanelProps) {
  const [memories, setMemories] = useState<AgentMemoryFile[]>([]);
  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'local'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | MemoryCategory>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [newFilename, setNewFilename] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('long-term');
  const [newScope, setNewScope] = useState<'global' | 'local'>('global');

  const refresh = () => {
    let files: AgentMemoryFile[];
    if (scopeFilter === 'global') {
      files = getMemoriesByScope(agentId, 'global');
    } else if (scopeFilter === 'local' && roomId) {
      files = getMemoriesByScope(agentId, roomId);
    } else {
      files = getAgentMemories(agentId);
    }
    if (categoryFilter !== 'all') {
      files = files.filter(f => f.category === categoryFilter);
    }
    files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setMemories(files);
  };

  useEffect(refresh, [agentId, scopeFilter, categoryFilter, roomId]);

  const handleDelete = (id: string) => {
    deleteMemoryFile(id);
    refresh();
  };

  const handleSaveEdit = (file: AgentMemoryFile) => {
    writeMemoryFile(file.agentId, file.scope, file.filename, editContent, file.category);
    setEditingId(null);
    refresh();
  };

  const handleCreate = () => {
    if (!newFilename.trim()) return;
    const scope: MemoryScope = newScope === 'local' && roomId ? roomId : 'global';
    writeMemoryFile(agentId, scope, newFilename.trim(), newContent, newCategory);
    setShowCreateDialog(false);
    setNewFilename('');
    setNewContent('');
    refresh();
  };

  const handleClearAll = () => {
    if (scopeFilter === 'global') {
      deleteAgentMemories(agentId, 'global');
    } else if (scopeFilter === 'local' && roomId) {
      deleteAgentMemories(agentId, roomId);
    } else {
      deleteAgentMemories(agentId);
    }
    setShowClearConfirm(false);
    refresh();
  };

  const handleExport = () => {
    const all = getAgentMemories(agentId);
    const json = JSON.stringify(all, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agentName.toLowerCase().replace(/\s+/g, '-')}-memory.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Category counts for badges
  const allFiles = scopeFilter === 'global'
    ? getMemoriesByScope(agentId, 'global')
    : scopeFilter === 'local' && roomId
      ? getMemoriesByScope(agentId, roomId)
      : getAgentMemories(agentId);

  const categoryCounts = new Map<MemoryCategory, number>();
  allFiles.forEach(f => categoryCounts.set(f.category, (categoryCounts.get(f.category) || 0) + 1));

  const grouped = new Map<MemoryCategory, AgentMemoryFile[]>();
  memories.forEach(f => {
    const list = grouped.get(f.category) || [];
    list.push(f);
    grouped.set(f.category, list);
  });

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-card border-l border-border z-50 flex flex-col animate-fade-in shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">{agentName}'s Memory</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleExport} title="Export all">
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowCreateDialog(true)} title="Create new file">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-2 border-b border-border space-y-2">
        <Select value={scopeFilter} onValueChange={v => setScopeFilter(v as any)}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All memories</SelectItem>
            <SelectItem value="global">Global only</SelectItem>
            {roomId && <SelectItem value="local">This room only</SelectItem>}
          </SelectContent>
        </Select>
        {/* Category filter chips */}
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`rounded-full px-2 py-0.5 text-[10px] border transition-colors ${
              categoryFilter === 'all' ? 'bg-foreground text-background border-foreground' : 'bg-muted text-muted-foreground border-border hover:border-foreground/30'
            }`}
          >
            All ({allFiles.length})
          </button>
          {(['long-term', 'short-term', 'research', 'task', 'scratch'] as MemoryCategory[]).map(cat => {
            const count = categoryCounts.get(cat) || 0;
            if (count === 0) return null;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(categoryFilter === cat ? 'all' : cat)}
                className={`rounded-full px-2 py-0.5 text-[10px] border transition-colors ${
                  categoryFilter === cat ? CATEGORY_COLORS[cat] + ' font-medium' : 'bg-muted text-muted-foreground border-border hover:border-foreground/30'
                }`}
              >
                {CATEGORY_ICONS[cat]} {count}
              </button>
            );
          })}
        </div>
      </div>

      {/* Context Window Usage Indicator */}
      {agent && (
        <ContextWindowIndicator agent={agent} roomId={roomId} />
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {memories.length === 0 ? (
          <div className="text-center py-8">
            <Database className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No memory files yet</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Create one or let agents build memories during research</p>
            <Button variant="outline" size="sm" className="mt-3 gap-1.5 text-xs" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-3 w-3" /> Create Memory File
            </Button>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([category, files]) => (
            <div key={category}>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                {CATEGORY_ICONS[category]} {category} <span className="text-muted-foreground/50">({files.length})</span>
              </p>
              <div className="space-y-1">
                {files.map(file => {
                  const isExpanded = expandedId === file.id;
                  const isEditing = editingId === file.id;

                  return (
                    <div key={file.id} className="rounded border border-border bg-background">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : file.id)}
                        className="flex items-center gap-1.5 w-full px-2 py-1.5 text-left"
                      >
                        {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                        <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="text-xs text-foreground truncate flex-1">{file.filename}</span>
                        <span className="text-[9px] text-muted-foreground/60 shrink-0">
                          {file.scope === 'global' ? '🌐' : '📌'}
                        </span>
                        <span className="text-[9px] text-muted-foreground/40 shrink-0">
                          {file.content.length}c
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="px-2 pb-2 border-t border-border/50">
                          {isEditing ? (
                            <div className="mt-1.5">
                              <Textarea
                                value={editContent}
                                onChange={e => setEditContent(e.target.value)}
                                className="text-[11px] min-h-[120px] font-mono"
                              />
                              <div className="flex gap-1 mt-1.5">
                                <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setEditingId(null)}>Cancel</Button>
                                <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => handleSaveEdit(file)}>
                                  <Save className="h-2.5 w-2.5" /> Save
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <pre className="mt-1.5 text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto font-mono">
                                {file.content}
                              </pre>
                              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-border/30">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${CATEGORY_COLORS[file.category]}`}>
                                    {file.category}
                                  </Badge>
                                  <span className="text-[9px] text-muted-foreground/50">
                                    {new Date(file.updatedAt).toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => { setEditingId(file.id); setEditContent(file.content); }}
                                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                                    title="Edit"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(file.id)}
                                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                                    title="Delete"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-2 flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">
          {memories.length} file{memories.length !== 1 ? 's' : ''} · {memories.reduce((sum, m) => sum + m.content.length, 0).toLocaleString()} chars
        </p>
        {memories.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
            onClick={() => setShowClearConfirm(true)}
          >
            <Trash2 className="h-2.5 w-2.5" /> Clear {scopeFilter === 'all' ? 'all' : scopeFilter}
          </Button>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Plus className="h-4 w-4" /> Create Memory File
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Filename</label>
              <Input
                value={newFilename}
                onChange={e => setNewFilename(e.target.value)}
                placeholder="e.g. project-notes.md"
                className="text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                <Select value={newCategory} onValueChange={v => setNewCategory(v as MemoryCategory)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['long-term', 'short-term', 'research', 'task', 'scratch'] as MemoryCategory[]).map(cat => (
                      <SelectItem key={cat} value={cat}>{CATEGORY_ICONS[cat]} {cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Scope</label>
                <Select value={newScope} onValueChange={v => setNewScope(v as any)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">🌐 Global</SelectItem>
                    {roomId && <SelectItem value="local">📌 This room</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Content</label>
              <Textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                placeholder="Write memory content here..."
                rows={6}
                className="text-sm font-mono"
              />
            </div>
            <Button onClick={handleCreate} disabled={!newFilename.trim()} className="w-full gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Create File
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clear Confirmation Dialog */}
      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" /> Clear Memory
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete {scopeFilter === 'all' ? 'all' : scopeFilter} memory files for {agentName}. This action cannot be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowClearConfirm(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleClearAll} className="gap-1">
              <Trash2 className="h-3 w-3" /> Delete All
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
