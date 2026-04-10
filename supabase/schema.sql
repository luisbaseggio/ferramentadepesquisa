create table if not exists public.app_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state disable row level security;

create index if not exists app_state_updated_at_idx on public.app_state (updated_at desc);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.workspaces (
  id text primary key,
  name text not null,
  slug text not null unique,
  owner_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_memberships (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (user_id, workspace_id)
);

create table if not exists public.workspace_sessions (
  id text primary key,
  token_hash text not null unique,
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.review_queue_items (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  source_link text,
  format text,
  review_decision text not null default 'pending',
  review_notes text not null default '',
  last_batch_at timestamptz,
  updated_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.approved_channel_items (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  output_file_name text,
  updated_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

alter table public.profiles disable row level security;
alter table public.workspaces disable row level security;
alter table public.workspace_memberships disable row level security;
alter table public.workspace_sessions disable row level security;
alter table public.review_queue_items disable row level security;
alter table public.approved_channel_items disable row level security;

create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists workspaces_slug_idx on public.workspaces (slug);
create index if not exists workspace_memberships_user_idx on public.workspace_memberships (user_id);
create index if not exists workspace_memberships_workspace_idx on public.workspace_memberships (workspace_id);
create index if not exists workspace_sessions_token_hash_idx on public.workspace_sessions (token_hash);
create index if not exists workspace_sessions_user_idx on public.workspace_sessions (user_id);
create index if not exists review_queue_items_workspace_idx on public.review_queue_items (workspace_id, updated_at desc);
create index if not exists approved_channel_items_workspace_idx on public.approved_channel_items (workspace_id, updated_at desc);
