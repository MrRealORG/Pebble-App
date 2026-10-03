-- PebbleX — downloads, reviews, bug reports and admin controls
-- Run after 003_extension_and_admin.sql.
--
-- DESIGN RULE THAT SHAPES THIS FILE
-- The public marketing site must never show a number we cannot source.
-- Download counts come from GitHub's own asset counters (see
-- src/lib/releases.ts) because those cannot drift from reality — this
-- database does NOT keep a parallel download counter that we would then
-- have to trust. What it does store is everything GitHub cannot know:
-- reviews, bug reports, and a small set of admin-editable site settings.
--
-- `site_settings.overrides` exists so an admin can correct a displayed
-- figure (for example a press mention) — but overrides are STORED
-- SEPARATELY from measured values and the UI labels them as manual, so a
-- human-edited number can never silently masquerade as telemetry.

begin;

-- ============================================================
-- REVIEWS
-- Pending moderation. Nothing appears publicly until an admin approves.
-- ============================================================

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_name text not null check (length(author_name) between 1 and 60),
  author_email text,                       -- never shown publicly, only for replies
  body text not null check (length(body) between 10 and 2000),
  rating smallint not null check (rating between 1 and 5),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  submitted_by text,                       -- set when a signed-in user posts
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists reviews_status_created on public.reviews(status, created_at desc);

alter table public.reviews enable row level security;

-- Anyone may SUBMIT (including logged-out visitors), but reading is
-- approval-gated, so a spam run cannot be used to read the queue.
grant insert on public.reviews to anon, authenticated;
grant select, update, delete on public.reviews to authenticated;
grant all on public.reviews to service_role;

drop policy if exists reviews_submit on public.reviews;
create policy reviews_submit on public.reviews for insert to anon, authenticated
  with check (status = 'pending' and approved_by is null and approved_at is null);

drop policy if exists reviews_read_approved on public.reviews;
create policy reviews_read_approved on public.reviews for select to anon, authenticated
  using (status = 'approved');

-- A signed-in user may see their own pending review so the UI can say
-- "awaiting moderation" instead of silently swallowing their submission.
drop policy if exists reviews_read_own on public.reviews;
create policy reviews_read_own on public.reviews for select to authenticated
  using (submitted_by is not null and submitted_by = public.px_uid());

