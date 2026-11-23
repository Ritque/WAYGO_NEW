-- Per-user application records, protected by Supabase Auth and RLS.
create table if not exists public.user_data (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_data enable row level security;
revoke all on public.user_data from public, anon;
grant select, insert, update, delete on public.user_data to authenticated;

drop policy if exists "Users can read their own app data" on public.user_data;
drop policy if exists "Users can insert their own app data" on public.user_data;
drop policy if exists "Users can update their own app data" on public.user_data;
drop policy if exists "Users can delete their own app data" on public.user_data;

create policy "Users can read their own app data"
  on public.user_data for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can insert their own app data"
  on public.user_data for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own app data"
  on public.user_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own app data"
  on public.user_data for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
