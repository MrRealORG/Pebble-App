-- Replace this project ID before running in the Supabase SQL editor.
-- Firebase IDs are text, not UUIDs. Never use auth.uid() for Firebase subjects.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.workspace_config (key text primary key, value text not null);
insert into private.workspace_config values ('firebase_project_id', 'REPLACE_WITH_FIREBASE_PROJECT_ID')
on conflict (key) do update set value = excluded.value;

create or replace function public.px_valid_identity() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    auth.jwt()->>'iss' = 'https://securetoken.google.com/' || value
    and auth.jwt()->>'aud' = value
    and auth.jwt()->>'role' = 'authenticated'
    and length(auth.jwt()->>'sub') > 0, false)
  from private.workspace_config where key = 'firebase_project_id';
$$;

create or replace function public.px_uid() returns text
language sql stable set search_path = '' as $$ select nullif(auth.jwt()->>'sub', '') $$;

create table if not exists public.profiles (
  id text primary key,
  name text not null default 'Your workspace' check (length(name) between 1 and 80),
  email text not null,
  bio text not null default '' check (length(bio) <= 300),
  avatar_color text not null default '#b7cba4' check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  theme text not null default 'elera' check (theme in ('elera','pebble-dark','midnight','nord','forest','rose','ocean','mono','sunset','candy','coffee','slate','neon')),
  usage_consent boolean not null default false,
  account_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create or replace function public.px_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select account_enabled from public.profiles where id = public.px_uid()), false)
    and coalesce(public.px_valid_identity(), false);
$$;

create or replace function public.px_admin() returns boolean
language sql stable set search_path = '' as $$
  select public.px_active() and coalesce(auth.jwt()->>'admin' = 'true', false);
$$;

create table if not exists public.workspace_items (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('task','note','conversation','message','reminder','prompt')),
  title text not null default '' check (length(title) <= 180),
  body text not null default '' check (length(body) <= 100000),
  status text not null default 'todo' check (status in ('todo','doing','done')),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  project text not null default 'Personal' check (length(project) <= 60),
  due_date date,
  pinned boolean not null default false,
  origin text not null default 'web' check (origin in ('web','desktop')),
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object' and octet_length(extra::text) < 16000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists workspace_items_owner on public.workspace_items(owner_id, updated_at);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.profiles(id) on delete cascade,
  name text not null check (length(name) <= 100),
  platform text not null check (length(platform) <= 60),
  kind text not null check (kind in ('web','desktop')),
  app_version text not null default '0.1.0' check (length(app_version) <= 30),
  last_seen timestamptz not null default now(),
  unique(id, owner_id)
);
create index if not exists devices_owner on public.devices(owner_id);

create table if not exists public.app_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.profiles(id) on delete cascade,
  device_id uuid not null,
  app_name text not null check (length(app_name) between 1 and 120),
  category text not null default 'Other' check (length(category) <= 60),
  minutes numeric not null check (minutes >= 0 and minutes <= 1440),
  day date not null,
  color text not null default '#7eaf6a' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  foreign key (device_id, owner_id) references public.devices(id, owner_id) on delete cascade,
  unique(owner_id, device_id, app_name, day)
);
create index if not exists app_usage_owner_day on public.app_usage(owner_id, day);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.profiles(id) on delete cascade,
  action text not null,
  kind text not null,
  origin text not null,
  created_at timestamptz not null default now()
);
create index if not exists activity_owner_time on public.activity_events(owner_id, created_at desc);

create or replace function private.touch_workspace_item() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.owner_id <> old.owner_id or new.kind <> old.kind or new.id <> old.id then
      raise exception 'An item identity cannot be changed';
    end if;
    new.created_at := old.created_at;
  else
    new.created_at := clock_timestamp();
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
drop trigger if exists workspace_item_timestamp on public.workspace_items;
create trigger workspace_item_timestamp before insert or update on public.workspace_items
for each row execute function private.touch_workspace_item();

create or replace function private.record_workspace_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare action_name text;
begin
  if tg_op = 'INSERT' then action_name := 'Created a ' || new.kind;
  elsif new.deleted_at is not null and old.deleted_at is null then action_name := 'Deleted a ' || new.kind;
  elsif new.status = 'done' and old.status <> 'done' then action_name := 'Completed a ' || new.kind;
  else action_name := 'Updated a ' || new.kind;
  end if;
  insert into public.activity_events(owner_id, action, kind, origin)
    values(new.owner_id, action_name, new.kind, new.origin);
  return new;
end;
$$;
drop trigger if exists workspace_activity on public.workspace_items;
create trigger workspace_activity after insert or update on public.workspace_items
for each row execute function private.record_workspace_event();

create or replace function private.device_heartbeat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.id <> old.id or new.owner_id <> old.owner_id or new.kind <> old.kind) then
    raise exception 'A device identity cannot be changed';
  end if;
  new.last_seen := clock_timestamp();
  update public.profiles set last_seen = new.last_seen where id = new.owner_id;
  return new;
end;
$$;
drop trigger if exists device_heartbeat on public.devices;
create trigger device_heartbeat before insert or update on public.devices
for each row execute function private.device_heartbeat();

alter table public.profiles enable row level security;
alter table public.workspace_items enable row level security;
alter table public.devices enable row level security;
alter table public.app_usage enable row level security;
alter table public.activity_events enable row level security;

