import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MessageSquare, Users, Trash2, Timer, History, AlertTriangle } from 'lucide-react';
import { Room, MeetingSession } from '@/types';
import { getRooms, deleteRoom, generateId, upsertRoom, getAllMeetings, clearMessages } from '@/lib/store';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { TID } from '@/testIds';

function CreateRoomDialog({ onCreated }: { onCreated: () => void }) {
  // ... keep existing code (CreateRoomDialog component)
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
      documents: [],
      meetings: [],
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
        <Button className="gap-2" data-testid={TID.roomCreateBtn}>
          <Plus className="h-4 w-4" />
          New Room
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a Room</DialogTitle>
          <DialogDescription>Set up a new brainstorming room with a title and goal.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="room-title">Title</Label>
            <Input
              id="room-title" data-testid={TID.roomNameInput}
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
          <Button onClick={handleCreate} className="w-full" disabled={!title.trim()} data-testid={TID.roomCreateConfirm}>
            Create Room
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoomDialog({ room, onDeleted }: { room: Room; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);

  const handleDelete = (clearHistory: boolean) => {
    if (clearHistory) {
      clearMessages(room.id);
    }
    deleteRoom(room.id);
    setOpen(false);
    onDeleted();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete "{room.title}"?
          </DialogTitle>
          <DialogDescription>
            Choose whether to keep or delete the conversation history from this room.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-3"
            onClick={() => handleDelete(false)}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="text-left">
              <div className="text-sm font-medium">Delete room only</div>
              <div className="text-[11px] text-muted-foreground">Keep all messages and meeting history</div>
            </div>
          </Button>
          <Button
            variant="destructive"
            className="w-full justify-start gap-3 h-auto py-3"
            onClick={() => handleDelete(true)}
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div className="text-left">
              <div className="text-sm font-medium">Delete room + all history</div>
              <div className="text-[11px] opacity-80">Permanently remove all messages and meetings</div>
            </div>
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Dashboard() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [meetings, setMeetings] = useState<MeetingSession[]>([]);
  const navigate = useNavigate();

  const refresh = () => {
    setRooms(getRooms().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    setMeetings(getAllMeetings());
  };
  useEffect(refresh, []);

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
          {rooms.map((room) => {
            const roomMeetings = meetings.filter(m => m.roomId === room.id && m.status === 'ended');
            return (
              <div
                key={room.id}
                onClick={() => navigate(`/room/${room.id}`)}
                className="group cursor-pointer rounded-lg border border-border bg-card p-4 shadow-soft transition-all hover:shadow-elevated hover:border-accent/40"
                data-testid={TID.roomCard(room.id)}
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-medium text-foreground group-hover:text-accent transition-colors">
                    {room.title}
                  </h3>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {roomMeetings.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/room/${room.id}/history`);
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-accent/10 hover:text-accent"
                        title="Meeting history"
                      >
                        <History className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <DeleteRoomDialog room={room} onDeleted={refresh} />
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
                  {roomMeetings.length > 0 && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <History className="h-3 w-3" />
                      {roomMeetings.length}
                    </span>
                  )}
                  {room.activeMeetingId && (() => {
                    const m = meetings.find(mt => mt.id === room.activeMeetingId);
                    return m && (m.status === 'active' || m.status === 'wrap-up') ? (
                      <span className="flex items-center gap-1 text-accent font-medium">
                        <Timer className="h-3 w-3 animate-pulse" />
                        Meeting
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
