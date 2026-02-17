import { Agent, Room, Message, ProviderConfig, MeetingSession } from '@/types';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T) {
  localStorage.setItem(key, JSON.stringify(data));
}

const KEYS = {
  rooms: 'br_rooms',
  agents: 'br_agents',
  messages: 'br_messages',
  providers: 'br_providers',
  meetings: 'br_meetings',
};

// Rooms
export const getRooms = (): Room[] => load(KEYS.rooms, []);
export const saveRooms = (rooms: Room[]) => save(KEYS.rooms, rooms);
export const getRoom = (id: string) => getRooms().find(r => r.id === id);
export const upsertRoom = (room: Room) => {
  const rooms = getRooms().filter(r => r.id !== room.id);
  rooms.push(room);
  saveRooms(rooms);
};
export const deleteRoom = (id: string) => saveRooms(getRooms().filter(r => r.id !== id));

// Agents
export const getAgents = (): Agent[] => load(KEYS.agents, []);
export const saveAgents = (agents: Agent[]) => save(KEYS.agents, agents);
export const getAgent = (id: string) => getAgents().find(a => a.id === id);
export const upsertAgent = (agent: Agent) => {
  const agents = getAgents().filter(a => a.id !== agent.id);
  agents.push(agent);
  saveAgents(agents);
};
export const deleteAgent = (id: string) => saveAgents(getAgents().filter(a => a.id !== id));

// Messages
export const getMessages = (roomId: string): Message[] =>
  load<Message[]>(KEYS.messages, []).filter(m => m.roomId === roomId);
export const getAllMessages = (): Message[] => load(KEYS.messages, []);
export const addMessage = (msg: Message) => {
  const all = getAllMessages();
  all.push(msg);
  save(KEYS.messages, all);
};
export const clearMessages = (roomId: string) => {
  save(KEYS.messages, getAllMessages().filter(m => m.roomId !== roomId));
};

// Providers
export const getProviders = (): ProviderConfig[] => load(KEYS.providers, []);
export const saveProviders = (providers: ProviderConfig[]) => save(KEYS.providers, providers);
export const upsertProvider = (p: ProviderConfig) => {
  const providers = getProviders().filter(x => x.id !== p.id);
  providers.push(p);
  saveProviders(providers);
};
export const deleteProvider = (id: string) => saveProviders(getProviders().filter(p => p.id !== id));

// Meetings
export const getAllMeetings = (): MeetingSession[] => load(KEYS.meetings, []);
export const getMeetingSessions = (roomId: string): MeetingSession[] =>
  getAllMeetings().filter(m => m.roomId === roomId);
export const saveMeetingSession = (session: MeetingSession) => {
  const all = getAllMeetings().filter(m => m.id !== session.id);
  all.push(session);
  save(KEYS.meetings, all);
};
export const getActiveMeeting = (roomId: string): MeetingSession | undefined => {
  const room = getRoom(roomId);
  if (!room?.activeMeetingId) return undefined;
  return getAllMeetings().find(m => m.id === room.activeMeetingId);
};

// Utility
export const generateId = () => crypto.randomUUID();
