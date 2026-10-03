import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowUp, Check, FileText, LoaderCircle, MessageSquare, Monitor, Pencil, Pin, Plus, Save, Search, Sparkles, Trash2 } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AppButton, Empty, IconButton, PageHeading, Time, downloadText } from './ui';
import { useWorkspace } from './DataContext';
import { useAccount } from './AuthContext';
import { friendlyError, requestPel } from './cloud';
import { navigate, usePath } from './navigation';
import type { WorkspaceItem } from './types';
import { useStore } from '../lib/store';

export function MarkdownBody({ text }: { text: string }) {
  return <div className="ws-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml>{text}</Markdown></div>;
}

function NoteEditor({ note }: { note: WorkspaceItem }) {
  const { updateItem, removeItem, pending } = useWorkspace();
  const { toast } = useStore();
  const cacheKey = `pebblex-note-draft:${note.owner_id}:${note.id}`;
  const restored = useRef<{ title: string; body: string; version: string } | null>(null);
  const loaded = useRef(false);
  if (!loaded.current) {
    loaded.current = true;
    try { restored.current = JSON.parse(sessionStorage.getItem(cacheKey) || 'null'); } catch { /* Ignore a damaged draft. */ }
  }
  const [title, setTitle] = useState(restored.current?.title ?? note.title);
  const [body, setBody] = useState(restored.current?.body ?? note.body);
  const [mode, setMode] = useState<'edit' | 'preview'>(!note.body || restored.current ? 'edit' : 'preview');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [baseline, setBaseline] = useState(note);
  const base = useRef(restored.current?.version || note.updated_at);
  const dirty = title !== baseline.title || body !== baseline.body;
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const busy = pending.has(note.id);

  useEffect(() => {
    if (!dirtyRef.current || (title === note.title && body === note.body)) {
      setBaseline(note); setTitle(note.title); setBody(note.body); base.current = note.updated_at;
    }
  }, [note.title, note.body, note.updated_at]);

  useEffect(() => {
    if (dirty) sessionStorage.setItem(cacheKey, JSON.stringify({ title, body, version: base.current }));
    else { sessionStorage.removeItem(cacheKey); base.current = note.updated_at; }
  }, [title, body, dirty, cacheKey, note.updated_at]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const save = async () => {
    if (busy || !title.trim()) return;
    setError('');
    try {
      const result = await updateItem(note.id, { title: title.trim(), body }, base.current);
      base.current = result.updated_at;
      setBaseline(result);
      setTitle(result.title);
      sessionStorage.removeItem(cacheKey);
      toast({ title: 'Note saved', msg: 'A thought worth keeping.' });
    } catch (err) { setError(friendlyError(err)); }
  };
  const saveRef = useRef(save); saveRef.current = save;
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveRef.current(); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);

  return <div className="ws-note-editor">
    <div className="ws-editor-toolbar"><div className="ws-segment"><button className={mode === 'edit' ? 'is-on' : ''} onClick={() => setMode('edit')}><Pencil size={12} />Edit</button><button className={mode === 'preview' ? 'is-on' : ''} onClick={() => setMode('preview')}>Preview</button></div><span className="ws-saved" style={{ marginLeft: 'auto' }}>{busy ? <LoaderCircle size={11} className="ws-spin" /> : !dirty && <Check size={11} />}{busy ? 'Saving' : dirty ? 'Unsaved draft' : 'Saved'}</span><IconButton icon={Pin} label={note.pinned ? 'Unpin note' : 'Pin note'} style={{ color: note.pinned ? 'var(--green-deep)' : undefined }} onClick={() => { void updateItem(note.id, { pinned: !note.pinned }).then((result) => { base.current = result.updated_at; }).catch(() => {}); }} disabled={busy || dirty} /><IconButton icon={ArrowDownToLine} label="Export as Markdown" onClick={() => downloadText(`${title.replace(/[^a-z0-9 -]/gi, '').trim() || 'note'}.md`, body, 'text/markdown')} /><IconButton icon={Trash2} label={confirmDelete ? 'Click again to delete note' : 'Delete note'} style={{ color: confirmDelete ? 'var(--red)' : undefined }} disabled={busy} onClick={() => { if (!confirmDelete) { setConfirmDelete(true); return; } void removeItem(note.id).then(() => sessionStorage.removeItem(cacheKey)).catch(() => {}); }} /></div>
    {confirmDelete && <div className="ws-form-error" style={{ margin: '12px 20px 0' }}>Click the delete icon again to remove this note. <button style={{ textDecoration: 'underline' }} onClick={() => setConfirmDelete(false)}>Cancel</button></div>}
    <div className="ws-editor-content"><input className="ws-note-title-input" aria-label="Note title" value={title} maxLength={180} onChange={(e) => setTitle(e.target.value)} placeholder="Give this thought a name" />{mode === 'edit' ? <textarea className="ws-note-body-input" value={body} onChange={(e) => setBody(e.target.value)} maxLength={100000} placeholder="A blank page. A little possibility.\n\nStart writing in Markdown..." aria-label="Markdown note body" /> : <MarkdownBody text={body || '*A little room for your first thought.*'} />}</div>
    {error && <div className="ws-form-error" style={{ margin: '0 23px 12px' }}>{error}<div style={{ display: 'flex', gap: 8, marginTop: 9 }}><button style={{ textDecoration: 'underline' }} onClick={() => downloadText('my-note-draft.md', `# ${title}\n\n${body}`, 'text/markdown')}>Export your draft</button><button style={{ textDecoration: 'underline' }} onClick={() => { setBaseline(note); setTitle(note.title); setBody(note.body); base.current = note.updated_at; setError(''); }}>Use latest version</button></div></div>}
    <div className="ws-editor-toolbar" style={{ borderBottom: 0, borderTop: '1px solid var(--line)', justifyContent: 'space-between' }}><span className="ws-saved">{body.trim() ? body.trim().split(/\s+/).length : 0} words / {dirty ? 'Draft kept in this tab' : note.origin === 'desktop' ? 'Last edited on desktop' : 'Last edited on web'}</span><AppButton icon={Save} onClick={() => { void save(); }} disabled={busy || !dirty || !title.trim()}>Save changes</AppButton></div>
  </div>;
}

