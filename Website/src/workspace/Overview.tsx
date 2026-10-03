import { Activity, ArrowUpRight, CheckCheck, FileText, Leaf, Laptop, Monitor, Pin, Plus, Sparkles } from 'lucide-react';
import { AppButton, Empty, PageHeading, SectionHeading, Tag, Time } from './ui';
import { useWorkspace } from './DataContext';
import { useAccount } from './AuthContext';
import { dateKey, minutesLabel, type Usage } from './types';
import { navigate } from './navigation';
import { TaskRow, type TaskDraft } from './Tasks';

export function AppUsageList({ usage, limit = 5 }: { usage: Usage[]; limit?: number }) {
  const apps = Object.values(usage.reduce<Record<string, { name: string; minutes: number; color: string }>>((all, entry) => {
    all[entry.app_name] ||= { name: entry.app_name, minutes: 0, color: entry.color };
    all[entry.app_name].minutes += entry.minutes;
    return all;
  }, {})).sort((a, b) => b.minutes - a.minutes).slice(0, limit);
  const max = Math.max(...apps.map((it) => it.minutes), 1);
  return <>{apps.map((app) => <div key={app.name} className="ws-usage-row"><span className="ws-app-icon" style={{ background: `${app.color}1c`, color: app.color }}>{app.name === 'Visual Studio Code' ? '<>' : app.name === 'PebbleX' ? <Leaf size={15} /> : app.name[0]}</span><div className="ws-usage-detail"><div className="ws-usage-label"><span>{app.name}</span><span>{minutesLabel(app.minutes)}</span></div><div className="ws-meter"><i style={{ width: `${Math.max(3, app.minutes / max * 100)}%`, background: app.color }} /></div></div></div>)}</>;
}

export function Overview({ onEdit }: { onEdit: (draft: TaskDraft) => void }) {
  const { data, lastSync } = useWorkspace();
  const { preview } = useAccount();
  const tasks = data.items.filter((it) => it.kind === 'task');
  const done = tasks.filter((it) => it.status === 'done');
  const today = dateKey();
  const todays = tasks.filter((it) => it.due_date === today && it.status !== 'done').slice(0, 4);
  const visibleTasks = todays.length ? todays : tasks.filter((it) => it.status !== 'done').slice(0, 4);
  const notes = data.items.filter((it) => it.kind === 'note').sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
  const usage = data.usage.filter((it) => it.day === today);
  const appCount = new Set(usage.map((it) => it.app_name)).size;
  const totalMinutes = usage.reduce((sum, it) => sum + it.minutes, 0);
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const date = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  const stats = [
    { icon: CheckCheck, label: 'Tasks completed', value: done.length, suffix: `/ ${tasks.length}`, hint: `${tasks.length - done.length} little steps ahead` },
    { icon: FileText, label: 'Notes in your space', value: notes.length.toString().padStart(2, '0'), suffix: 'notes', hint: 'Ideas worth coming back to' },
    { icon: Monitor, label: 'Desktop activity', value: totalMinutes ? minutesLabel(totalMinutes) : '--', suffix: '', hint: preview ? 'Sample activity for today' : 'Reported by your desktop' },
    { icon: Laptop, label: 'Connected devices', value: data.devices.length.toString().padStart(2, '0'), suffix: 'devices', hint: preview ? 'Preview devices' : lastSync ? 'Your workspace is up to date' : 'Connect a desktop to begin' },
  ];

  return <div className="ws-page"><PageHeading eyebrow={date} title={`${greeting}, ${data.profile.name.split(' ')[0]}.`} description="Pick up where you left off. Everything is right here."><AppButton icon={Plus} onClick={() => onEdit({})}>New task</AppButton></PageHeading>
    <section className="ws-landscape" aria-label="A calm start to your day"><img src="/images/workspace-landscape.jpg" alt="Soft green hills and a quiet cypress tree" /><div className="ws-landscape-copy"><div className="ws-eyebrow">A LITTLE ROOM TO BREATHE</div><h2>Less noise.<br />More room for you.</h2><p>One thing at a time is a good place to start.</p></div><span className="ws-landscape-note">Your space, at your pace.</span></section>
    <div className="ws-stats">{stats.map(({ icon: Icon, label, value, suffix, hint }) => <div className="ws-stat" key={label}><div className="ws-stat-label"><Icon size={13} strokeWidth={1.65} />{label}</div><div className="ws-stat-value"><strong>{value}</strong><small>{suffix}</small></div><div className="ws-stat-hint">{hint}</div></div>)}</div>
    <div className="ws-dashboard-grid">
      <section><SectionHeading title="Today, made simple" sub={`${visibleTasks.length} things to give a little attention`} action="All tasks" onAction={() => navigate('/app/tasks')} /><div className="ws-panel">{visibleTasks.length ? visibleTasks.map((task) => <TaskRow key={task.id} task={task} onEdit={() => onEdit({ item: task })} />) : <Empty icon={CheckCheck} title="A little breathing room." body="Your list is clear. Add a small step when you are ready." />}<button className="ws-panel-footer" style={{ width: '100%' }} onClick={() => onEdit({})}><Plus size={13} />Add something to your day</button></div></section>
      <section><SectionHeading title="Your desktop, at a glance" sub={preview ? 'Sample activity / Today' : 'Shared activity / Today'} action="View activity" onAction={() => navigate('/app/desktop')} /><div className="ws-panel"><div className="ws-panel-padding" style={{ paddingTop: 4, paddingBottom: 7 }}>{usage.length ? <AppUsageList usage={usage} limit={4} /> : <Empty icon={Monitor} title="Your desktop belongs here, too." body="Sign into the same account on desktop and enable activity sharing." />}</div><div className="ws-panel-footer"><Activity size={11} />{appCount ? `${appCount} apps used today` : 'No app usage received'}<span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 5, alignItems: 'center' }}><i className="ws-status-dot" />{preview ? 'Sample data' : 'Read only'}</span></div></div></section>
    </div>
    <section className="ws-recent-notes"><SectionHeading title="A few things on your mind" sub="Your recent notes, wherever you wrote them" action="All notes" onAction={() => navigate('/app/notes')} />{notes.length ? <div className="ws-note-grid">{notes.slice(0, 3).map((note) => <button className="ws-note-preview" key={note.id} onClick={() => navigate(`/app/notes?note=${note.id}`)}><div className="ws-note-preview-head"><FileText size={18} strokeWidth={1.5} />{note.pinned ? <Pin size={12} /> : <ArrowUpRight size={13} />}</div><h3>{note.title}</h3><p>{note.body.replace(/[#>*\[\]-]/g, '').trim()}</p><footer><Tag color={note.project === 'Personal' ? 'green' : 'neutral'}>{note.project}</Tag><Time value={note.updated_at} /></footer></button>)}</div> : <div className="ws-panel"><Empty icon={FileText} title="Every idea starts somewhere." body="Create your first note and make a little space for it."><AppButton variant="soft" icon={Plus} onClick={() => navigate('/app/notes')}>Write a note</AppButton></Empty></div>}</section>
    <div className="ws-footer-line"><span><Leaf size={11} />One calm workspace. A little more you.</span><span><Sparkles size={11} />{preview ? 'Local preview / changes stay in this browser' : lastSync ? `Last checked ${new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Waiting for your first sync'}</span></div>
  </div>;
}