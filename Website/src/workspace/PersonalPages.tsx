import { useState, type FormEvent } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, Bell, Bookmark, Check, CheckCheck, ChevronRight, Cloud, Copy, FileText, Laptop, LogOut, Monitor, Moon, Plus, Puzzle, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Trash2, Volume2, Wifi } from 'lucide-react';
import { useWorkspace } from './DataContext';
import { useAccount } from './AuthContext';
import { AppButton, Avatar, CheckButton, Empty, IconButton, Modal, PageHeading, SectionHeading, Switch, Tag, Time, downloadText } from './ui';
import { dateKey, minutesLabel, type WorkspaceItem } from './types';
import { AppUsageList } from './Overview';
import { useStore } from '../lib/store';
import { THEMES } from '../lib/themes';
import { useSound } from '../components/Sound';
import { friendlyError } from './cloud';
import { navigate } from './navigation';

export function SetupGuide({ onClose }: { onClose: () => void }) {
  return <Modal title="Bring your desktop along." description="One account is the bridge between your devices." onClose={onClose}>
    <div className="ws-info-strip"><Cloud size={18} /><div>Firebase for sign-in. Supabase for your workspace.<small>Cloud setup must be completed before the desktop can sync.</small></div></div>
    {[['Connect your cloud projects', 'Follow the setup guide to register Firebase as a third-party provider in Supabase and install the database policies.'], ['Sign in with the same account', 'The desktop app and this site must use the same Firebase project and user ID.'], ['Enable the desktop sync bridge', 'Use the supplied desktop adapter to send local changes and receive remote updates.'], ['Choose what you share', 'App usage is opt-in. Games and Timeless are not part of the web workspace.']].map(([title, text], i) => <div key={title} style={{ display: 'flex', gap: 13, margin: '22px 0' }}><span className="ws-avatar" style={{ width: 25, height: 25, borderRadius: 8, background: 'var(--green-soft)', color: 'var(--green-deep)', fontSize: 11 }}>{i + 1}</span><div><strong style={{ fontSize: 12, fontWeight: 600 }}>{title}</strong><p style={{ color: 'var(--ink-3)', fontSize: 11, lineHeight: 1.8, marginTop: 4 }}>{text}</p></div></div>)}
    <a className="ws-button ws-button-outline" href="/setup-guide.md" target="_blank" rel="noreferrer" style={{ width: '100%' }}>Read the integration guide<ArrowRight size={14} /></a>
  </Modal>;
}

