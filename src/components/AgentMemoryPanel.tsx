import { useState, useEffect } from 'react';
import { X, Trash2, FileText, ChevronDown, ChevronRight, Database, Edit2, Save } from 'lucide-react';
import { AgentMemoryFile, MemoryCategory } from '@/types';
import { getAgentMemories, getMemoriesByScope, deleteMemoryFile, writeMemoryFile } from '@/lib/agentMemory';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CATEGORY_ICONS: Record<MemoryCategory, string> = {
  'long-term': '🧠',
  'short-term': '⚡',
  'research': '🔬',
  'task': '📋',
  'scratch': '📝',
};

interface AgentMemoryPanelProps {
  agentId: string;
  agentName: string;
  roomId?: string;
  onClose: () => void;
}

export default function AgentMemoryPanel({ agentId, agentName, roomId, onClose }: AgentMemoryPanelProps) {
  const [memories, setMemories] = useState<AgentMemoryFile[]>([]);
  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'local'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const refresh = () => {
    let files: AgentMemoryFile[];
    if (scopeFilter === 'global') {
      files = getMemoriesByScope(agentId, 'global');
    } else if (scopeFilter === 'local' && roomId) {
      files = getMemoriesByScope(agentId, roomId);
    } else {
      files = getAgentMemories(agentId);
    }
    files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setMemories(files);
  };

  useEffect(refresh, [agentId, scopeFilter, roomId]);

  const handleDelete = (id: string) => {
    deleteMemoryFile(id);
    refresh();
  };

  const handleSaveEdit = (file: AgentMemoryFile) => {
    writeMemoryFile(file.agentId, file.scope, file.filename, editContent, file.category);
    setEditingId(null);
    refresh();
  };

  const grouped = new Map<MemoryCategory, AgentMemoryFile[]>();
  memories.forEach(f => {
    const list = grouped.get(f.category) || [];
    list.push(f);
    grouped.set(f.category, list);
  });

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-card border-l border-border z-50 flex flex-col animate-fade-in shadow-lg">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">{agentName}'s Memory</h3>
        </div>
        <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 py-2 border-b border-border">
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
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {memories.length === 0 ? (
          <div className="text-center py-8">
            <Database className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No memory files yet</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Memories are created during research loops</p>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([category, files]) => (
            <div key={category}>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                {CATEGORY_ICONS[category]} {category}
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
                      </button>
                      {isExpanded && (
                        <div className="px-2 pb-2 border-t border-border/50">
                          {isEditing ? (
                            <div className="mt-1.5">
                              <Textarea
                                value={editContent}
                                onChange={e => setEditContent(e.target.value)}
                                className="text-[11px] min-h-[100px]"
                              />
                              <div className="flex gap-1 mt-1">
                                <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => setEditingId(null)}>Cancel</Button>
                                <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => handleSaveEdit(file)}>
                                  <Save className="h-2.5 w-2.5" /> Save
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <pre className="mt-1.5 text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                                {file.content}
                              </pre>
                              <div className="flex items-center justify-between mt-1.5">
                                <span className="text-[9px] text-muted-foreground/50">
                                  {new Date(file.updatedAt).toLocaleString()}
                                </span>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => { setEditingId(file.id); setEditContent(file.content); }}
                                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(file.id)}
                                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
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

      <div className="border-t border-border px-4 py-2">
        <p className="text-[10px] text-muted-foreground">
          {memories.length} file{memories.length !== 1 ? 's' : ''} · {memories.filter(m => m.scope === 'global').length} global
        </p>
      </div>
    </div>
  );
}