export function NotesPage() {
  const { data, createItem, pending } = useWorkspace();
  const [query, setQuery] = useState('');
  const path = usePath();
  const selectedId = new URLSearchParams(path.split('?')[1]).get('note');
  const notes = data.items.filter((it) => it.kind === 'note' && `${it.title} ${it.body}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
  const selected = notes.find((it) => it.id === selectedId) || notes[0];
  const create = () => { void createItem('note', { title: 'Untitled thought', body: '', project: 'Personal' }).then((note) => navigate(`/app/notes?note=${note.id}`)).catch(() => {}); };
  return <div className="ws-page"><PageHeading eyebrow="THINK IT. WRITE IT. KEEP IT." title="Notes" description="A home for ideas, big and beautifully small."><AppButton icon={Plus} onClick={create} disabled={pending.has('new-item')}>New note</AppButton></PageHeading><div className="ws-toolbar"><label className="ws-search-input"><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a thought..." aria-label="Search notes" /></label><span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{notes.length} notes in your space</span></div>
    <div className="ws-notes-layout"><aside className="ws-notes-list"><div className="ws-nav-label">YOUR NOTES</div>{notes.map((note) => <button key={note.id} className={`ws-note-select ${selected?.id === note.id ? 'is-active' : ''}`} onClick={() => navigate(`/app/notes?note=${note.id}`)}><strong>{note.title}</strong><p>{note.body.replace(/[#>*\[\]-]/g, '').trim() || 'A little possibility...'}</p><small><span>{note.origin === 'desktop' ? <Monitor size={10} /> : note.project}</span><Time value={note.updated_at} /></small></button>)}</aside>{selected ? <NoteEditor key={selected.id} note={selected} /> : <Empty icon={FileText} title="Give an idea somewhere to live." body={query ? 'No notes match your search.' : 'Your notes will appear here, on the web and your desktop.'}><AppButton icon={Plus} variant="soft" onClick={create}>Write your first note</AppButton></Empty>}</div>
  </div>;
}

function localAnswer(prompt: string, items: WorkspaceItem[]) {
  const tasks = items.filter((it) => it.kind === 'task' && it.status !== 'done');
  const notes = items.filter((it) => it.kind === 'note');
  if (/note|written|writing/i.test(prompt)) return `Here's what is in your notes:\n\n${notes.map((it) => `- **${it.title}**: ${it.body.replace(/[#>*\[\]-]/g, '').trim().slice(0, 135)}...`).join('\n\n') || 'You have not added any notes yet.'}\n\n*A local preview summary, not a generated AI response.*`;
  if (/focus|priorit|first|next/i.test(prompt)) {
    const focus = tasks.find((it) => it.priority === 'high') || tasks[0];
    return focus ? `Start with **${focus.title}**.\n\nIt is in **${focus.project}**, with ${focus.priority} priority. Give it a small, clear next step before moving on.\n\nYou have ${tasks.length} open tasks. You do not need to finish all of them at once.\n\n*This suggestion uses your local task data. Live AI is available after cloud setup.*` : 'Your task list is clear. A good time to step back and decide what matters next.\n\n*Local preview, not a generated AI response.*';
  }
  return `A little overview of your workspace:\n\n**${tasks.length} open tasks**\n\n${tasks.slice(0, 7).map((it) => `- ${it.title} (${it.project})`).join('\n') || 'No open tasks.'}\n\n**${notes.length} notes** to come back to.\n\n*This is a local, data-based summary. Connect the Pel AI cloud function for open-ended conversations.*`;
}

export function AIPage() {
  const { data, createItem } = useWorkspace();
  const { preview } = useAccount();
  const path = usePath();
  const requestedThread = new URLSearchParams(path.split('?')[1]).get('thread');
  const [query, setQuery] = useState('');
  const [thread, setThread] = useState<string | null>(requestedThread);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [includeContext, setIncludeContext] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const conversations = data.items.filter((it) => it.kind === 'conversation').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const messages = data.items.filter((it) => it.kind === 'message' && it.extra.conversation_id === thread).sort((a, b) => a.created_at.localeCompare(b.created_at));
  useEffect(() => { setThread(requestedThread); }, [requestedThread]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [messages.length, busy]);

  const send = async (text: string) => {
    if (busy || !text.trim()) return;
    setBusy(true); setError(''); setQuery('');
    try {
      let id = thread;
      if (!id) { const created = await createItem('conversation', { title: text.trim().slice(0, 70) }); id = created.id; setThread(id); navigate(`/app/ai?thread=${id}`, true); }
      await createItem('message', { title: 'You', body: text.trim(), extra: { conversation_id: id, role: 'user' } });
      const context = includeContext ? data.items.filter((it) => it.kind === 'task' || it.kind === 'note').slice(0, 30).map((it) => `${it.kind}: ${it.title}\n${it.kind === 'note' ? it.body.slice(0, 1000) : `Status: ${it.status}, Priority: ${it.priority}`}`).join('\n\n').slice(0, 16000) : '';
      const answer = preview ? localAnswer(text, data.items) : await requestPel(text.trim(), context);
      await createItem('message', { title: 'Pel', body: answer, extra: { conversation_id: id, role: 'assistant', mode: preview ? 'local' : 'cloud' } });
    } catch (err) { setError(friendlyError(err)); setQuery(text); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void send(query); };

  return <div className="ws-page"><PageHeading eyebrow="A QUIET SECOND OPINION" title="Pel AI" description="A place to untangle an idea, or find your next small step." />
    <div className="ws-chat-layout"><aside className="ws-chat-list"><AppButton icon={Plus} variant="outline" disabled={busy} onClick={() => { setThread(null); setError(''); navigate('/app/ai'); }}>New conversation</AppButton><div className="ws-nav-label">YOUR CONVERSATIONS</div>{conversations.map((it) => <button disabled={busy} className={`ws-note-select ${thread === it.id ? 'is-active' : ''}`} key={it.id} onClick={() => { setThread(it.id); setError(''); navigate(`/app/ai?thread=${it.id}`); }}><strong>{it.title}</strong><p><Time value={it.created_at} /></p></button>)}</aside><div className="ws-chat-main">{!messages.length && !busy ? <div className="ws-chat-welcome"><div className="ws-pel-orb"><Sparkles size={29} strokeWidth={1.4} /></div><h2>A little clarity starts here.</h2><p>{preview ? 'Try a local summary of your sample workspace.' : 'What has been on your mind?'}</p><div className="ws-chat-suggestions">{[['Summarize my open tasks', Check], ['What should I focus on next?', Sparkles], ['What have I written recently?', FileText]].map(([text, Icon]) => { const Glyph = Icon as typeof Check; return <button key={String(text)} onClick={() => { void send(String(text)); }}><Glyph size={14} />{String(text)}</button>; })}</div></div> : <div className="ws-chat-messages" aria-live="polite">{messages.map((message) => <div key={message.id} className={`ws-message ${message.extra.role === 'user' ? 'is-user' : ''}`}>{message.extra.role === 'user' ? message.body : <MarkdownBody text={message.body} />}</div>)}{busy && <div className="ws-message" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-3)' }}><LoaderCircle size={13} className="ws-spin" />A moment to think...</div>}<div ref={endRef} /></div>}
      <form className="ws-chat-composer" onSubmit={submit}>{error && <div className="ws-form-error" role="alert">{error} Your message is saved; try again when ready.</div>}<div className="ws-composer-well"><textarea value={query} onChange={(e) => setQuery(e.target.value)} maxLength={4000} placeholder="Ask Pel anything..." aria-label="Message Pel" disabled={busy} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(query); } }} /><AppButton type="submit" disabled={busy || !query.trim()} aria-label="Send message"><ArrowUp size={16} /></AppButton></div><div className="ws-chat-disclaimer">{preview ? <><MessageSquare size={10} />Local preview responses. Not connected to an AI model.</> : <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}><input type="checkbox" checked={includeContext} onChange={(e) => setIncludeContext(e.target.checked)} />Share task and note context with Pel for this request</label>}</div></form>
    </div></div>
  </div>;
}