export function DesktopPage() {
  const { data, refresh, saveProfile, pending, realtime, lastSync } = useWorkspace();
  const { preview } = useAccount();
  const [range, setRange] = useState('today');
  const [setup, setSetup] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const today = dateKey();
  const sevenDays = Array.from({ length: 7 }, (_, i) => { const day = new Date(); day.setDate(day.getDate() - 6 + i); return day; });
  const usage = data.usage.filter((it) => range === 'today' ? it.day === today : it.day >= dateKey(sevenDays[0]) && it.day <= today);
  const chart = sevenDays.map((day) => ({ day, minutes: data.usage.filter((it) => it.day === dateKey(day)).reduce((sum, it) => sum + it.minutes, 0) }));
  const max = Math.max(1, ...chart.map((it) => it.minutes));
  const total = usage.reduce((sum, it) => sum + it.minutes, 0);
  return <div className="ws-page"><PageHeading eyebrow="YOUR DEVICES, ONE LITTLE WORLD" title="Desktop activity" description="A window into your desktop. No timers, no games, just the picture."><AppButton icon={Plus} onClick={() => setSetup(true)}>Connect desktop</AppButton></PageHeading>
    {preview && <div className="ws-info-strip"><Monitor size={18} /><div>You are looking at sample desktop activity.<small>A browser cannot read installed apps. Real usage must be shared by your signed-in desktop app.</small></div></div>}
    <div className="ws-toolbar"><div className="ws-segment"><button className={range === 'today' ? 'is-on' : ''} onClick={() => setRange('today')}>Today</button><button className={range === 'week' ? 'is-on' : ''} onClick={() => setRange('week')}>This week</button></div><span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{new Set(usage.map((it) => it.app_name)).size} apps / {minutesLabel(total)}</span><AppButton variant="outline" icon={ArrowDownToLine} style={{ marginLeft: 'auto' }} onClick={() => downloadText('pebblex-desktop-activity.json', JSON.stringify({ sample: preview, range, usage }, null, 2), 'application/json')}>Export</AppButton></div>
    <div className="ws-dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}><section className="ws-panel ws-panel-padding"><SectionHeading title="A week on your desktop" sub={preview ? 'Sample usage, in minutes' : 'Reported usage, in minutes'} />{data.usage.length ? <div className="ws-chart">{chart.map(({ day, minutes }) => <div className="ws-chart-day" key={dateKey(day)} title={`${day.toLocaleDateString()}: ${minutesLabel(minutes)}`}><span style={{ fontSize: 9 }}>{minutes ? minutesLabel(minutes) : '--'}</span><div className="ws-chart-bar" style={{ height: `${Math.max(2, minutes / max * 76)}%` }} /><span>{day.toLocaleDateString('en', { weekday: 'short' })}</span></div>)}</div> : <Empty icon={Activity} title="No activity yet." body="Enable activity sharing in your desktop app to see it here." />}</section><section className="ws-panel ws-panel-padding"><SectionHeading title="The apps you spend time with" sub={range === 'today' ? 'Today' : 'Last seven days'} />{usage.length ? <AppUsageList usage={usage} limit={8} /> : <Empty icon={Monitor} title="Nothing reported for this period." body="Desktop updates will appear here automatically." />}</section></div>
    <section style={{ marginTop: 30 }}><SectionHeading title="Your connected devices" sub="Web, desktop and extension — one shared workspace" action={refreshing ? 'Checking...' : 'Refresh'} onAction={() => { if (!refreshing) { setRefreshing(true); void refresh().finally(() => setRefreshing(false)); } }} /><div className="ws-panel">{data.devices.length ? data.devices.map((device) => <div className="ws-device-row" key={device.id}><span className="ws-activity-symbol">{device.kind === 'desktop' ? <Laptop size={20} /> : device.kind === 'extension' ? <Puzzle size={20} /> : <Monitor size={20} />}</span><div><strong>{device.name}</strong><p>{device.platform} / PebbleX {device.app_version}</p></div><div style={{ marginLeft: 'auto', textAlign: 'right' }}><Tag color={device.kind === 'web' ? 'green' : device.kind === 'extension' ? 'purple' : 'neutral'}>{preview ? 'Sample device' : device.kind === 'extension' ? 'Browser extension' : device.kind}</Tag><p>Last seen <Time value={device.last_seen} /></p></div></div>) : <Empty icon={Laptop} title="Your first device is a sign-in away." body="Use the same account on desktop to keep your work together." />}</div></section>
    <div className="ws-setting-row" style={{ marginTop: 20 }}><div><strong>Share desktop app usage</strong><p>Share app names and daily totals. Window titles and browsing history are never required. The desktop sync bridge must honor this preference.</p></div><Switch label="Share desktop app usage" checked={data.profile.usage_consent} disabled={pending.has('profile')} onChange={() => { void saveProfile({ usage_consent: !data.profile.usage_consent }).catch(() => {}); }} /></div>
    <div className="ws-footer-line"><span><ShieldCheck size={12} />Usage is read-only on the web.</span><span><Wifi size={12} />{preview ? 'Preview / not connected' : realtime ? 'Listening for desktop changes' : lastSync ? 'Polling for changes' : 'Waiting for a connection'}</span></div>{setup && <SetupGuide onClose={() => setSetup(false)} />}
  </div>;
}

export function ActivityList({ limit = 100 }: { limit?: number }) {
  const { data } = useWorkspace();
  return <>{data.activity.slice(0, limit).map((event) => <div className="ws-activity-row" key={event.id}><span className="ws-activity-symbol">{event.kind === 'note' ? <FileText size={15} /> : event.kind === 'task' ? <CheckCheck size={15} /> : event.kind === 'message' ? <Sparkles size={15} /> : <Activity size={15} />}</span><div><strong>{event.action}</strong><p>{event.origin === 'desktop' ? 'From your desktop' : 'From the web workspace'}</p></div><Time value={event.created_at} /></div>)}{!data.activity.length && <Empty icon={Activity} title="A clean page." body="Workspace changes will appear here as you make them." />}</>;
}

