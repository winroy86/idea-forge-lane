import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MessageSquare, Users, Trash2, Edit2 } from 'lucide-react';
import { Room } from '@/types';
import { getRooms, deleteRoom, generateId, upsertRoom } from '@/lib/store';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

function CreateRoomDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');

  const handleCreate = () => {
    if (!title.trim()) return;
    const room: Room = {
      id: generateId(),
      title: title.trim(),
      goal: goal.trim(),
      constraints: '',
      audience: '',
      successCriteria: '',
      agentIds: [],
      orchestration: 'manual',
      balanceSlider: 50,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    upsertRoom(room);
    setTitle('');
    setGoal('');
    setOpen(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New Room
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a Room</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="room-title">Title</Label>
            <Input
              id="room-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Product Strategy Q3"
            />
          </div>
          <div>
            <Label htmlFor="room-goal">Goal</Label>
            <Textarea
              id="room-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What should this brainstorm achieve?"
              rows={3}
            />
          </div>
          <Button onClick={handleCreate} className="w-full" disabled={!title.trim()}>
            Create Room
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Dashboard() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const navigate = useNavigate();

  const refresh = () => setRooms(getRooms().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  useEffect(refresh, []);

  const handleDelete = (id: string) => {
    deleteRoom(id);
    refresh();
  };

  return (
    <div className="animate-fade-in p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Rooms</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create a room to start brainstorming with your agents.
          </p>
        </div>
        <CreateRoomDialog onCreated={refresh} />
      </div>

      {rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h2 className="text-lg font-medium text-foreground mb-1">No rooms yet</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Create your first brainstorming room to get started.
          </p>
          <CreateRoomDialog onCreated={refresh} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <div
              key={room.id}
              onClick={() => navigate(`/room/${room.id}`)}
              className="group cursor-pointer rounded-lg border border-border bg-card p-4 shadow-soft transition-all hover:shadow-elevated hover:border-accent/40"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-medium text-foreground group-hover:text-accent transition-colors">
                  {room.title}
                </h3>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(room.id);
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {room.goal && (
                <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{room.goal}</p>
              )}
              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {room.agentIds.length} agents
                </span>
                <span className="capitalize">{room.orchestration}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
