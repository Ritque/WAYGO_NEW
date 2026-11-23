-- Ensure Link Up RPC inserts a non-null status and returns it in session JSON.
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
declare
  v_status text := coalesce(p_status, 'pending');
  v_session jsonb;
begin
  if p_request_id is null
     or p_from_user_id is null
     or p_to_user_id is null
     or p_from_device_id is null
     or p_to_device_id is null
     or p_session is null
     or p_expires_at is null then
    raise exception 'Required Link Up request fields must not be null'
      using errcode = '22004';
  end if;

  if v_status not in ('pending', 'accepted') then
    raise exception 'Invalid initial Link Up status: %', v_status
      using errcode = '22023';
  end if;

  -- Keep the JSON session status aligned with the required database column.
  v_session := pg_catalog.jsonb_set(p_session, '{status}', pg_catalog.to_jsonb(v_status), true);

  update public.carpool_linkup_sessions s
  set status = 'expired',
      session = pg_catalog.jsonb_set(s.session, '{status}', '"expired"'::jsonb, true)
  where s.status = 'pending'
    and s.expires_at <= pg_catalog.now()
    and s.from_user_id = p_from_user_id
    and s.to_user_id = p_to_user_id
    and s.from_device_id = p_from_device_id
    and s.to_device_id = p_to_device_id;

  insert into public.carpool_linkup_sessions
    (request_id, from_user_id, to_user_id, from_device_id, to_device_id, status, session, expires_at)
  values
    (p_request_id, p_from_user_id, p_to_user_id, p_from_device_id, p_to_device_id, v_status, v_session, p_expires_at)
  on conflict (from_user_id, to_user_id, from_device_id, to_device_id) where status = 'pending'
  do nothing;

  if found then
    return query select p_request_id, v_session, true;
  else
    return query
      select s.request_id, s.session, false
      from public.carpool_linkup_sessions s
      where s.from_user_id = p_from_user_id
        and s.to_user_id = p_to_user_id
        and s.from_device_id = p_from_device_id
        and s.to_device_id = p_to_device_id
        and s.status = 'pending'
        and s.expires_at > pg_catalog.now()
      order by s.created_at desc
      limit 1;
  end if;
end;
$$;

revoke all on function public.create_linkup_request(text, uuid, uuid, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_linkup_request(text, uuid, uuid, text, text, text, jsonb, timestamptz)
  to service_role;