export function ActivityPage() {
  const { data, refresh } = useWorkspace();
  const { preview } = useAccount();
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState('all');
  const events = data.activity.filter((event) => (origin === 'all' || event.origin === origin) && event.action.toLowerCase().includes(query.toLowerCase()));
  return <div className="ws-page"><PageHeading eyebrow="THE LITTLE THINGS ADD UP" title="Workspace activity" description="Changes from the web and your desktop, together in one place."><AppButton variant="outline" icon={RefreshCw} onClick={() => { void refresh(); }}>Refresh</AppButton></PageHeading><div className="ws-toolbar"><label className="ws-search-input"><Search size={14} /><input aria-label="Search activity" placeholder="Find an update..." value={query} onChange={(e) => setQuery(e.target.value)} /></label><select className="ws-select" aria-label="Activity source" value={origin} onChange={(e) => setOrigin(e.target.value)}><option value="all">All devices</option><option value="desktop">Desktop</option><option value="web">Web</option></select><Tag>{preview ? 'Sample and local activity' : 'Latest 100 updates'}</Tag></div><div className="ws-panel ws-panel-padding">{events.map((event) => <div className="ws-activity-row" key={event.id}><span className="ws-activity-symbol"><Activity size={15} /></span><div><strong>{event.action}</strong><p>{event.kind} / {event.origin}</p></div><Time value={event.created_at} /></div>)}{!events.length && <Empty icon={Activity} title="No updates to show." body="Try another filter or make your first workspace change." />}</div></div>;
}

export function CollectionPage({ kind }: { kind: 'reminder' | 'prompt' }) {
  const { data, createItem, updateItem, removeItem, pending } = useWorkspace();
  const { toast } = useStore();
  const [editing, setEditing] = useState<WorkspaceItem | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [due, setDue] = useState(dateKey());
  const [time, setTime] = useState('09:00');
  const [error, setError] = useState('');
  const isReminder = kind === 'reminder';
  const items = data.items.filter((it) => it.kind === kind).sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const busy = pending.has('new-item') || (typeof editing === 'object' && editing && pending.has(editing.id));
  const open = (item: WorkspaceItem | 'new') => { setTitle(item === 'new' ? '' : item.title); setBody(item === 'new' ? '' : item.body); setDue(item === 'new' ? dateKey() : item.due_date || dateKey()); setTime(item === 'new' ? '09:00' : item.extra.time || '09:00'); setError(''); setEditing(item); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!title.trim() || !editing) return;
    try {
      const patch: Partial<WorkspaceItem> = { title: title.trim(), body, due_date: isReminder ? due : null, extra: isReminder ? { time } : {} };
      if (editing === 'new') await createItem(kind, patch);
      else await updateItem(editing.id, patch, editing.updated_at);
      setEditing(null); toast({ title: isReminder ? 'Reminder saved' : 'Prompt saved' });
    } catch (err) { setError(friendlyError(err)); }
  };
  return <div className="ws-page"><PageHeading eyebrow={isReminder ? 'A GENTLE NUDGE' : 'GOOD WORDS, READY WHEN YOU ARE'} title={isReminder ? 'Reminders' : 'Prompt saver'} description={isReminder ? 'The little things you would rather not forget.' : 'Keep your best prompts close. Copy them into your next conversation.'}><AppButton icon={Plus} onClick={() => open('new')}>{isReminder ? 'New reminder' : 'New prompt'}</AppButton></PageHeading>
    {isReminder && <p style={{ color: 'var(--ink-3)', fontSize: 11, marginBottom: 20 }}>Reminder dates sync across devices. This web view does not send background notifications.</p>}
    <div className={isReminder ? 'ws-panel' : 'ws-note-grid'} style={!isReminder ? { gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' } : undefined}>{items.map((it) => isReminder ? <div className={`ws-task-row ${it.status === 'done' ? 'is-done' : ''}`} key={it.id}><CheckButton checked={it.status === 'done'} label={`Complete ${it.title}`} disabled={pending.has(it.id)} onChange={() => { void updateItem(it.id, { status: it.status === 'done' ? 'todo' : 'done' }).catch(() => {}); }} /><button className="ws-task-title" onClick={() => open(it)}><strong>{it.title}</strong><small>{it.due_date === dateKey() ? 'Today' : it.due_date} at {it.extra.time || '09:00'}</small></button><IconButton label="Edit reminder" icon={ChevronRight} onClick={() => open(it)} /></div> : <article key={it.id} className="ws-note-preview" style={{ display: 'block' }}><div className="ws-note-preview-head"><Bookmark size={17} /><IconButton icon={Settings2} label="Edit prompt" onClick={() => open(it)} /></div><h3>{it.title}</h3><p>{it.body}</p><footer><button className="ws-text-button" onClick={() => { void navigator.clipboard.writeText(it.body).then(() => toast({ title: 'Prompt copied' })).catch(() => toast({ title: 'Clipboard unavailable', kind: 'err', msg: 'Open the prompt to select and copy its text.' })); }}><Copy size={12} />Copy prompt</button><button className="ws-text-button" onClick={() => { void updateItem(it.id, { pinned: !it.pinned }).catch(() => {}); }}>{it.pinned ? 'Unpin' : 'Pin'}</button></footer></article>)}</div>
    {!items.length && <Empty icon={isReminder ? Bell : Bookmark} title={isReminder ? 'Nothing on your mind?' : 'A little library of possibilities.'} body={isReminder ? 'Add a gentle reminder for your future self.' : 'Save a prompt you would like to use again.'} />}
    {editing && <Modal title={`${editing === 'new' ? 'New' : 'Edit'} ${kind}`} onClose={() => { if (!busy) setEditing(null); }}><form onSubmit={(event) => { void save(event); }}><label className="ws-field">Title<input required className="ws-input" maxLength={180} value={title} autoFocus onChange={(e) => setTitle(e.target.value)} /></label><label className="ws-field">{isReminder ? 'Details' : 'Prompt'}<textarea className="ws-input" required={!isReminder} value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} /></label>{isReminder && <div className="ws-field-row"><label className="ws-field">Date<input className="ws-input" type="date" required value={due} onChange={(e) => setDue(e.target.value)} /></label><label className="ws-field">Time<input className="ws-input" type="time" required value={time} onChange={(e) => setTime(e.target.value)} /></label></div>}{error && <div className="ws-form-error" role="alert">{error}</div>}<div className="ws-modal-actions">{editing !== 'new' && <AppButton type="button" variant="danger" icon={Trash2} disabled={Boolean(busy)} style={{ marginRight: 'auto' }} onClick={() => { if (window.confirm(`Delete this ${kind}?`)) void removeItem(editing.id).then(() => setEditing(null)).catch(() => {}); }}>Delete</AppButton>}<AppButton type="submit" disabled={Boolean(busy)}>{busy ? 'Saving...' : 'Save'}</AppButton></div></form></Modal>}
  </div>;
}

