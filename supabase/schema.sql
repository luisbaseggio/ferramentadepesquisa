create table if not exists public.app_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state disable row level security;

create index if not exists app_state_updated_at_idx on public.app_state (updated_at desc);
