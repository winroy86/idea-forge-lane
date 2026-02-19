
-- Create model policy table: admin-managed allowed models per provider
CREATE TABLE public.allowed_models (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL,
  model_id text NOT NULL,
  label text NOT NULL DEFAULT '',
  is_allowed boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (provider, model_id)
);

-- Enable RLS
ALTER TABLE public.allowed_models ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admins can manage allowed models"
  ON public.allowed_models
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Any authenticated user can read the policy
CREATE POLICY "Authenticated users can read allowed models"
  ON public.allowed_models
  FOR SELECT
  TO authenticated
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_allowed_models_updated_at
  BEFORE UPDATE ON public.allowed_models
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