export function ProfilePage() {
  const { data, saveProfile, pending, resetPreview } = useWorkspace();
  const account = useAccount();
  const { toast } = useStore();
  const [name, setName] = useState(data.profile.name);
  const [bio, setBio] = useState(data.profile.bio);
  const [color, setColor] = useState(data.profile.avatar_color);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    try { await saveProfile({ name, bio, avatar_color: color }); toast({ title: 'A little more you', msg: 'Your profile has been updated.' }); }
    catch (err) { setError(friendlyError(err)); }
  };
  return <div className="ws-page ws-profile-layout"><PageHeading eyebrow="YOUR OWN LITTLE CORNER" title="My profile" description="Make yourself at home." /><form onSubmit={(event) => { void save(event); }}><div className="ws-profile-section" style={{ paddingTop: 5 }}><div className="ws-profile-avatar-row"><Avatar name={name || 'You'} color={color} size={70} /><div><strong style={{ fontSize: 13, fontWeight: 600 }}>A color that feels like you</strong><div className="ws-color-buttons">{['#b7cba4', '#c5b2d9', '#e2bda0', '#9dbdc7', '#d6acb9', '#b7bac9'].map((c) => <button key={c} type="button" className={color === c ? 'is-on' : ''} style={{ background: c }} aria-label={`Use ${c} avatar color`} onClick={() => setColor(c)} />)}</div></div></div><div className="ws-field-row"><label className="ws-field">Full name<input className="ws-input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} /></label><label className="ws-field">Email address<input className="ws-input" value={data.profile.email} readOnly /></label></div><label className="ws-field">A little about you<textarea className="ws-input" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} placeholder="What are you making room for?" /></label>{error && <div className="ws-form-error">{error}</div>}<AppButton type="submit" disabled={pending.has('profile')} icon={Check}>{pending.has('profile') ? 'Saving...' : 'Save profile'}</AppButton></div></form>
    <div className="ws-profile-section"><h2>Account & security</h2><div className="ws-setting-row"><div><strong>{account.preview ? 'Preview account' : account.user?.emailVerified ? 'Email verified' : 'Email verification pending'}</strong><p>{account.preview ? 'This is sample data. No real account has been created.' : 'Firebase manages your account credentials securely.'}</p></div><Tag color="green">{account.preview ? 'Local only' : account.admin ? 'Administrator' : 'Personal account'}</Tag></div>{!account.preview && <div className="ws-setting-row"><div><strong>Reset your password</strong><p>Get a secure reset link in your inbox.</p></div><AppButton variant="outline" disabled={resetting} onClick={() => { setResetting(true); void account.reset(data.profile.email).then(() => toast({ title: 'Check your inbox', msg: 'A password-reset link has been requested.' })).catch((err) => toast({ kind: 'err', title: 'Request failed', msg: friendlyError(err) })).finally(() => setResetting(false)); }}>Send reset link</AppButton></div>}</div>
    <div className="ws-profile-section"><h2>Your data belongs to you</h2><div className="ws-setting-row"><div><strong>Export your workspace</strong><p>Download your tasks, notes, conversations, profile, and activity as JSON.</p></div><AppButton variant="outline" icon={ArrowDownToLine} onClick={() => downloadText('pebblex-workspace.json', JSON.stringify({ exported_at: new Date().toISOString(), preview: account.preview, ...data }, null, 2), 'application/json')}>Export data</AppButton></div>{account.preview && <div className="ws-setting-row"><div><strong>Start the preview again</strong><p>Replace local edits with the original sample workspace.</p></div><AppButton variant="ghost" icon={RefreshCw} onClick={() => { if (window.confirm('Reset all changes in this local preview?')) { resetPreview(); navigate('/app'); } }}>Reset preview</AppButton></div>}</div>
    <div className="ws-setting-row"><div><strong>Take a little break.</strong><p>Your saved work will be here when you come back.</p></div><AppButton variant="outline" icon={LogOut} disabled={loggingOut} onClick={() => { setLoggingOut(true); void account.logout().then(() => navigate('/login')).catch((err) => { setLoggingOut(false); toast({ kind: 'err', title: 'Could not sign out', msg: friendlyError(err) }); }); }}>{account.preview ? 'Leave preview' : 'Sign out'}</AppButton></div>
  </div>;
}

