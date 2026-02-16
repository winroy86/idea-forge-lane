import { AgentMemoryFile, MemoryCategory, MemoryScope } from '@/types';

const STORAGE_KEY = 'br_agent_memory';
const MAX_FILE_CONTENT = 10000;
const MAX_SHORT_TERM_FILES = 20;

function loadAll(): AgentMemoryFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(files: AgentMemoryFile[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
}

export function getAgentMemories(agentId: string, scope?: MemoryScope): AgentMemoryFile[] {
  const all = loadAll().filter(f => f.agentId === agentId);
  if (!scope) return all;
  if (scope === 'global') return all.filter(f => f.scope === 'global');
  // Return both global and room-scoped
  return all.filter(f => f.scope === 'global' || f.scope === scope);
}

export function getMemoriesByScope(agentId: string, scope: MemoryScope): AgentMemoryFile[] {
  return loadAll().filter(f => f.agentId === agentId && f.scope === scope);
}

export function readMemoryFile(id: string): AgentMemoryFile | null {
  return loadAll().find(f => f.id === id) || null;
}

export function writeMemoryFile(
  agentId: string,
  scope: MemoryScope,
  filename: string,
  content: string,
  category: MemoryCategory,
): AgentMemoryFile {
  const all = loadAll();
  const existing = all.find(f => f.agentId === agentId && f.scope === scope && f.filename === filename);
  const now = new Date().toISOString();
  const truncated = content.slice(0, MAX_FILE_CONTENT);

  if (existing) {
    existing.content = truncated;
    existing.category = category;
    existing.updatedAt = now;
    saveAll(all);
    return existing;
  }

  const file: AgentMemoryFile = {
    id: crypto.randomUUID(),
    agentId,
    scope,
    filename,
    category,
    content: truncated,
    createdAt: now,
    updatedAt: now,
  };
  all.push(file);

  // Auto-prune short-term memories
  const shortTerm = all.filter(f => f.agentId === agentId && f.category === 'short-term');
  if (shortTerm.length > MAX_SHORT_TERM_FILES) {
    shortTerm.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    const toRemove = shortTerm.slice(0, shortTerm.length - MAX_SHORT_TERM_FILES);
    const removeIds = new Set(toRemove.map(f => f.id));
    const pruned = all.filter(f => !removeIds.has(f.id));
    saveAll(pruned);
    return file;
  }

  saveAll(all);
  return file;
}

export function deleteMemoryFile(id: string) {
  saveAll(loadAll().filter(f => f.id !== id));
}

export function deleteAgentMemories(agentId: string, scope?: MemoryScope) {
  if (scope) {
    saveAll(loadAll().filter(f => !(f.agentId === agentId && f.scope === scope)));
  } else {
    saveAll(loadAll().filter(f => f.agentId !== agentId));
  }
}

export function getMemorySummaryForPrompt(agentId: string, roomId?: string): string {
  const memories = roomId
    ? getAgentMemories(agentId, roomId)
    : getAgentMemories(agentId, 'global');

  if (memories.length === 0) return '';

  let summary = '\n\n--- YOUR MEMORY FILES ---\n';
  const byCategory = new Map<string, AgentMemoryFile[]>();
  memories.forEach(f => {
    const list = byCategory.get(f.category) || [];
    list.push(f);
    byCategory.set(f.category, list);
  });

  for (const [cat, files] of byCategory) {
    summary += `\n[${cat.toUpperCase()}]\n`;
    files.forEach(f => {
      const scopeLabel = f.scope === 'global' ? '(global)' : '(room-local)';
      summary += `📄 ${f.filename} ${scopeLabel}:\n${f.content}\n\n`;
    });
  }
  summary += '--- END MEMORY FILES ---\n';
  return summary;
}
