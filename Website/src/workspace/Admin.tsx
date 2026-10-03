import { useEffect, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BarChart3, ChevronRight, Globe, Laptop, Puzzle, RefreshCw, Search, Shield, ShieldCheck, UserRound, Users } from 'lucide-react';
import { useAccount } from './AuthContext';
import { useWorkspace } from './DataContext';
import { friendlyError, supabase } from './cloud';
import { AppButton, Avatar, Empty, Loading, Modal, PageHeading, SectionHeading, Tag, Time, downloadText } from './ui';
import { navigate } from './navigation';
import type { Activity as ActivityRecord, AdminMetrics, AdminUser, Device } from './types';
import { useStore } from '../lib/store';

type UsageSummary = {
  days: { day: string; members: number; minutes: number }[];
  apps: { app_name: string; category: string; members: number; minutes: number }[];
  sources: { kind: string; devices: number }[];
};
type AdminDevice = Device & { owner_name: string; total_count: number };
type Tab = 'users' | 'devices' | 'usage' | 'activity';

const minutes = (value: number) => (value >= 60 ? `${Math.floor(value / 60)}h ${Math.round(value % 60)}m` : `${Math.round(value)}m`);

export function AdminPage() {
  const { preview, admin, user } = useAccount();
  const { data } = useWorkspace();
  const { toast } = useStore();
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [usage, setUsage] = useState<UsageSummary>({ days: [], apps: [], sources: [] });
  const [events, setEvents] = useState<ActivityRecord[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics>({ users: 0, active_users: 0, devices: 0, changes: 0 });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!preview && !admin) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError('');
      try {
        if (preview) {
          const now = Date.now();
          const base = data.profile;
          const samples: AdminUser[] = [
            { ...base, task_count: data.items.filter((it) => it.kind === 'task').length, note_count: data.items.filter((it) => it.kind === 'note').length, device_count: data.devices.length, total_count: 5 },
            ...([['Sam Rivera', 'sam', '#c5b2d9'], ['Jordan Lee', 'jordan', '#9dbdc7'], ['Jamie Park', 'jamie', '#e2bda0'], ['Taylor Reed', 'taylor', '#d6acb9']] as const).map(([name, handle, color], i) => ({ ...base, id: `sample-${handle}`, name, email: `${handle}@example.com`, avatar_color: color, task_count: 4 + i * 3, note_count: 2 + i, device_count: i % 2 + 1, total_count: 5, last_seen: new Date(now - (i + 1) * 3600000).toISOString() })),
          ];
          const filtered = samples.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase()));
          setMetrics({ users: samples.length, active_users: samples.length, devices: samples.reduce((n, u) => n + u.device_count, 0), changes: data.activity.length });
          setUsers(filtered.map((u) => ({ ...u, total_count: filtered.length })));
          const sampleDevices: AdminDevice[] = [
            { id: 'd1', owner_id: samples[0].id, owner_name: samples[0].name, name: "Alex's MacBook Pro", platform: 'macOS', kind: 'desktop', app_version: '0.1.0', last_seen: new Date(now - 300000).toISOString(), total_count: 3 },
            { id: 'd2', owner_id: samples[1].id, owner_name: samples[1].name, name: 'Chrome / PebbleX Capture', platform: 'Chrome', kind: 'extension', app_version: '0.1.0', last_seen: new Date(now - 900000).toISOString(), total_count: 3 },
            { id: 'd3', owner_id: samples[2].id, owner_name: samples[2].name, name: 'Edge', platform: 'Windows', kind: 'web', app_version: '0.1.0', last_seen: new Date(now - 3600000).toISOString(), total_count: 3 },
          ];
          setDevices(sampleDevices.filter((d) => `${d.name} ${d.owner_name} ${d.platform}`.toLowerCase().includes(query.toLowerCase())));
          const day = new Date();
          setUsage({
            days: Array.from({ length: 7 }, (_, i) => { const d = new Date(day); d.setDate(d.getDate() - i); return { day: d.toISOString().slice(0, 10), members: 5 - (i % 3), minutes: 210 - i * 14 }; }),
            apps: [['Figma', 'Design', 5, 420], ['Visual Studio Code', 'Development', 4, 366], ['github.com', 'Browsing', 3, 188], ['Arc', 'Browsing', 3, 152], ['PebbleX', 'Productivity', 2, 96]].map(([app, category, members, mins]) => ({ app_name: String(app), category: String(category), members: Number(members), minutes: Number(mins) })),
            sources: [{ kind: 'desktop', devices: 6 }, { kind: 'web', devices: 4 }, { kind: 'extension', devices: 3 }],
          });
          setEvents(data.activity);
        } else {
          const [directory, counts, deviceList, usageList, audit] = await Promise.all([
            supabase!.rpc('admin_directory', { search_text: query.trim(), page_number: page }),
            supabase!.rpc('admin_metrics'),
            supabase!.rpc('admin_devices', { search_text: query.trim(), page_number: tab === 'devices' ? page : 0 }),
            supabase!.rpc('admin_usage_summary'),
            supabase!.from('activity_events').select('*').order('created_at', { ascending: false }).range(page * 12, page * 12 + 11),
          ]);
          for (const r of [directory, counts, deviceList, usageList, audit]) if (r.error) throw r.error;
          if (!cancelled) {
            setUsers(directory.data as AdminUser[]);
            setMetrics(counts.data as AdminMetrics);
            setDevices(deviceList.data as AdminDevice[]);
            setUsage(usageList.data as unknown as UsageSummary);
            setEvents(audit.data as ActivityRecord[]);
          }
        }
      } catch (err) { if (!cancelled) setError(friendlyError(err)); }
      finally { if (!cancelled) setLoading(false); }
    };
    const timer = setTimeout(() => { void load(); }, preview ? 0 : 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [preview, admin, data, query, page, tab, revision]);

  useEffect(() => {
    if (preview || !admin || !supabase || !user) return;
    const client = supabase;
    const channel = client.channel(`admin-metadata:${user.uid}`);
    let stopped = false;
    let debounce: ReturnType<typeof setTimeout>;
    for (const table of ['profiles', 'devices', 'activity_events', 'app_usage']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => { if (!stopped) setRevision((n) => n + 1); }, 700);
      });
    }
    void client.realtime.setAuth().then(() => { if (!stopped) channel.subscribe(); }).catch(() => {});
    return () => { stopped = true; clearTimeout(debounce); void client.removeChannel(channel); };
  }, [preview, admin, user?.uid]);

  const changeAccountState = async (target: AdminUser, enabled: boolean) => {
    setBusy(true);
    try {
      if (preview) throw new Error('This preview cannot change account access.');
      const result = await supabase!.rpc('admin_set_account_state', { p_owner: target.id, p_enabled: enabled });
      if (result.error) throw result.error;
      toast({ title: enabled ? 'Access restored' : 'Access suspended', msg: `Recorded in the audit log for ${target.name}.` });
      setSelected(null);
      setRevision((n) => n + 1);
    } catch (err) { toast({ kind: 'err', title: 'Action not completed', msg: friendlyError(err) }); }
    finally { setBusy(false); }
  };

  if (!preview && !admin) return <div className="ws-page"><Empty icon={ShieldCheck} title="This space is for administrators." body="Your account does not have the server-issued admin claim. You can still access your personal workspace."><AppButton onClick={() => navigate('/app')}>Back to my workspace</AppButton></Empty></div>;

  const stats = [
    { label: 'Workspace accounts', value: metrics.users, icon: Users, hint: 'Registered workspace profiles' },
    { label: 'Active this week', value: metrics.active_users, icon: Activity, hint: 'Seen in the last 7 days' },
    { label: 'Connected devices', value: metrics.devices, icon: Laptop, hint: 'Web, desktop and extension' },
    { label: 'Workspace changes', value: metrics.changes, icon: RefreshCw, hint: 'Recorded in the last 7 days' },
  ];
  const total = tab === 'users' ? (users[0]?.total_count || 0) : tab === 'devices' ? (devices[0]?.total_count || 0) : rows(tab, users.length, devices.length, events.length, usage.days.length);
  const maxMinutes = Math.max(1, ...usage.days.map((d) => d.minutes));

  return (
    <div className="ws-page">
      <PageHeading eyebrow="THE BIGGER PICTURE" title="Admin overview" description="Keep an eye on your community. Give their work its privacy.">
        <AppButton variant="outline" icon={RefreshCw} disabled={loading} onClick={() => setRevision((n) => n + 1)}>Refresh</AppButton>
      </PageHeading>
      {preview && <div className="ws-info-strip"><Shield size={18} /><div>Admin preview / sample accounts only.<small>This is not administrative access to a live service. Production access requires a Firebase admin claim set on a trusted server.</small></div></div>}
      <div className="ws-stats">{stats.map(({ label, value, icon: Icon, hint }) => <div className="ws-stat" key={label}><div className="ws-stat-label"><Icon size={13} />{label}</div><div className="ws-stat-value"><strong>{value.toLocaleString()}</strong></div><div className="ws-stat-hint">{hint}</div></div>)}</div>
      <div className="ws-toolbar">
        <div className="ws-segment">{([['users', 'Users', Users], ['devices', 'Devices', Laptop], ['usage', 'Usage', BarChart3], ['activity', 'Activity', Activity]] as const).map(([id, label, Icon]) => <button key={id} className={tab === id ? 'is-on' : ''} onClick={() => { setTab(id); setPage(0); }}><Icon size={13} />{label}</button>)}</div>
        {tab !== 'usage' && <label className="ws-search-input"><Search size={14} /><input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder={`Search ${tab}...`} aria-label={`Search ${tab}`} /></label>}
        <AppButton variant="outline" icon={ArrowDownToLine} style={{ marginLeft: 'auto' }} onClick={() => downloadText(`pebblex-admin-${tab}-page-${page + 1}.json`, JSON.stringify({ preview, exported_at: new Date().toISOString(), rows: tab === 'users' ? users : tab === 'devices' ? devices : tab === 'usage' ? usage : events }, null, 2), 'application/json')}>Export this page</AppButton>
      </div>
      {error ? <div className="ws-error-banner" role="alert"><Shield size={16} /><span>{error}</span></div> : loading ? <Loading label="Checking workspace activity" /> : tab === 'users' ? (
        <div className="ws-panel" style={{ overflowX: 'auto' }}><table className="ws-data-table"><thead><tr><th>Member</th><th>Workspace</th><th>Devices</th><th>Last seen</th><th /></tr></thead><tbody>{users.map((u) => <tr key={u.id}><td><div className="ws-table-user"><Avatar name={u.name} color={u.avatar_color} /><div><strong>{u.name}</strong><small>{u.email}</small></div></div></td><td><span>{u.task_count} tasks</span><span style={{ color: 'var(--ink-3)', marginLeft: 9 }}>{u.note_count} notes</span></td><td>{u.device_count}</td><td><Time value={u.last_seen} /></td><td><button className="ws-icon-button" aria-label={`View ${u.name}`} onClick={() => setSelected(u)}><ChevronRight size={15} /></button></td></tr>)}</tbody></table>{!users.length && <Empty icon={Users} title="No accounts match this search." body="Try a name or another email address." />}</div>
      ) : tab === 'devices' ? (
        <div className="ws-panel" style={{ overflowX: 'auto' }}><table className="ws-data-table"><thead><tr><th>Device</th><th>Owner</th><th>Source</th><th>Version</th><th>Last seen</th></tr></thead><tbody>{devices.map((d) => <tr key={d.id}><td><div className="ws-table-user"><span className="ws-activity-symbol">{d.kind === 'extension' ? <Puzzle size={15} /> : <Laptop size={15} />}</span><div><strong>{d.name}</strong><small>{d.platform}</small></div></div></td><td>{d.owner_name}</td><td><Tag color={d.kind === 'extension' ? 'purple' : d.kind === 'web' ? 'green' : 'neutral'}>{d.kind}</Tag></td><td>{d.app_version}</td><td><Time value={d.last_seen} /></td></tr>)}</tbody></table>{!devices.length && <Empty icon={Laptop} title="No devices match this search." body="Try a device name, owner, or platform." />}</div>
      ) : tab === 'usage' ? (
        <div className="ws-dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
          <section className="ws-panel ws-panel-padding"><SectionHeading title="Daily shared minutes" sub="Aggregate only / last 30 days" /><div className="ws-chart">{usage.days.map((d) => <div className="ws-chart-day" key={d.day} title={`${d.day}: ${minutes(d.minutes)} across ${d.members} members`}><span style={{ fontSize: 9 }}>{minutes(d.minutes)}</span><div className="ws-chart-bar" style={{ height: `${Math.max(2, d.minutes / maxMinutes * 76)}%` }} /><span>{d.day.slice(5)}</span></div>)}</div></section>
          <section className="ws-panel ws-panel-padding"><SectionHeading title="Most shared tools" sub="No per-user history is stored here" />{usage.apps.map((a) => <div className="ws-usage-row" key={a.app_name}><span className="ws-app-icon" style={{ background: 'var(--green-soft)', color: 'var(--green-deep)' }}>{a.category === 'Browsing' ? <Globe size={14} /> : a.app_name[0]}</span><div className="ws-usage-detail"><div className="ws-usage-label"><span>{a.app_name}</span><span>{minutes(a.minutes)} / {a.members} members</span></div><div className="ws-meter"><i style={{ width: `${Math.max(3, a.minutes / (usage.apps[0]?.minutes || 1) * 100)}%`, background: 'var(--green)' }} /></div></div></div>)}</section>
          <section className="ws-panel ws-panel-padding"><SectionHeading title="Where work happens" sub="Devices by source" />{usage.sources.map((s) => <div className="ws-setting-row" key={s.kind}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{s.kind === 'extension' ? <Puzzle size={17} /> : <Laptop size={17} />}<strong>{s.kind === 'extension' ? 'Browser extension' : s.kind}</strong></div><strong>{s.devices}</strong></div>)}</section>
        </div>
      ) : (
        <div className="ws-panel ws-panel-padding"><SectionHeading title="Workspace event log" sub="Metadata only. Private content is not included." />{events.map((e) => <div className="ws-activity-row" key={e.id}><span className="ws-activity-symbol"><Activity size={15} /></span><div><strong>{e.action}</strong><p>{e.origin} / {users.find((u) => u.id === e.owner_id)?.name || e.owner_id}</p></div><Time value={e.created_at} /></div>)}{!events.length && <Empty icon={Activity} title="No events on this page." body="Workspace changes will be recorded here." />}</div>
      )}
      <div className="ws-pagination"><span>{tab === 'users' ? `${total} matching accounts` : tab === 'devices' ? `${total} devices` : tab === 'usage' ? 'Aggregate totals' : 'Most recent first'} / Page {page + 1}</span><div style={{ display: 'flex', gap: 8 }}><AppButton variant="outline" icon={ArrowLeft} disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>Previous</AppButton><AppButton variant="outline" disabled={loading || preview || tab === 'usage' || (page + 1) * 12 >= total} onClick={() => setPage((p) => p + 1)}>Next<ArrowRight size={13} /></AppButton></div></div>
      <div className="ws-footer-line"><span><ShieldCheck size={12} />Read-only administration. Private note and message bodies stay private.</span><span>{preview ? 'Sample directory' : 'Access verified by Firebase claims and Supabase policies'}</span></div>
      {selected && <Modal title="Workspace member" description="Account metadata, without private content." onClose={() => { if (!busy) setSelected(null); }}>
        <div className="ws-profile-avatar-row"><Avatar name={selected.name} color={selected.avatar_color} size={55} /><div><h3 style={{ fontSize: 18, fontWeight: 600 }}>{selected.name}</h3><p style={{ color: 'var(--ink-3)', fontSize: 12 }}>{selected.email}</p></div></div>
        {[['Account ID', selected.id], ['Created', new Date(selected.created_at).toLocaleDateString()], ['Tasks', selected.task_count], ['Notes', selected.note_count], ['Connected devices', selected.device_count]].map(([label, value]) => <div className="ws-setting-row" key={String(label)} style={{ padding: '11px 0', gap: 25 }}><span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{label}</span><span style={{ fontSize: 12, overflowWrap: 'anywhere', textAlign: 'right' }}>{value}</span></div>)}
        <div className="ws-info-strip" style={{ marginTop: 18 }}><UserRound size={16} /><div>Suspension blocks workspace access without deleting data.<small>It cannot target protected accounts, and it is written to the audit log.</small></div></div>
        <div className="ws-modal-actions"><AppButton variant="danger" disabled={busy || preview || selected.id === user?.uid} onClick={() => { void changeAccountState(selected, false); }}>{busy ? 'Working...' : 'Suspend access'}</AppButton><AppButton disabled={busy || preview || selected.id === user?.uid} onClick={() => { void changeAccountState(selected, true); }}>Restore access</AppButton><AppButton variant="ghost" disabled={busy} onClick={() => setSelected(null)}>Close</AppButton></div>
      </Modal>}
    </div>
  );
}

function rows(tab: Tab, users: number, devices: number, events: number, days: number) {
  return tab === 'users' ? users : tab === 'devices' ? devices : tab === 'activity' ? events : days;
}
