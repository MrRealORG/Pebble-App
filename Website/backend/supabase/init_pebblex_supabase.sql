-- ============================================================
-- PebbleX — Complete Supabase Initial Schema & Migrations
-- Target: Supabase Postgres (Project: uqrkpssesnxhevkgcgsu)
-- Region: ap-southeast-1
--
-- Run this script in the Supabase Dashboard SQL Editor:
-- https://supabase.com/dashboard/project/uqrkpssesnxhevkgcgsu/sql
-- ============================================================

begin;

-- Enable UUID extension
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. Helper Identity & Role Functions
-- ------------------------------------------------------------

create or replace function public.px_uid() returns text
language sql stable set search_path = '' as $$
  select coalesce(nullif(auth.jwt()->>'sub', ''), auth.uid()::text);
$$;

create or replace function public.px_valid_identity() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(
    (auth.role() = 'authenticated' and (auth.uid() is not null or length(auth.jwt()->>'sub') > 0)),
    false
  );
$$;

create or replace function public.px_admin() returns boolean
language sql stable set search_path = '' as $$
  select public.px_valid_identity() and (
    coalesce(auth.jwt()->>'admin' = 'true', false) or
    coalesce(auth.jwt()->>'email' = 'realmrhacker26@gmail.com', false)
  );
$$;

-- ------------------------------------------------------------
-- 2. Profiles Table
-- ------------------------------------------------------------

create table if not exists public.profiles (
  id text primary key,
  name text not null default 'Pebble User' check (length(name) between 1 and 80),
  email text not null,
  bio text not null default '' check (length(bio) <= 300),
  avatar_color text not null default '#7CD56E' check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  theme text not null default 'elera' check (theme in ('elera','pebble-dark','midnight','nord','forest','rose','ocean','mono','sunset','candy','coffee','slate','neon')),
  usage_consent boolean not null default false,
  account_enabled boolean not null default true,
  protected_account boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (id = public.px_uid() or id = auth.uid()::text);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = public.px_uid() or id = auth.uid()::text)
  with check (id = public.px_uid() or id = auth.uid()::text);

-- Trigger to auto-create profile on auth.users signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, name, avatar_color)
  values (
    new.id::text,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, 'User'), '@', 1)),
    '#7CD56E'
  )
  on conflict (id) do update set
    email = excluded.email,
    last_seen = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 3. Workspace Items (Sync notes, tasks, prompts, reminders)
-- ------------------------------------------------------------

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
  origin text not null default 'desktop' check (origin in ('web','desktop','extension')),
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object' and octet_length(extra::text) < 32000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_workspace_items_owner_updated on public.workspace_items(owner_id, updated_at desc);
create index if not exists idx_workspace_items_owner_kind on public.workspace_items(owner_id, kind);
create index if not exists idx_workspace_items_extra_local_id on public.workspace_items((extra->>'local_id'));

alter table public.workspace_items enable row level security;

drop policy if exists "Users can select own workspace items" on public.workspace_items;
create policy "Users can select own workspace items"
  on public.workspace_items for select
  to authenticated
  using (owner_id = public.px_uid() or owner_id = auth.uid()::text);

drop policy if exists "Users can insert own workspace items" on public.workspace_items;
create policy "Users can insert own workspace items"
  on public.workspace_items for insert
  to authenticated
  with check (owner_id = public.px_uid() or owner_id = auth.uid()::text);

drop policy if exists "Users can update own workspace items" on public.workspace_items;
create policy "Users can update own workspace items"
  on public.workspace_items for update
  to authenticated
  using (owner_id = public.px_uid() or owner_id = auth.uid()::text)
  with check (owner_id = public.px_uid() or owner_id = auth.uid()::text);

drop policy if exists "Users can delete own workspace items" on public.workspace_items;
create policy "Users can delete own workspace items"
  on public.workspace_items for delete
  to authenticated
  using (owner_id = public.px_uid() or owner_id = auth.uid()::text);

-- ------------------------------------------------------------
-- 4. Devices Table
-- ------------------------------------------------------------

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.profiles(id) on delete cascade,
  name text not null check (length(name) <= 100),
  platform text not null check (length(platform) <= 60),
  kind text not null check (kind in ('web','desktop','extension')),
  app_version text not null default '0.1.0' check (length(app_version) <= 30),
  last_seen timestamptz not null default now(),
  unique(id, owner_id)
);

create index if not exists idx_devices_owner on public.devices(owner_id);

alter table public.devices enable row level security;

