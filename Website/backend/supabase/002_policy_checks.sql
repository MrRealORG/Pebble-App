-- Optional smoke checks. Run in the SQL editor AFTER 001_workspace.sql.
-- All fixtures are rolled back. This requires the SQL editor's trusted role.
begin;

insert into public.profiles(id, name, email) values
  ('__pebblex_rls_a__', 'Policy Test A', 'policy-a@example.com'),
  ('__pebblex_rls_b__', 'Policy Test B', 'policy-b@example.com');
insert into public.workspace_items(owner_id, kind, title, body) values
  ('__pebblex_rls_a__', 'note', 'A private note', 'Owner A only'),
  ('__pebblex_rls_b__', 'note', 'B private note', 'Owner B only');

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '__pebblex_rls_a__', 'role', 'authenticated',
  'iss', 'https://securetoken.google.com/' || value,
  'aud', value, 'admin', false
)::text, true) from private.workspace_config where key = 'firebase_project_id';

set local role authenticated;
do $$
declare affected integer;
begin
  if (select count(*) from public.workspace_items where owner_id = '__pebblex_rls_a__') <> 1 then
    raise exception 'FAIL: owner cannot read their own note';
  end if;
  if exists(select 1 from public.workspace_items where owner_id = '__pebblex_rls_b__') then
    raise exception 'FAIL: another user can read private notes';
  end if;
  update public.workspace_items set body = 'Should never happen' where owner_id = '__pebblex_rls_b__';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: cross-user update allowed'; end if;
  begin
    perform public.admin_metrics();
    raise exception 'FAIL: non-admin could read admin metrics';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set account_enabled = false where id = '__pebblex_rls_a__';
    raise exception 'FAIL: client could change a protected account field';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: owner access, cross-user isolation, admin restriction, protected profile columns';
end $$;

reset role;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '__pebblex_rls_a__', 'role', 'authenticated',
  'iss', 'https://securetoken.google.com/' || value,
  'aud', value, 'admin', true
)::text, true) from private.workspace_config where key = 'firebase_project_id';
set local role authenticated;
do $$
begin
  perform public.admin_metrics();
  if exists(select 1 from public.workspace_items where owner_id = '__pebblex_rls_b__') then
    raise exception 'FAIL: admin can read private note contents';
  end if;
  if not exists(select 1 from public.activity_events where owner_id = '__pebblex_rls_b__') then
    raise exception 'FAIL: admin cannot read activity metadata';
  end if;
  raise notice 'PASS: admin can inspect metadata but not private note bodies';
end $$;
rollback;