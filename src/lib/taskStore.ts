import { AgentTask, AgentTaskStatus } from '@/types';

const STORAGE_KEY = 'br_agent_tasks';

function load(): AgentTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(tasks: AgentTask[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

export function getTasksForRoom(roomId: string): AgentTask[] {
  return load().filter(t => t.roomId === roomId);
}

export function addTask(task: AgentTask) {
  const all = load();
  all.push(task);
  save(all);
}

export function updateTask(taskId: string, updates: Partial<AgentTask>) {
  const all = load();
  const idx = all.findIndex(t => t.id === taskId);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
    if (updates.status === 'done' && !all[idx].completedAt) {
      all[idx].completedAt = new Date().toISOString();
    }
    save(all);
  }
}

export function deleteTask(taskId: string) {
  save(load().filter(t => t.id !== taskId));
}

export function clearRoomTasks(roomId: string) {
  save(load().filter(t => t.roomId !== roomId));
}

/** Parse TASK_* actions from agent output and apply them */
export function parseAndApplyTaskActions(
  content: string,
  roomId: string,
  agentId: string,
  allAgentIds: string[],
): { tasksCreated: AgentTask[]; tasksUpdated: string[] } {
  const tasksCreated: AgentTask[] = [];
  const tasksUpdated: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.startsWith('TASK_CREATE|')) {
      const parts = line.split('|');
      if (parts.length >= 4) {
        const title = parts[1].trim();
        const description = parts[2].trim();
        const priority = (['low', 'medium', 'high'].includes(parts[3]?.trim()) ? parts[3].trim() : 'medium') as AgentTask['priority'];
        const assignee = parts[4]?.trim() || null;
        const task: AgentTask = {
          id: crypto.randomUUID(),
          roomId,
          title,
          description,
          status: 'todo',
          priority,
          assigneeAgentId: assignee && allAgentIds.includes(assignee) ? assignee : agentId,
          createdByAgentId: agentId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        addTask(task);
        tasksCreated.push(task);
      }
    } else if (line.startsWith('TASK_UPDATE|')) {
      const parts = line.split('|');
      if (parts.length >= 3) {
        const taskId = parts[1].trim();
        const newStatus = parts[2].trim() as AgentTaskStatus;
        const deliverable = parts.length >= 4 ? parts.slice(3).join('|').trim() : undefined;
        if (['todo', 'in-progress', 'done', 'blocked'].includes(newStatus)) {
          updateTask(taskId, { status: newStatus, ...(deliverable ? { deliverable } : {}) });
          tasksUpdated.push(taskId);
        }
      }
    }
  }

  return { tasksCreated, tasksUpdated };
}