drop policy if exists "Users manage own devices" on public.devices;
create policy "Users manage own devices"
  on public.devices for all
  to authenticated
  using (owner_id = public.px_uid() or owner_id = auth.uid()::text)
  with check (owner_id = public.px_uid() or owner_id = auth.uid()::text);

-- ------------------------------------------------------------
-- 5. App Usage (Summary records)
-- ------------------------------------------------------------

create table if not exists public.app_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.profiles(id) on delete cascade,
  device_id uuid,
  app_name text not null check (length(app_name) between 1 and 120),
  category text not null default 'Other' check (length(category) <= 60),
  minutes numeric not null check (minutes >= 0 and minutes <= 1440),
  day date not null,
  color text not null default '#7eaf6a' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  unique(owner_id, device_id, app_name, day)
);

create index if not exists idx_app_usage_owner_day on public.app_usage(owner_id, day);

alter table public.app_usage enable row level security;

drop policy if exists "Users manage own app usage" on public.app_usage;
create policy "Users manage own app usage"
  on public.app_usage for all
  to authenticated
  using (owner_id = public.px_uid() or owner_id = auth.uid()::text)
  with check (owner_id = public.px_uid() or owner_id = auth.uid()::text);

-- ------------------------------------------------------------
-- 6. Activity Events
-- ------------------------------------------------------------

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.profiles(id) on delete cascade,
  action text not null,
  kind text not null,
  origin text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_events_owner on public.activity_events(owner_id, created_at desc);

alter table public.activity_events enable row level security;

drop policy if exists "Users view own activity events" on public.activity_events;
create policy "Users view own activity events"
  on public.activity_events for select
  to authenticated
  using (owner_id = public.px_uid() or owner_id = auth.uid()::text);

drop policy if exists "Users insert own activity events" on public.activity_events;
create policy "Users insert own activity events"
  on public.activity_events for insert
  to authenticated
  with check (owner_id = public.px_uid() or owner_id = auth.uid()::text);

-- ------------------------------------------------------------
-- 7. Bug Reports Table
-- ------------------------------------------------------------

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 160),
  steps text not null default '',
  severity text not null default 'Normal' check (severity in ('Minor','Normal','Major','Critical')),
  status text not null default 'Open' check (status in ('Open','Investigating','Resolved','Closed')),
  diagnostics jsonb not null default '{}'::jsonb,
  submitted_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bug_reports enable row level security;

drop policy if exists "Anyone can submit bug reports" on public.bug_reports;
create policy "Anyone can submit bug reports"
  on public.bug_reports for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Users can read own bug reports" on public.bug_reports;
create policy "Users can read own bug reports"
  on public.bug_reports for select
  to authenticated
  using (submitted_by = public.px_uid() or submitted_by = auth.uid()::text or public.px_admin());

-- ------------------------------------------------------------
-- 8. Reviews Table
-- ------------------------------------------------------------

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_name text not null check (length(author_name) between 1 and 60),
  author_email text,
  body text not null check (length(body) between 10 and 2000),
  rating smallint not null check (rating between 1 and 5),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_by text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.reviews enable row level security;

drop policy if exists "Anyone can submit reviews" on public.reviews;
create policy "Anyone can submit reviews"
  on public.reviews for insert
  to anon, authenticated
  with check (status = 'pending');

drop policy if exists "Anyone can view approved reviews" on public.reviews;
create policy "Anyone can view approved reviews"
  on public.reviews for select
  to anon, authenticated
  using (status = 'approved' or (submitted_by is not null and (submitted_by = public.px_uid() or submitted_by = auth.uid()::text)));

-- ------------------------------------------------------------
-- 9. Site Settings
-- ------------------------------------------------------------

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "Anyone can view site settings" on public.site_settings;
create policy "Anyone can view site settings"
  on public.site_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can update site settings" on public.site_settings;
create policy "Admins can update site settings"
  on public.site_settings for all
  to authenticated
  using (public.px_admin())
  with check (public.px_admin());

-- ------------------------------------------------------------
-- 10. Role Grants
-- ------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;
grant select, insert on public.profiles to authenticated;
grant update (name, bio, avatar_color, theme, usage_consent, last_seen) on public.profiles to authenticated;
grant all on public.workspace_items to authenticated;
grant all on public.devices to authenticated;
grant all on public.app_usage to authenticated;
grant select, insert on public.activity_events to authenticated;
grant insert on public.bug_reports to anon, authenticated;
grant select on public.bug_reports to authenticated;
grant insert on public.reviews to anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant all on all tables in schema public to service_role;

commit;
