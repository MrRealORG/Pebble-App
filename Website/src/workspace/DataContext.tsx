import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAccount } from './AuthContext';
import { firebaseAuth, friendlyError, provisionAccount, supabase } from './cloud';
import { makeItem, PREVIEW_ID, seedWorkspace } from './seed';
import type { Activity, Device, ItemKind, Profile, Usage, WorkspaceData, WorkspaceItem } from './types';
import { useStore } from '../lib/store';

const PREVIEW_KEY = 'pebblex-workspace-preview-v1';
type DataContext = {
  data: WorkspaceData;
  loading: boolean;
  error: string | null;
  online: boolean;
  realtime: boolean;
  lastSync: string | null;
  pending: Set<string>;
  refresh: () => Promise<void>;
  createItem: (kind: ItemKind, patch: Partial<WorkspaceItem>) => Promise<WorkspaceItem>;
  updateItem: (id: string, patch: Partial<WorkspaceItem>, version?: string) => Promise<WorkspaceItem>;
  removeItem: (id: string) => Promise<void>;
  saveProfile: (patch: Partial<Profile>) => Promise<void>;
  resetPreview: () => void;
};
const Context = createContext<DataContext | null>(null);

async function fetchOwnedRows<T>(table: 'workspace_items' | 'app_usage', uid: string, since?: string): Promise<{ data: T[]; error: null }> {
  const rows: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    let request = supabase!.from(table).select('*').eq('owner_id', uid).order('id').limit(500);
    if (cursor) request = request.gt('id', cursor);
    if (table === 'workspace_items') request = request.is('deleted_at', null);
    if (since) request = request.gte('day', since);
    const result = await request;
    if (result.error) throw result.error;
    rows.push(...result.data as T[]);
    if (result.data.length < 500) break;
    cursor = result.data[result.data.length - 1].id;
  }
  return { data: rows, error: null };
}

function readPreview() {
  try {
    const stored = JSON.parse(localStorage.getItem(PREVIEW_KEY) || 'null');
    if (stored?.profile?.id === PREVIEW_ID && ['items', 'activity', 'devices', 'usage'].every((key) => Array.isArray(stored[key]))) return stored as WorkspaceData;
  } catch { /* A damaged preview cache can safely be replaced. */ }
  return seedWorkspace();
}

function emptyData(uid: string, name: string, email: string): WorkspaceData {
  return {
    items: [], devices: [], activity: [], usage: [],
    profile: { id: uid, name, email, bio: '', avatar_color: '#b7cba4', theme: 'elera', usage_consent: false, created_at: new Date().toISOString(), last_seen: new Date().toISOString() },
  };
}

