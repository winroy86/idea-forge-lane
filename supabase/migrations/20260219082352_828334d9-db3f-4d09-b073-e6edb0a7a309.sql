
-- room_snapshots table
CREATE TABLE public.room_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  room_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  goal text NOT NULL DEFAULT '',
  orchestration text NOT NULL DEFAULT 'manual',
  agent_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_opened_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, room_id)
);

ALTER TABLE public.room_snapshots ENABLE ROW LEVEL SECURITY;

-- Users can manage their own rows
CREATE POLICY "Users manage own room snapshots"
  ON public.room_snapshots FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can read all rows
CREATE POLICY "Admins can read all room snapshots"
  ON public.room_snapshots FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- agent_snapshots table
CREATE TABLE public.agent_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent_id text NOT NULL,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  domain text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

ALTER TABLE public.agent_snapshots ENABLE ROW LEVEL SECURITY;

-- Users can manage their own rows
CREATE POLICY "Users manage own agent snapshots"
  ON public.agent_snapshots FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can read all rows
CREATE POLICY "Admins can read all agent snapshots"
  ON public.agent_snapshots FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- updated_at triggers
CREATE TRIGGER update_room_snapshots_updated_at
  BEFORE UPDATE ON public.room_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_snapshots_updated_at
  BEFORE UPDATE ON public.agent_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
