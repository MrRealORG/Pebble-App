import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowRight, ArrowUpRight, Bell, Bookmark, CheckCheck, ChevronDown, ChevronRight, Cloud, FileText, House, Laptop, Leaf, LogOut, Menu, Monitor, Palette, Search, Settings2, Shield, Sparkles, UserRound, type LucideIcon } from 'lucide-react';
import { AccountProvider, useAccount } from './AuthContext';
import { WorkspaceDataProvider, useWorkspace } from './DataContext';
import { AuthPage } from './AuthPage';
import { Overview } from './Overview';
import { TasksPage, TaskEditor, type TaskDraft } from './Tasks';
import { AIPage, NotesPage } from './Writing';
import { ActivityList, ActivityPage, CollectionPage, DesktopPage, PreferencesPage, ProfilePage, SetupGuide } from './PersonalPages';
import { AdminPage } from './Admin';
import { navigate, usePath } from './navigation';
import { friendlyError } from './cloud';
import { AppButton, Avatar, IconButton, Loading, Modal, Empty } from './ui';
import { BrandMark } from '../components/Icon';
import { useStore } from '../lib/store';
import { THEMES } from '../lib/themes';
import { sfx } from '../lib/audio';
import './workspace.css';

const NAV: { title: string; items: { id: string; label: string; icon: LucideIcon; fresh?: boolean }[] }[] = [
  { title: 'WORKSPACE', items: [
    { id: '', label: 'Overview', icon: House },
    { id: 'tasks', label: 'Tasks', icon: CheckCheck },
    { id: 'notes', label: 'Notes', icon: FileText },
    { id: 'ai', label: 'Pel AI', icon: Sparkles, fresh: true },
    { id: 'reminders', label: 'Reminders', icon: Bell },
    { id: 'prompts', label: 'Prompt saver', icon: Bookmark },
  ] },
  { title: 'CONNECTED', items: [
    { id: 'desktop', label: 'Desktop activity', icon: Monitor },
    { id: 'activity', label: 'Workspace activity', icon: Activity },
  ] },
];

function WorkspaceSearch({ onClose }: { onClose: () => void }) {
  const { data } = useWorkspace();
  const [q, setQ] = useState('');
  const results = data.items.filter((it) => ['task', 'note', 'conversation', 'prompt', 'reminder'].includes(it.kind) && `${it.title} ${it.body}`.toLowerCase().includes(q.toLowerCase())).slice(0, 12);
  const open = (kind: string, id: string) => {
    const target = kind === 'note' ? `/app/notes?note=${id}` : kind === 'task' ? `/app/tasks?task=${id}` : kind === 'conversation' ? `/app/ai?thread=${id}` : kind === 'prompt' ? '/app/prompts' : '/app/reminders';
    onClose(); navigate(target);
  };
  return <Modal title="A little shortcut to everything." onClose={onClose}><label className="ws-search-input" style={{ maxWidth: '100%', marginBottom: 13 }}><Search size={15} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks, notes, and conversations..." aria-label="Search workspace" /></label><div style={{ maxHeight: 370, overflow: 'auto' }}>{results.map((it) => <button className="ws-search-result" key={it.id} onClick={() => open(it.kind, it.id)}>{it.kind === 'task' ? <CheckCheck size={17} /> : it.kind === 'note' ? <FileText size={17} /> : <Sparkles size={17} />}<div><strong>{it.title}</strong><small>{it.kind} / {it.project}</small></div><ArrowUpRight size={13} style={{ marginLeft: 'auto' }} /></button>)}{!results.length && <Empty icon={Search} title="Nothing here, yet." body="Try a different word or phrase." />}</div></Modal>;
}