export function WorkspaceDataProvider({ children }: { children: ReactNode }) {
  const { user, preview } = useAccount();
  const { toast } = useStore();
  const uid = preview ? PREVIEW_ID : user!.uid;
  const [data, setData] = useState<WorkspaceData>(() => preview ? readPreview() : emptyData(uid, user?.displayName || 'Your workspace', user?.email || ''));
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [realtime, setRealtime] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const dataRef = useRef(data);
  const mounted = useRef(true);
  const fetching = useRef(false);
  const writeLocks = useRef(new Set<string>());
  const mutationRevision = useRef(0);
  dataRef.current = data;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const commit = useCallback((next: WorkspaceData | ((old: WorkspaceData) => WorkspaceData)) => {
    if (!mounted.current) return;
    const value = typeof next === 'function' ? next(dataRef.current) : next;
    if (preview) localStorage.setItem(PREVIEW_KEY, JSON.stringify(value));
    dataRef.current = value;
    setData(value);
  }, [preview]);

  const refresh = useCallback(async () => {
    if (preview) {
      try { commit(readPreview()); setError(null); }
      catch { setError('Browser storage is unavailable. Enable site storage to save preview changes.'); }
      return;
    }
    if (!supabase || fetching.current) return;
    fetching.current = true;
    const startedRevision = mutationRevision.current;
    try {
      if (hasFirebase && firebaseAuth?.currentUser) {
        try {
          const claims = await firebaseAuth.currentUser.getIdTokenResult();
          if (claims.claims.role !== 'authenticated') await provisionAccount();
        } catch {}
      }
      const since = new Date(); since.setDate(since.getDate() - 30);
      const results = await Promise.allSettled([
        fetchOwnedRows<WorkspaceItem>('workspace_items', uid),
        supabase.from('profiles').select('*').eq('id', uid).single(),
        supabase.from('devices').select('*').eq('owner_id', uid).order('last_seen', { ascending: false }),
        fetchOwnedRows<Usage>('app_usage', uid, since.toISOString().slice(0, 10)),
        supabase.from('activity_events').select('*').eq('owner_id', uid).order('created_at', { ascending: false }).limit(100),
      ]);
      if (!mounted.current) return;
      const items = results[0].status === 'fulfilled' ? results[0].value.data : [];
      const profileData = results[1].status === 'fulfilled' && !results[1].value.error ? results[1].value.data : null;
      const devices = results[2].status === 'fulfilled' && !results[2].value.error ? (results[2].value.data ?? []) : [];
      const usage = results[3].status === 'fulfilled' ? results[3].value.data : [];
      const activity = results[4].status === 'fulfilled' && !results[4].value.error ? (results[4].value.data ?? []) : [];

      const profile: Profile = (profileData as Profile) || {
        id: uid,
        name: user?.displayName || 'Your workspace',
        email: user?.email || '',
        bio: '',
        avatar_color: '#b7cba4',
        theme: 'elera',
        usage_consent: false,
        created_at: new Date().toISOString(),
        last_seen: new Date().toISOString()
      };

      // A snapshot started before a write must not replace that newer local result.
      const mutatedDuringRead = startedRevision !== mutationRevision.current || writeLocks.current.size > 0;
      commit({
        items: mutatedDuringRead ? dataRef.current.items : items.sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
        profile: mutatedDuringRead ? dataRef.current.profile : profile,
        devices: mutatedDuringRead ? dataRef.current.devices : (devices as Device[]),
        usage: mutatedDuringRead ? dataRef.current.usage : usage,
        activity: mutatedDuringRead ? dataRef.current.activity : (activity as Activity[])
      });
      setLastSync(new Date().toISOString());
      setError(null);
    } catch (err) {
      if (mounted.current) setError(friendlyError(err));
    } finally {
      fetching.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [uid, preview, commit]);

  useEffect(() => {
    void refresh();
    const onOnline = () => { setOnline(true); void refresh(); };
    const onOffline = () => { setOnline(false); setRealtime(false); };
    const onStorage = (event: StorageEvent) => { if (preview && event.key === PREVIEW_KEY) commit(readPreview()); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('storage', onStorage);
    // Polling also recovers changes missed while a realtime connection was suspended.
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 45000);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh, commit, preview]);

  useEffect(() => {
    if (preview || !supabase || loading || error) return;
    const client = supabase;
    const channel = client.channel(`workspace:${uid}`);
    let debounce: ReturnType<typeof setTimeout>;
    let stopped = false;
    for (const table of ['workspace_items', 'devices', 'app_usage', 'activity_events', 'profiles']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `${table === 'profiles' ? 'id' : 'owner_id'}=eq.${uid}` }, () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => { void refresh(); }, 300);
      });
    }
    void client.realtime.setAuth().then(() => {
      if (!stopped) channel.subscribe((status) => {
        if (!stopped) setRealtime(status === 'SUBSCRIBED');
      });
    }).catch(() => { if (!stopped) setRealtime(false); });
    return () => { stopped = true; clearTimeout(debounce); void client.removeChannel(channel); };
  }, [uid, preview, refresh, loading, error]);

  useEffect(() => {
    if (preview || !supabase || loading || error) return;
    const client = supabase;
    const key = `pebblex-browser-device:${uid}`;
    let id = localStorage.getItem(key);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
    const beat = async () => {
      if (!navigator.onLine || document.visibilityState !== 'visible') return;
      const result = await client.from('devices').upsert({ id, owner_id: uid, name: 'Web browser', platform: 'Web', kind: 'web', app_version: '0.1.0', last_seen: new Date().toISOString() });
      if (result.error && mounted.current) setError(friendlyError(result.error));
    };
    void beat();
    const timer = setInterval(() => { void beat(); }, 60000);
    return () => clearInterval(timer);
  }, [uid, preview, loading, error]);

  const mutation = async <T,>(key: string, operation: () => Promise<T>): Promise<T> => {
    if (writeLocks.current.has(key)) throw new Error('This item is already saving.');
    if (!preview && !navigator.onLine) {
      const message = 'You are offline. Your draft stays open; reconnect before saving.';
      toast({ kind: 'err', title: 'Not saved', msg: message });
      throw new Error(message);
    }
    writeLocks.current.add(key);
    mutationRevision.current++;
    setPending(new Set(writeLocks.current));
    try { return await operation(); }
    catch (err) { toast({ kind: 'err', title: 'Could not save', msg: friendlyError(err) }); throw err; }
    finally { writeLocks.current.delete(key); mutationRevision.current++; if (mounted.current) setPending(new Set(writeLocks.current)); }
  };

  const previewEvent = (action: string, item: WorkspaceItem) => {
    const event: Activity = { id: crypto.randomUUID(), owner_id: uid, action, kind: item.kind, origin: 'web', created_at: new Date().toISOString() };
    return [event, ...dataRef.current.activity].slice(0, 100);
  };

  const createItem = (kind: ItemKind, patch: Partial<WorkspaceItem>) => mutation('new-item', async () => {
    let item = makeItem(kind, uid, { ...patch, kind, owner_id: uid, origin: 'web' });
    if (!preview) {
      const result = await supabase!.from('workspace_items').insert(item).select().single();
      if (result.error) throw result.error;
      item = result.data as WorkspaceItem;
    }
    commit((old) => ({ ...old, items: [item, ...old.items.filter((it) => it.id !== item.id)], activity: preview ? previewEvent(`Created a ${kind}`, item) : old.activity }));
    return item;
  });

  const updateItem = (id: string, patch: Partial<WorkspaceItem>, version?: string) => mutation(id, async () => {
    const original = dataRef.current.items.find((it) => it.id === id);
    if (!original) throw new Error('This item was removed on another device.');
    if (version && version !== original.updated_at) throw new Error('This item changed on another device. Reload it before saving; your draft is still open.');
    const { title, body, status, priority, project, due_date, pinned, deleted_at, extra } = { ...original, ...patch };
    const allowed = { title, body, status, priority, project, due_date, pinned, deleted_at, extra, origin: 'web' as const, updated_at: new Date().toISOString() };
    let item: WorkspaceItem = { ...original, ...allowed };
    if (!preview) {
      const result = await supabase!.from('workspace_items').update(allowed).eq('id', id).eq('owner_id', uid).eq('updated_at', version || original.updated_at).select().maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) { void refresh(); throw new Error('A newer version is available. Reload the item to avoid overwriting another device.'); }
      item = result.data as WorkspaceItem;
    }
    commit((old) => ({ ...old, items: old.items.map((it) => it.id === id ? item : it).filter((it) => !it.deleted_at), activity: preview ? previewEvent(item.deleted_at ? `Deleted a ${item.kind}` : item.status === 'done' ? `Completed a ${item.kind}` : `Updated a ${item.kind}`, item) : old.activity }));
    return item;
  });

  return <Context.Provider value={{
    data, loading, error, online, realtime, pending, lastSync, refresh, createItem, updateItem,
    removeItem: async (id) => { await updateItem(id, { deleted_at: new Date().toISOString() }); },
    saveProfile: async (patch) => { await mutation('profile', async () => {
      const { name, bio, avatar_color, theme, usage_consent } = { ...dataRef.current.profile, ...patch };
      if (!name.trim()) throw new Error('Please enter your name.');
      const allowed = { name: name.trim(), bio, avatar_color, theme, usage_consent };
      if (!preview) {
        const result = await supabase!.from('profiles').update(allowed).eq('id', uid).select().single();
        if (result.error) throw result.error;
        commit((old) => ({ ...old, profile: result.data as Profile }));
      } else commit((old) => ({ ...old, profile: { ...old.profile, ...allowed } }));
    }); },
    resetPreview: () => {
      if (!preview) return;
      commit(seedWorkspace());
      toast({ title: 'Preview reset', msg: 'The sample workspace is ready to explore again.' });
    },
  }}>{children}</Context.Provider>;
}

export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error('WorkspaceDataProvider is required.');
  return context;
}