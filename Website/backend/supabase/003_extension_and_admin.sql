-- Extends the workspace for the browser extension and read-only administrator tools.
-- Run after 001_workspace.sql. Contains no AI credentials and grants no client role changes.
begin;

-- Browser extensions become first-class devices alongside web and desktop.
alter table public.devices drop constraint if exists devices_kind_check;
alter table public.devices add constraint devices_kind_check check (kind in ('web','desktop','extension'));

-- A synced item can identify which surface wrote it.
alter table public.workspace_items drop constraint if exists workspace_items_origin_check;
alter table public.workspace_items add constraint workspace_items_origin_check
  check (origin in ('web','desktop','extension'));

-- Protected accounts cannot be disabled through the administrative action below.
-- Clients cannot write this column: the role grant only covers
-- name, bio, avatar_color, theme, usage_consent.
alter table public.profiles add column if not exists protected_account boolean not null default false;

create or replace function public.admin_devices(search_text text default '', page_number integer default 0)
returns table(id uuid, owner_id text, owner_name text, name text, platform text, kind text, app_version text, last_seen timestamptz, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.px_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if length(search_text) > 200 or page_number < 0 or page_number > 100000 then raise exception 'Invalid search'; end if;
  return query
    select d.id, d.owner_id, p.name, d.name, d.platform, d.kind, d.app_version, d.last_seen, count(*) over()
    from public.devices d join public.profiles p on p.id = d.owner_id
    where position(lower(search_text) in lower(d.name || ' ' || p.name || ' ' || d.platform)) > 0
    order by d.last_seen desc, d.id
    limit 12 offset page_number * 12;
end;
$$;

-- Aggregate usage only. No per-user browsing or app history is returned.
create or replace function public.admin_usage_summary() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.px_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'days', coalesce((select jsonb_agg(row_to_json(day) order by day->>'day') from (
        select day::text, count(distinct owner_id) as members, round(sum(minutes)) as minutes
        from public.app_usage where day > current_date - 30 group by day
      ) day), '[]'::jsonb),
    'apps', coalesce((select jsonb_agg(row_to_json(app)) from (
        select app_name, category, count(distinct owner_id) as members, round(sum(minutes)) as minutes
        from public.app_usage where day > current_date - 30 group by app_name, category
        order by sum(minutes) desc limit 12
      ) app), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(row_to_json(src)) from (
        select kind, count(*) as devices from public.devices group by kind
      ) src), '[]'::jsonb)
  );
end;
$$;

-- One-way access suspension. It cannot delete data, cannot target protected
-- accounts, cannot target the caller, and is recorded in the activity log.
create or replace function public.admin_set_account_state(p_owner text, p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare was_enabled boolean; is_protected boolean;
begin
  if not public.px_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if p_owner is null or length(p_owner) > 128 then raise exception 'Invalid account'; end if;
  if p_owner = public.px_uid() then raise exception 'You cannot change your own account access'; end if;
  select account_enabled, protected_account into was_enabled, is_protected from public.profiles where id = p_owner;
  if not found then raise exception 'Account not found'; end if;
  if is_protected then raise exception 'This account is protected and cannot be changed here'; end if;
  if was_enabled = p_enabled then return false; end if;
  update public.profiles set account_enabled = p_enabled where id = p_owner;
  insert into public.activity_events(owner_id, action, kind, origin)
    values(p_owner, case when p_enabled then 'Access restored' else 'Access suspended' end, 'account', 'admin');
  return true;
end;
$$;

-- Lets a signed-in extension create its own profile row if it has not been
-- provisioned by the web or desktop app yet. It accepts no client-supplied ID.
create or replace function public.ensure_extension_account()
returns boolean
language plpgsql security definer set search_path = '' as $$
declare jwt_email text;
begin
  if not public.px_valid_identity() or public.px_uid() is null then
    raise exception 'Valid Firebase sign-in required' using errcode = '42501';
  end if;
  jwt_email := coalesce(auth.jwt()->>'email', '');
  if jwt_email = '' then raise exception 'A verified email is required'; end if;
  insert into public.profiles(id, email, name)
  values(public.px_uid(), jwt_email, split_part(jwt_email, '@', 1))
  on conflict (id) do nothing;
  return true;
end;
$$;

revoke all on function public.ensure_extension_account() from public, anon;
grant execute on function public.ensure_extension_account() to authenticated;

revoke all on function public.admin_devices(text, integer), public.admin_usage_summary(), public.admin_set_account_state(text, boolean) from public, anon;
grant execute on function public.admin_devices(text, integer), public.admin_usage_summary(), public.admin_set_account_state(text, boolean) to authenticated;

-- The extension reports domain-level browsing totals, never URLs or titles.
-- Its rows reuse app_usage with category = 'Browsing' and app_name = hostname.

commit;