revoke all on public.profiles, public.workspace_items, public.devices, public.app_usage, public.activity_events from anon, authenticated;
grant select on public.profiles, public.workspace_items, public.devices, public.app_usage, public.activity_events to authenticated;
grant update(name, bio, avatar_color, theme, usage_consent) on public.profiles to authenticated;
grant insert, update on public.workspace_items, public.devices, public.app_usage to authenticated;
grant all on public.profiles, public.workspace_items, public.devices, public.app_usage, public.activity_events to service_role;

drop policy if exists profile_read on public.profiles;
create policy profile_read on public.profiles for select to authenticated
using ((select public.px_active()) and (id = (select public.px_uid()) or (select public.px_admin())));
drop policy if exists profile_update on public.profiles;
create policy profile_update on public.profiles for update to authenticated
using ((select public.px_active()) and id = (select public.px_uid()))
with check (id = (select public.px_uid()));

-- Admins may see counts, not other people's private notes or conversations.
drop policy if exists items_read on public.workspace_items;
create policy items_read on public.workspace_items for select to authenticated
using ((select public.px_active()) and owner_id = (select public.px_uid()));
drop policy if exists items_insert on public.workspace_items;
create policy items_insert on public.workspace_items for insert to authenticated
with check ((select public.px_active()) and owner_id = (select public.px_uid()));
drop policy if exists items_update on public.workspace_items;
create policy items_update on public.workspace_items for update to authenticated
using ((select public.px_active()) and owner_id = (select public.px_uid()))
with check (owner_id = (select public.px_uid()));

drop policy if exists devices_read on public.devices;
create policy devices_read on public.devices for select to authenticated
using ((select public.px_active()) and (owner_id = (select public.px_uid()) or (select public.px_admin())));
drop policy if exists devices_insert on public.devices;
create policy devices_insert on public.devices for insert to authenticated
with check ((select public.px_active()) and owner_id = (select public.px_uid()));
drop policy if exists devices_update on public.devices;
create policy devices_update on public.devices for update to authenticated
using ((select public.px_active()) and owner_id = (select public.px_uid()))
with check (owner_id = (select public.px_uid()));

drop policy if exists usage_read on public.app_usage;
create policy usage_read on public.app_usage for select to authenticated
using ((select public.px_active()) and (owner_id = (select public.px_uid()) or (select public.px_admin())));
drop policy if exists usage_insert on public.app_usage;
create policy usage_insert on public.app_usage for insert to authenticated
with check ((select public.px_active()) and owner_id = (select public.px_uid())
  and exists(select 1 from public.profiles p where p.id = owner_id and p.usage_consent));
drop policy if exists usage_update on public.app_usage;
create policy usage_update on public.app_usage for update to authenticated
using ((select public.px_active()) and owner_id = (select public.px_uid()))
with check (owner_id = (select public.px_uid())
  and exists(select 1 from public.profiles p where p.id = owner_id and p.usage_consent));

drop policy if exists events_read on public.activity_events;
create policy events_read on public.activity_events for select to authenticated
using ((select public.px_active()) and (owner_id = (select public.px_uid()) or (select public.px_admin())));

create or replace function public.admin_directory(search_text text default '', page_number integer default 0)
returns table(id text, name text, email text, bio text, avatar_color text, theme text, usage_consent boolean,
  created_at timestamptz, last_seen timestamptz, task_count bigint, note_count bigint, device_count bigint, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.px_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if length(search_text) > 200 or page_number < 0 or page_number > 100000 then raise exception 'Invalid search'; end if;
  return query
    select p.id, p.name, p.email, ''::text, p.avatar_color, p.theme, p.usage_consent, p.created_at, p.last_seen,
      (select count(*) from public.workspace_items i where i.owner_id = p.id and i.kind = 'task' and i.deleted_at is null),
      (select count(*) from public.workspace_items i where i.owner_id = p.id and i.kind = 'note' and i.deleted_at is null),
      (select count(*) from public.devices d where d.owner_id = p.id), count(*) over()
    from public.profiles p
    where position(lower(search_text) in lower(p.name || ' ' || p.email)) > 0
    order by p.created_at desc, p.id
    limit 12 offset page_number * 12;
end;
$$;

create or replace function public.admin_metrics() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.px_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'active_users', (select count(*) from public.profiles where last_seen > now() - interval '7 days'),
    'devices', (select count(*) from public.devices),
    'changes', (select count(*) from public.activity_events where created_at > now() - interval '7 days')
  );
end;
$$;

create table if not exists private.ai_daily_limits (
  owner_id text not null, day date not null, requests integer not null default 0,
  primary key(owner_id, day)
);
create or replace function public.consume_ai_quota(p_owner text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.ai_daily_limits(owner_id, day, requests) values(p_owner, current_date, 1)
  on conflict(owner_id, day) do update set requests = private.ai_daily_limits.requests + 1
    where private.ai_daily_limits.requests < 30;
  return found;
end;
$$;

revoke all on function public.px_valid_identity(), public.px_uid(), public.px_active(), public.px_admin() from public, anon;
grant execute on function public.px_valid_identity(), public.px_uid(), public.px_active(), public.px_admin() to authenticated, service_role;
revoke all on function public.admin_directory(text, integer), public.admin_metrics() from public, anon;
grant execute on function public.admin_directory(text, integer), public.admin_metrics() to authenticated;
revoke all on function public.consume_ai_quota(text) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(text) to service_role;
revoke all on all functions in schema private from public, anon, authenticated;

do $$
declare tbl text;
begin
  foreach tbl in array array['workspace_items','profiles','devices','app_usage','activity_events'] loop
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;
commit;