function WorkspaceShell() {
  const path = usePath();
  const page = path.split('?')[0].startsWith('/admin') ? 'admin' : path.split('?')[0].replace(/^\/app\/?/, '');
  const { data, loading, error, pending, online, realtime, refresh } = useWorkspace();
  const { user, preview, admin, logout } = useAccount();
  const { setTheme, toast } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [setup, setSetup] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const currentNav = NAV.flatMap((group) => group.items).find((it) => it.id === page);
  const titles: Record<string, string> = { admin: 'Admin overview', profile: 'My profile', settings: 'Preferences' };
  const title = currentNav?.label || titles[page] || 'Workspace';
  const totalTasks = data.items.filter((it) => it.kind === 'task' && it.status !== 'done').length;
  const requestedTask = new URLSearchParams(path.split('?')[1]).get('task');
  const badge = preview ? 'Local preview' : !online ? 'Offline' : pending.size ? 'Saving changes' : realtime ? 'Live sync' : 'Cloud workspace';

  useEffect(() => { setMobileOpen(false); setAccountOpen(false); scrollRef.current?.scrollTo(0, 0); document.title = `${title} / PebbleX`; }, [page, title]);
  useEffect(() => {
    if (!loading && requestedTask) {
      const item = data.items.find((it) => it.id === requestedTask && it.kind === 'task');
      if (item) setTaskDraft({ item });
    }
  }, [requestedTask, loading]);
  useEffect(() => {
    if (!preview && !loading && THEMES.some((t) => t.id === data.profile.theme)) setTheme(data.profile.theme);
  }, [data.profile.theme, loading, preview, setTheme]);

  useEffect(() => {
    const click = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setAccountOpen(false); };
    window.addEventListener('pointerdown', click); return () => window.removeEventListener('pointerdown', click);
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true); return; }
      if (!(event.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]') && !event.metaKey && !event.ctrlKey && event.key.toLowerCase() === 'n') setTaskDraft({});
      if (event.key === 'Escape') { setMobileOpen(false); setAccountOpen(false); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);

  const go = (id: string) => navigate(id === 'admin' ? '/admin' : `/app${id ? '/' + id : ''}`);
  const signOut = () => { void logout().then(() => navigate('/login')).catch((err) => toast({ kind: 'err', title: 'Still signed in', msg: friendlyError(err) })); };

  return <div className="workspace-app" onClickCapture={(e) => { if ((e.target as HTMLElement).closest('button,a')) sfx.tap(); }}>
    {mobileOpen && <button aria-label="Close navigation" className="ws-sidebar-scrim" onClick={() => setMobileOpen(false)} />}
    <aside className={`ws-sidebar ${mobileOpen ? 'is-open' : ''}`}>
      <button className="ws-brand" onClick={() => go('')}><BrandMark size={31} /><strong>PebbleX</strong><small>Web</small></button>
      <button className="ws-space-switch" onClick={() => go('profile')}><Avatar name={data.profile.name} color={data.profile.avatar_color} size={28} /><div><strong>Personal workspace</strong><small>{preview ? 'Make yourself at home' : data.profile.email}</small></div><ChevronDown size={13} /></button>
      <div style={{ overflowY: 'auto', minHeight: 0 }}>{NAV.map((group) => <nav className="ws-nav-group" key={group.title} aria-label={group.title}><div className="ws-nav-label">{group.title}</div>{group.items.map(({ id, label, icon: Icon, fresh }) => <button key={id} className={`ws-nav-item ${page === id ? 'is-active' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}><Icon size={16} strokeWidth={1.65} /><span>{label}</span>{id === 'tasks' && totalTasks > 0 ? <span className="ws-nav-count">{totalTasks}</span> : fresh && <span className="ws-nav-new">AI</span>}</button>)}</nav>)}<nav aria-label="Workspace preferences"><div className="ws-nav-label">YOUR SPACE</div><button className={`ws-nav-item ${page === 'settings' ? 'is-active' : ''}`} onClick={() => go('settings')}><Settings2 size={16} strokeWidth={1.65} />Preferences</button>{(admin || preview) && <button className={`ws-nav-item ${page === 'admin' ? 'is-active' : ''}`} onClick={() => go('admin')}><Shield size={16} strokeWidth={1.65} />Admin panel{preview && <span className="ws-nav-count">Preview</span>}</button>}</nav></div>
      <div className="ws-sidebar-bottom"><button className="ws-desktop-link" onClick={() => setSetup(true)}><Laptop size={22} strokeWidth={1.45} /><div><strong>Better, together.</strong><small>Connect your desktop</small></div><ArrowUpRight size={13} /></button><div ref={menuRef} style={{ position: 'relative' }}><button className="ws-user-button" onClick={() => setAccountOpen((v) => !v)} aria-expanded={accountOpen}><Avatar name={data.profile.name} color={data.profile.avatar_color} size={32} /><div><strong>{data.profile.name}</strong><small>{preview ? 'Preview account' : admin ? 'Administrator' : 'Personal account'}</small></div><ChevronDown size={13} /></button>{accountOpen && <div className="ws-account-menu"><button onClick={() => go('profile')}><UserRound size={14} />My profile</button><button onClick={() => go('settings')}><Palette size={14} />Appearance</button><button onClick={() => navigate('/')}><ArrowUpRight size={14} />PebbleX website</button><button onClick={signOut}><LogOut size={14} />{preview ? 'Leave preview' : 'Sign out'}</button></div>}</div></div>
    </aside>
    <div className="ws-shell-main"><header className="ws-topbar"><div className="ws-breadcrumb"><IconButton icon={Menu} label="Open navigation" className="ws-mobile-menu" onClick={() => setMobileOpen(true)} /><span>My workspace</span><ChevronRight size={12} /><strong>{title}</strong></div><div className="ws-top-actions"><button className="ws-top-search" onClick={() => setSearchOpen(true)} aria-label="Search workspace"><Search size={16} /><span>Search anything</span><kbd>Ctrl K</kbd></button><div className="ws-top-divider" /><span className="ws-sync-status"><i className={`ws-status-dot ${!online || pending.size ? 'pending' : ''}`} />{badge}</span><IconButton icon={Bell} label="Recent workspace activity" onClick={() => setNotificationsOpen(true)} /><button onClick={() => go('profile')} aria-label="Open my profile"><Avatar name={data.profile.name} color={data.profile.avatar_color} size={28} /></button></div></header>
      {preview && <div className="ws-preview-notice"><span><Leaf size={12} />You're in the local preview. Explore freely; changes stay in this browser.</span><button onClick={() => navigate('/login')}>Sign in<ArrowRight size={12} /></button></div>}
      {!preview && user && !user.emailVerified && <div className="ws-preview-notice"><span><Shield size={12} />Please verify your email to enable Pel AI. Check the verification message in your inbox.</span><button onClick={() => { void user.reload().then(() => user.getIdToken(true)).then(() => toast({ title: user.emailVerified ? 'Email verified' : 'Not verified yet', msg: user.emailVerified ? 'Your account is ready for Pel AI.' : 'Open the email verification link, then check again.' })).catch((err) => toast({ kind: 'err', title: 'Could not verify', msg: friendlyError(err) })); }}>I've verified it</button></div>}
      <div className="ws-scroll" ref={scrollRef} id="workspace-main"><main className="ws-content">{error && <div className="ws-error-banner" role="alert"><Cloud size={16} /><span>{error}</span><button className="ws-text-button" onClick={() => { void refresh(); }}>Retry</button><button className="ws-text-button" onClick={() => setSetup(true)}>Setup guide</button></div>}
        {loading ? <Loading /> : <>{page === '' && <Overview onEdit={setTaskDraft} />}{page === 'tasks' && <TasksPage onEdit={setTaskDraft} />}{page === 'notes' && <NotesPage />}{page === 'ai' && <AIPage />}{page === 'reminders' && <CollectionPage key="reminders" kind="reminder" />}{page === 'prompts' && <CollectionPage key="prompts" kind="prompt" />}{page === 'desktop' && <DesktopPage />}{page === 'activity' && <ActivityPage />}{page === 'profile' && <ProfilePage />}{page === 'settings' && <PreferencesPage />}{page === 'admin' && <AdminPage />}{!['', 'tasks', 'notes', 'ai', 'reminders', 'prompts', 'desktop', 'activity', 'profile', 'settings', 'admin'].includes(page) && <Empty icon={Search} title="A little off the path." body="This workspace page does not exist."><AppButton onClick={() => go('')}>Back to overview</AppButton></Empty>}</>}
      </main></div>
    </div>
    {taskDraft && <TaskEditor draft={taskDraft} onClose={() => { setTaskDraft(null); if (requestedTask) navigate('/app/tasks', true); }} />}{searchOpen && <WorkspaceSearch onClose={() => setSearchOpen(false)} />}{notificationsOpen && <Modal title="The latest little updates." description={preview ? 'Sample and local workspace activity.' : 'Your latest changes, across devices.'} onClose={() => setNotificationsOpen(false)}><ActivityList limit={8} /><AppButton variant="outline" style={{ width: '100%', marginTop: 15 }} onClick={() => { setNotificationsOpen(false); go('activity'); }}>All activity<ArrowRight size={14} /></AppButton></Modal>}{setup && <SetupGuide onClose={() => setSetup(false)} />}
  </div>;
}

function ProtectedWorkspace() {
  const fullPath = usePath();
  const path = fullPath.split('?')[0];
  const { ready, user, preview } = useAccount();
  const isAuth = path === '/login' || path === '/signup';
  useEffect(() => {
    if (ready && !user && !preview && !isAuth) navigate(`/login?next=${encodeURIComponent(fullPath)}`, true);
  }, [ready, user, preview, isAuth, fullPath]);
  if (!ready) return <div className="workspace-app" style={{ justifyContent: 'center' }}><Loading label="Opening your calm workspace" /></div>;
  if (isAuth || (!user && !preview)) return <AuthPage key={path} signup={path === '/signup'} />;
  return <WorkspaceDataProvider key={user?.uid || 'local-preview'}><WorkspaceShell /></WorkspaceDataProvider>;
}

export default function WorkspaceRoot() {
  return <AccountProvider><ProtectedWorkspace /></AccountProvider>;
}