export function PreferencesPage() {
  const { theme, setTheme, toast } = useStore();
  const { saveProfile, pending } = useWorkspace();
  const [sound, toggleSound] = useSound();
  return <div className="ws-page ws-profile-layout"><PageHeading eyebrow="MAKE THIS SPACE YOURS" title="Appearance & preferences" description="The same calm structure. A different kind of feeling." /><section className="ws-profile-section" style={{ paddingTop: 5 }}><h2>Your workspace theme</h2><p>Thirteen ways to feel at home. The layout stays exactly where you left it.</p><div className="ws-theme-grid">{THEMES.map((t) => <button key={t.id} className={`ws-theme-button ${theme === t.id ? 'is-on' : ''}`} disabled={pending.has('profile')} onClick={() => { setTheme(t.id); void saveProfile({ theme: t.id }).then(() => toast({ title: `${t.name} applied` })).catch(() => {}); }}><span className="ws-theme-swatch" style={{ background: t.bg }}><span style={{ background: t.pill }} /><i style={{ background: t.main }} /></span><small>{t.name}</small></button>)}</div></section><section className="ws-profile-section"><h2>Thoughtful little details</h2><div className="ws-setting-row"><div><strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Volume2 size={14} />Quiet sound effects</strong><p>Soft taps on clicks. Always optional, never in the background.</p></div><Switch checked={sound} onChange={toggleSound} label="Quiet sound effects" /></div><div className="ws-setting-row"><div><strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Moon size={14} />Reduced motion</strong><p>Automatically follows your operating system's accessibility preference.</p></div><Tag>System preference</Tag></div></section><section className="ws-profile-section"><h2>Keyboard, first</h2>{[['Search your workspace', 'Ctrl / Cmd + K'], ['New task', 'N'], ['Save an open note', 'Ctrl / Cmd + S'], ['Close a dialog', 'Esc']].map(([label, key]) => <div className="ws-setting-row" key={label} style={{ padding: '10px 0' }}><span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{label}</span><kbd className="kbd">{key}</kbd></div>)}</section></div>;
}