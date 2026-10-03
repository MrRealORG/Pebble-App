import { useState, type FormEvent } from 'react';
import { CalendarDays, CheckCheck, Columns3, List, LoaderCircle, Monitor, MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react';
import { useWorkspace } from './DataContext';
import { AppButton, CheckButton, Empty, IconButton, Modal, PageHeading, Tag } from './ui';
import { dateKey, type TaskStatus, type WorkspaceItem } from './types';
import { useStore } from '../lib/store';
import { friendlyError } from './cloud';

export type TaskDraft = { item?: WorkspaceItem; status?: TaskStatus };
export const STATUS_LABELS: Record<TaskStatus, string> = { todo: 'To do', doing: 'In progress', done: 'Done' };

export function TaskEditor({ draft, onClose }: { draft: TaskDraft; onClose: () => void }) {
  const { createItem, updateItem, removeItem } = useWorkspace();
  const { toast } = useStore();
  const original = draft.item;
  const [title, setTitle] = useState(original?.title || '');
  const [body, setBody] = useState(original?.body || '');
  const [status, setStatus] = useState<TaskStatus>(original?.status || draft.status || 'todo');
  const [priority, setPriority] = useState<WorkspaceItem['priority']>(original?.priority || 'medium');
  const [project, setProject] = useState(original?.project || 'Personal');
  const [due, setDue] = useState(original?.due_date || dateKey());
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!title.trim()) return;
    setBusy(true); setError('');
    try {
      const patch = { title: title.trim(), body, status, priority, project: project.trim() || 'Personal', due_date: due || null };
      if (original) await updateItem(original.id, patch, original.updated_at);
      else await createItem('task', patch);
      toast({ title: original ? 'Task updated' : 'A little more clarity', msg: original ? undefined : 'Your new task is ready.' });
      onClose();
    } catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  };

  return <Modal title={original ? 'A little attention to detail.' : 'One thing at a time.'} description={original ? 'Update this task in your workspace.' : 'Give your next step a little space.'} onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={(event) => { void submit(event); }}>
      <fieldset disabled={busy} style={{ display: 'contents' }}>
      <label className="ws-field">Task name<input className="ws-input" autoFocus required maxLength={180} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What would you like to work on?" /></label>
      <label className="ws-field">A few details <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>(optional)</span><textarea className="ws-input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="A little context for your future self..." maxLength={10000} /></label>
      <div className="ws-field-row"><label className="ws-field">Status<select className="ws-input" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>{Object.entries(STATUS_LABELS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label className="ws-field">Priority<select className="ws-input" value={priority} onChange={(e) => setPriority(e.target.value as WorkspaceItem['priority'])}><option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option></select></label></div>
      <div className="ws-field-row"><label className="ws-field">Due date<input type="date" className="ws-input" value={due} onChange={(e) => setDue(e.target.value)} /></label><label className="ws-field">Project<input className="ws-input" value={project} maxLength={60} onChange={(e) => setProject(e.target.value)} /></label></div>
      {error && <div className="ws-form-error" role="alert">{error}</div>}
      <div className="ws-modal-actions">
        {original && <AppButton type="button" variant="danger" icon={Trash2} disabled={busy} style={{ marginRight: 'auto' }} onClick={() => { if (!deleting) { setDeleting(true); return; } setBusy(true); void removeItem(original.id).then(onClose).catch((err) => { setError(friendlyError(err)); setBusy(false); }); }}>{deleting ? 'Confirm delete' : 'Delete'}</AppButton>}
        <AppButton type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</AppButton><AppButton type="submit" disabled={busy}>{busy ? <LoaderCircle size={14} className="ws-spin" /> : original ? 'Save changes' : 'Create task'}</AppButton>
      </div>
      </fieldset>
    </form>
  </Modal>;
}

export function TaskRow({ task, onEdit }: { task: WorkspaceItem; onEdit: () => void }) {
  const { updateItem, pending } = useWorkspace();
  return <div className={`ws-task-row ${task.status === 'done' ? 'is-done' : ''}`}>
    <CheckButton checked={task.status === 'done'} disabled={pending.has(task.id)} label={`Mark ${task.title} ${task.status === 'done' ? 'incomplete' : 'complete'}`} onChange={() => { void updateItem(task.id, { status: task.status === 'done' ? 'todo' : 'done' }).catch(() => {}); }} />
    <button className="ws-task-title" onClick={onEdit}><strong>{task.title}</strong><small>{task.origin === 'desktop' && <Monitor size={10} />}{task.project}{task.due_date && <> / {task.due_date === dateKey() ? 'Today' : new Date(`${task.due_date}T12:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</>}</small></button>
    <Tag color={task.priority === 'high' ? 'orange' : task.priority === 'medium' ? 'purple' : 'neutral'}>{task.priority}</Tag><IconButton label="Edit task" icon={MoreHorizontal} onClick={onEdit} />
  </div>;
}

export function TasksPage({ onEdit }: { onEdit: (draft: TaskDraft) => void }) {
  const { data, updateItem, pending } = useWorkspace();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const tasks = data.items.filter((it) => it.kind === 'task' && (filter === 'all' || it.status === filter) && `${it.title} ${it.project}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="ws-page"><PageHeading eyebrow="A LITTLE PROGRESS, EVERY DAY" title="Tasks" description="Make a plan. Move it forward. Leave room to breathe."><AppButton icon={Plus} onClick={() => onEdit({})}>New task</AppButton></PageHeading>
    <div className="ws-toolbar"><label className="ws-search-input"><Search size={14} /><input placeholder="Find a task..." aria-label="Search tasks" value={query} onChange={(e) => setQuery(e.target.value)} /></label><select className="ws-select" aria-label="Filter task status" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All tasks</option>{Object.entries(STATUS_LABELS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select><div className="ws-segment" style={{ marginLeft: 'auto' }}><button className={view === 'board' ? 'is-on' : ''} onClick={() => setView('board')}><Columns3 size={13} />Board</button><button className={view === 'list' ? 'is-on' : ''} onClick={() => setView('list')}><List size={13} />List</button></div></div>
    {view === 'list' ? <div className="ws-panel">{tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} onEdit={() => onEdit({ item: task })} />) : <Empty icon={CheckCheck} title="Nothing on this list." body="Try another search, or add the next small thing." />}</div> : <div className="ws-kanban">{(Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => <div key={status} className={`ws-kanban-col ${dragOver === status ? 'is-dragover' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragOver(status); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null); }} onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData('text/plain'); if (data.items.some((it) => it.id === id && it.kind === 'task')) void updateItem(id, { status }).catch(() => {}); }}><h2 className="ws-kanban-title"><i className="ws-status-dot" style={{ background: status === 'doing' ? 'var(--orange)' : status === 'done' ? 'var(--green-deep)' : 'var(--ink-3)' }} />{STATUS_LABELS[status]}<span>{tasks.filter((it) => it.status === status).length}</span><IconButton label={`Add to ${STATUS_LABELS[status]}`} icon={Plus} onClick={() => onEdit({ status })} style={{ marginLeft: 'auto', height: 24 }} /></h2>
      {tasks.filter((task) => task.status === status).map((task) => <article key={task.id} className="ws-kanban-card" draggable={!pending.has(task.id)} onDragStart={(e) => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; }}><div className="ws-kanban-meta"><Tag color={task.project === 'Design' ? 'purple' : task.project === 'Personal' ? 'green' : 'neutral'}>{task.project}</Tag><IconButton label="Edit task" icon={MoreHorizontal} onClick={() => onEdit({ item: task })} /></div><button style={{ textAlign: 'left', width: '100%' }} onClick={() => onEdit({ item: task })}><h3 style={{ textDecoration: status === 'done' ? 'line-through' : undefined }}>{task.title}</h3></button><div className="ws-kanban-meta"><span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CalendarDays size={11} />{task.due_date === dateKey() ? 'Today' : task.due_date ? new Date(`${task.due_date}T12:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : 'No due date'}</span><select aria-label={`Status for ${task.title}`} value={task.status} disabled={pending.has(task.id)} onChange={(e) => { void updateItem(task.id, { status: e.target.value as TaskStatus }).catch(() => {}); }}>{Object.entries(STATUS_LABELS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></div></article>)}
      <button className="ws-mini-add" onClick={() => onEdit({ status })}><Plus size={14} />Add a task</button>
    </div>)}</div>}
  </div>;
}