import { AgentMemoryFile, MemoryCategory, MemoryScope } from '@/types';

const STORAGE_KEY = 'br_agent_memory';
const MAX_FILE_CONTENT = 10000;
const MAX_SHORT_TERM_FILES = 20;
const MEMORY_TOKEN_BUDGET = 2000; // ~500 tokens
const MEMORY_TRUNCATE_LEN = 300;

// Priority order for memory categories (higher = more important)
const CATEGORY_PRIORITY: Record<MemoryCategory, number> = {
  'research': 3,
  'long-term': 2,
  'short-term': 1,
  'task': 2,
  'scratch': 0,
};

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

/**
 * Simple keyword overlap score between a memory file and a topic string.
 * Returns 0-1 where 1 = high relevance.
 */
function relevanceScore(file: AgentMemoryFile, topic: string): number {
  if (!topic) return 0.5; // neutral if no topic
  const topicWords = new Set(
    topic.toLowerCase().split(/\W+/).filter(w => w.length > 2)
  );
  if (topicWords.size === 0) return 0.5;

  const fileText = `${file.filename} ${file.content}`.toLowerCase();
  let matches = 0;
  for (const word of topicWords) {
    if (fileText.includes(word)) matches++;
  }
  return matches / topicWords.size;
}

/**
 * Budget-aware, relevance-filtered memory summary for injection into prompts.
 * Prioritizes: room-local > global, research > long-term > short-term.
 * Truncates each file to MEMORY_TRUNCATE_LEN chars.
 * Stops when MEMORY_TOKEN_BUDGET chars are reached.
 * Optionally filters by keyword overlap with currentTopic.
 */
export function getCompactMemorySummary(
  agentId: string,
  roomId?: string,
  currentTopic?: string,
): string {
  // Gather all relevant memories
  const memories = roomId
    ? getAgentMemories(agentId, roomId)
    : getAgentMemories(agentId, 'global');

  if (memories.length === 0) return '';

  // Score and sort memories by: relevance, scope priority (room-local first), category priority
  const scored = memories.map(f => ({
    file: f,
    relevance: currentTopic ? relevanceScore(f, currentTopic) : 0.5,
    scopeBoost: f.scope !== 'global' ? 1 : 0,
    categoryPriority: CATEGORY_PRIORITY[f.category] || 0,
  }));

  // Filter out very irrelevant memories when topic is provided
  const filtered = currentTopic
    ? scored.filter(s => s.relevance > 0.1)
    : scored;

  // Sort: highest relevance first, then scope boost, then category priority, then recency
  filtered.sort((a, b) => {
    const score = (s: typeof a) =>
      s.relevance * 3 + s.scopeBoost * 2 + s.categoryPriority;
    const diff = score(b) - score(a);
    if (Math.abs(diff) > 0.01) return diff;
    return b.file.updatedAt.localeCompare(a.file.updatedAt);
  });

  let summary = '\n\n--- YOUR MEMORY FILES ---\n';
  let budget = MEMORY_TOKEN_BUDGET;

  for (const { file } of filtered) {
    if (budget <= 0) break;

    const scopeLabel = file.scope === 'global' ? '(global)' : '(room-local)';
    const truncContent = file.content.length > MEMORY_TRUNCATE_LEN
      ? file.content.slice(0, MEMORY_TRUNCATE_LEN) + '...'
      : file.content;
    const entry = `[${file.category.toUpperCase()}] 📄 ${file.filename} ${scopeLabel}:\n${truncContent}\n\n`;

    budget -= entry.length;
    summary += entry;
  }

  summary += '--- END MEMORY FILES ---\n';
  return summary;
}

/** @deprecated Use getCompactMemorySummary instead for budget-aware injection */
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
