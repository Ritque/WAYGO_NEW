-- Server-owned short-lived carpool data. Browser roles receive no table grants;
-- the API verifies the caller's Supabase Auth token before using its server key.
create table if not exists public.carpool_presence (
  device_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  spawned_by_device_id text,
  payload jsonb not null,
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists carpool_presence_expiry_idx on public.carpool_presence (expires_at);
create index if not exists carpool_presence_user_expiry_idx on public.carpool_presence (user_id, expires_at);
create index if not exists carpool_presence_spawned_idx on public.carpool_presence (user_id, spawned_by_device_id);

create table if not exists public.carpool_linkup_sessions (
  request_id text primary key,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  from_device_id text not null,
  to_device_id text not null,
  status text not null check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  session jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists carpool_linkup_recipient_idx on public.carpool_linkup_sessions (to_user_id, to_device_id, status, expires_at);
create index if not exists carpool_linkup_expiry_idx on public.carpool_linkup_sessions (expires_at);

create table if not exists public.carpool_call_signals (
  signal_id text primary key,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  from_device_id text not null,
  to_device_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists carpool_call_recipient_idx on public.carpool_call_signals (to_user_id, to_device_id, expires_at);
create index if not exists carpool_call_expiry_idx on public.carpool_call_signals (expires_at);

alter table public.carpool_presence enable row level security;
alter table public.carpool_linkup_sessions enable row level security;
alter table public.carpool_call_signals enable row level security;

revoke all on public.carpool_presence, public.carpool_linkup_sessions, public.carpool_call_signals from public, anon, authenticated;
grant all on public.carpool_presence, public.carpool_linkup_sessions, public.carpool_call_signals to service_role;
