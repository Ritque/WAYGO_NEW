-- Retain terminal outcomes long enough for disconnected clients to recover.
alter table public.carpool_linkup_sessions
  drop constraint if exists carpool_linkup_sessions_status_check;
alter table public.carpool_linkup_sessions
  add constraint carpool_linkup_sessions_status_check
  check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'completed'));

with ranked_pending as (
  select request_id,
         row_number() over (
           partition by from_user_id, to_user_id, from_device_id, to_device_id
           order by created_at desc
         ) as position
  from public.carpool_linkup_sessions
  where status = 'pending'
)
update public.carpool_linkup_sessions s
set status = 'expired',
    session = jsonb_set(s.session, '{status}', '"expired"'::jsonb)
from ranked_pending p
where p.request_id = s.request_id and p.position > 1;

create unique index if not exists carpool_linkup_one_pending_device_pair_idx
  on public.carpool_linkup_sessions (from_user_id, to_user_id, from_device_id, to_device_id)
  where status = 'pending';

create index if not exists carpool_linkup_sender_status_idx
  on public.carpool_linkup_sessions (from_user_id, from_device_id, status, expires_at);

create or replace function public.create_linkup_request(
  p_request_id text,
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_from_device_id text,
  p_to_device_id text,
  p_status text,
  p_session jsonb,
  p_expires_at timestamptz
)
returns table (request_id text, session jsonb, created boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_status not in ('pending', 'accepted') then
    raise exception 'Invalid initial link up status';
  end if;
  update public.carpool_linkup_sessions s
  set status = 'expired', session = jsonb_set(s.session, '{status}', '"expired"'::jsonb)
  where s.status = 'pending' and s.expires_at <= now()
    and s.from_user_id = p_from_user_id and s.to_user_id = p_to_user_id
    and s.from_device_id = p_from_device_id and s.to_device_id = p_to_device_id;

  insert into public.carpool_linkup_sessions as existing
    (request_id, from_user_id, to_user_id, from_device_id, to_device_id, status, session, expires_at)
  values
    (p_request_id, p_from_user_id, p_to_user_id, p_from_device_id, p_to_device_id, p_status, p_session, p_expires_at)
  on conflict (from_user_id, to_user_id, from_device_id, to_device_id) where status = 'pending'
  do nothing;

  if found then
    return query select p_request_id, p_session, true;
  else
    return query
      select s.request_id, s.session, false
      from public.carpool_linkup_sessions s
      where s.from_user_id = p_from_user_id and s.to_user_id = p_to_user_id
        and s.from_device_id = p_from_device_id and s.to_device_id = p_to_device_id
        and s.status = 'pending' and s.expires_at > now()
      order by s.created_at desc limit 1;
  end if;
end;
$$;

revoke all on function public.create_linkup_request(text, uuid, uuid, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.create_linkup_request(text, uuid, uuid, text, text, text, jsonb, timestamptz) to service_role;

alter table public.carpool_linkup_sessions enable row level security;
revoke all on public.carpool_linkup_sessions from public, anon, authenticated;
grant all on public.carpool_linkup_sessions to service_role;
