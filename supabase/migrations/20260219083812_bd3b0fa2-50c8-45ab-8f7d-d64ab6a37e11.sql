
-- Create meeting_snapshots table
CREATE TABLE IF NOT EXISTS public.meeting_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  room_id text NOT NULL,
  meeting_id text NOT NULL,
  topic text NOT NULL DEFAULT '',
  goals text NOT NULL DEFAULT '',
  duration_minutes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, meeting_id)
);

-- Enable RLS
ALTER TABLE public.meeting_snapshots ENABLE ROW LEVEL SECURITY;

-- Users manage their own meeting snapshots
CREATE POLICY "Users manage own meeting snapshots"
  ON public.meeting_snapshots
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can read all meeting snapshots
CREATE POLICY "Admins can read all meeting snapshots"
  ON public.meeting_snapshots
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger to auto-update updated_at
CREATE TRIGGER update_meeting_snapshots_updated_at
  BEFORE UPDATE ON public.meeting_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
