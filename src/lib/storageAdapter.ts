import { Room } from '@/types';
import { API_BASE_URL, apiFetch } from '@/lib/api';
import { saveRooms, getRooms } from '@/lib/store';

export const hasServerStorage = Boolean(API_BASE_URL);

export async function hydrateRoomsFromServer(): Promise<Room[]> {
  if (!hasServerStorage) return getRooms();
  try {
    const res = await apiFetch('/api/rooms');
    if (!res.ok) return getRooms();
    const rooms = await res.json() as Room[];
    if (Array.isArray(rooms)) saveRooms(rooms);
    return Array.isArray(rooms) ? rooms : getRooms();
  } catch {
    return getRooms();
  }
}

export async function syncRoomToServer(room: Room): Promise<void> {
  if (!hasServerStorage) return;
  try {
    await apiFetch('/api/rooms', { method: 'POST', body: JSON.stringify(room) });
  } catch {
    // noop fallback to local mode
  }
}

export async function deleteRoomFromServer(roomId: string): Promise<void> {
  if (!hasServerStorage) return;
  try {
    await apiFetch(`/api/rooms/${roomId}`, { method: 'DELETE' });
  } catch {
    // noop fallback to local mode
  }
}
