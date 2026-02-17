create table if not exists public.user_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  label text not null,
  base_url text,
  api_key text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_provider_credentials enable row level security;

create policy if not exists "Users can read own provider credentials"
  on public.user_provider_credentials
  for select
  using (auth.uid() = user_id);

create policy if not exists "Users can insert own provider credentials"
  on public.user_provider_credentials
  for insert
  with check (auth.uid() = user_id);

create policy if not exists "Users can update own provider credentials"
  on public.user_provider_credentials
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "Users can delete own provider credentials"
  on public.user_provider_credentials
  for delete
  using (auth.uid() = user_id);