create or replace function public.submit_review(
  p_name text, p_body text, p_rating integer, p_email text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if p_name is null or length(btrim(p_name)) < 1 or length(p_name) > 60 then
    raise exception 'Please add your name';
  end if;
  if p_body is null or length(btrim(p_body)) < 10 or length(p_body) > 2000 then
    raise exception 'Please write at least 10 characters';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be 1 to 5';
  end if;

  insert into public.reviews(author_name, author_email, body, rating, submitted_by)
  values (btrim(p_name), nullif(left(p_email, 200), ''), btrim(p_body), p_rating,
          case when public.px_valid_identity() then public.px_uid() else null end)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.admin_reviews(p_status text default 'pending', p_limit integer default 50)
returns table(id uuid, author_name text, body text, rating smallint, status text, created_at timestamptz, approved_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.px_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return query
    select r.id, r.author_name, r.body, r.rating, r.status, r.created_at, r.approved_at
    from public.reviews r
    where p_status is null or p_status = 'all' or r.status = p_status
    order by r.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

create or replace function public.admin_moderate_review(p_id uuid, p_approve boolean)
returns text
language plpgsql security definer set search_path = '' as $$
declare new_status text;
begin
  if not public.px_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  new_status := case when p_approve then 'approved' else 'rejected' end;
  update public.reviews
     set status = new_status,
         approved_by = public.px_uid(),
         approved_at = case when p_approve then now() else null end
   where id = p_id;
  if not found then raise exception 'Review not found'; end if;
  return new_status;
end;
$$;

-- ============================================================
-- BUG REPORTS
-- Sent from the desktop app's bug reporter and the website.
-- ============================================================

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id text,                        -- null for logged-out reports
  reporter_email text,
  area text not null default 'general'
    check (area in ('general','boot','notes','tasks','timeless','arcade','chat','ai','widget','sync','other')),
  summary text not null check (length(summary) between 4 and 200),
  details text not null default '' check (length(details) <= 20000),
  app_version text not null default '' check (length(app_version) <= 30),
  platform text not null default '' check (length(platform) <= 60),
  status text not null default 'open'
    check (status in ('open','triaged','fixed','closed','spam')),
  admin_note text not null default '' check (length(admin_note) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bug_reports_status_created on public.bug_reports(status, created_at desc);

alter table public.bug_reports enable row level security;

-- Reports may be filed anonymously — a broken build often cannot sign in.
grant insert on public.bug_reports to anon, authenticated;
grant select, update, delete on public.bug_reports to authenticated;
grant all on public.bug_reports to service_role;

drop policy if exists bug_reports_submit on public.bug_reports;
create policy bug_reports_submit on public.bug_reports for insert to anon, authenticated
  with check (status = 'open' and admin_note = '');

drop policy if exists bug_reports_read_own on public.bug_reports;
create policy bug_reports_read_own on public.bug_reports for select to authenticated
  using (reporter_id is not null and reporter_id = public.px_uid());

create or replace function public.submit_bug_report(
  p_summary text, p_details text default '', p_area text default 'general',
  p_email text default null, p_version text default '', p_platform text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if p_summary is null or length(btrim(p_summary)) < 4 then
    raise exception 'Please describe the problem';
  end if;
  if p_area is not null and p_area <> 'all' and p_area not in
     ('general','boot','notes','tasks','timeless','arcade','chat','ai','widget','sync','other') then
    raise exception 'Unknown area';
  end if;

  insert into public.bug_reports(reporter_id, reporter_email, area, summary, details, app_version, platform)
  values (case when public.px_valid_identity() then public.px_uid() else null end,
          nullif(left(p_email, 200), ''), coalesce(nullif(p_area,''), 'general'),
          btrim(p_summary), left(coalesce(p_details,''), 20000),
          left(coalesce(p_version,''), 30), left(coalesce(p_platform,''), 60))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.admin_bug_reports(p_status text default 'open', p_limit integer default 50)
returns table(id uuid, area text, summary text, details text, app_version text, platform text,
  status text, admin_note text, created_at timestamptz, reporter_email text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.px_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return query
    select b.id, b.area, b.summary, b.details, b.app_version, b.platform,
           b.status, b.admin_note, b.created_at, b.reporter_email
    from public.bug_reports b
    where p_status is null or p_status = 'all' or b.status = p_status
    order by b.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

create or replace function public.admin_set_bug_status(p_id uuid, p_status text, p_note text default '')
returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public.px_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if p_status not in ('open','triaged','fixed','closed','spam') then raise exception 'Unknown status'; end if;
  update public.bug_reports
     set status = p_status,
         admin_note = left(coalesce(p_note,''), 4000),
         updated_at = now()
   where id = p_id;
  if not found then raise exception 'Report not found'; end if;
  return p_status;
end;
$$;

-- ============================================================
-- SITE SETTINGS (admin-editable copy and manual overrides)
-- ============================================================

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb check (jsonb_typeof(value) = 'object'),
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;
grant all on public.site_settings to service_role;

drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings for select to anon, authenticated using (true);

create or replace function public.admin_set_site_setting(p_key text, p_value jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.px_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if p_key is null or length(p_key) > 60 then raise exception 'Invalid key'; end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' then raise exception 'Value must be an object'; end if;
  insert into public.site_settings(key, value, updated_by, updated_at)
  values (p_key, p_value, public.px_uid(), now())
  on conflict (key) do update set value = excluded.value,
                                 updated_by = excluded.updated_by,
                                 updated_at = now();
  return p_value;
end;
$$;

create or replace function public.admin_get_site_settings()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb;
begin
  if not public.px_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into out from public.site_settings;
  return out;
end;
$$;

-- ============================================================
-- ADMIN ROLE PROMOTION
-- The claim lives in the Firebase token, which only a trusted server may
-- set. This table is the PENDING queue: an admin marks someone, and the
-- server-side script that already owns the service account applies it.
-- A client can request; only the server can grant.
-- ============================================================

create table if not exists public.admin_requests (
  id uuid primary key default gen_random_uuid(),
  target_id text not null references public.profiles(id) on delete cascade,
  requested_by text not null,
  action text not null default 'grant' check (action in ('grant','revoke')),
  reason text not null default '' check (length(reason) <= 500),
  fulfilled boolean not null default false,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  unique(target_id, action)
);

alter table public.admin_requests enable row level security;
grant select on public.admin_requests to authenticated;
grant insert, update, delete on public.admin_requests to authenticated;
grant all on public.admin_requests to service_role;

drop policy if exists admin_requests_read on public.admin_requests;
create policy admin_requests_read on public.admin_requests for select to authenticated
  using ((select public.px_admin()));

drop policy if exists admin_requests_write on public.admin_requests;
create policy admin_requests_write on public.admin_requests for insert to authenticated
  with check ((select public.px_admin()) and requested_by = public.px_uid());

create or replace function public.admin_request_role(p_target text, p_action text, p_reason text default '')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if not public.px_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if p_target is null then raise exception 'Invalid account'; end if;
  if p_target = public.px_uid() and p_action = 'grant' then
    raise exception 'You already hold administrator access';
  end if;
  if p_action not in ('grant','revoke') then raise exception 'Unknown action'; end if;
  if not exists(select 1 from public.profiles where id = p_target) then
    raise exception 'Account not found';
  end if;

  insert into public.admin_requests(target_id, requested_by, action, reason)
  values (p_target, public.px_uid(), p_action, left(coalesce(p_reason,''), 500))
  on conflict (target_id, action) do update set reason = excluded.reason
  returning id into new_id;
  return new_id;
end;
$$;

-- ============================================================
-- PUBLIC SITE STATS
-- Aggregates only. Callable anonymously because the marketing page is
-- public, so the function must return nothing identifying: counts and
-- sums only, never a row, an email or a name.
-- ============================================================

create or replace function public.public_site_stats()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'accounts', (select count(*) from public.profiles),
    'devices', (select count(*) from public.devices),
    'notes', (select count(*) from public.workspace_items where kind = 'note' and deleted_at is null),
    'tasks', (select count(*) from public.workspace_items where kind = 'task' and deleted_at is null),
    'focus_minutes', (select coalesce(round(sum(minutes)), 0) from public.app_usage where day > current_date - 30),
    'reviews', (select count(*) from public.reviews where status = 'approved'),
    'avg_rating', (select coalesce(round(avg(rating), 1), 0) from public.reviews where status = 'approved')
  );
$$;

revoke all on function public.public_site_stats() from public, anon, authenticated;
grant execute on function public.public_site_stats() to anon, authenticated;

create or replace function public.public_reviews(p_limit integer default 12)
returns table(id uuid, author_name text, body text, rating smallint, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.author_name, r.body, r.rating, r.created_at
  from public.reviews r
  where r.status = 'approved'
  order by r.approved_at desc nulls last, r.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;

revoke all on function public.public_reviews(integer) from public, anon, authenticated;
grant execute on function public.public_reviews(integer) to anon, authenticated;

-- Reviews are already public via the select policy, but this RPC lets the
-- marketing page fetch just the approved set in one round trip.
grant execute on function public.submit_review(text, text, integer, text) to anon, authenticated;
revoke all on function public.submit_review(text, text, integer, text) from public;

grant execute on function public.submit_bug_report(text, text, text, text, text, text) to anon, authenticated;
revoke all on function public.submit_bug_report(text, text, text, text, text, text) from public;

revoke all on function public.admin_reviews(text, integer), public.admin_moderate_review(uuid, boolean),
  public.admin_bug_reports(text, integer), public.admin_set_bug_status(uuid, text, text),
  public.admin_set_site_setting(text, jsonb), public.admin_get_site_settings(),
  public.admin_request_role(text, text, text)
  from public, anon;
grant execute on function public.admin_reviews(text, integer), public.admin_moderate_review(uuid, boolean),
  public.admin_bug_reports(text, integer), public.admin_set_bug_status(uuid, text, text),
  public.admin_set_site_setting(text, jsonb), public.admin_get_site_settings(),
  public.admin_request_role(text, text, text)
  to authenticated;

commit;