import type { Auth } from 'firebase/auth';
import { httpsCallable, type Functions } from 'firebase/functions';
import { createClient } from '@supabase/supabase-js';

export type SharedItem = {
  id: string;
  owner_id: string;
  kind: 'task' | 'note' | 'conversation' | 'message' | 'reminder' | 'prompt';
  title: string;
  body: string;
  status: 'todo' | 'doing' | 'done';
  priority: 'low' | 'medium' | 'high';
  project: string;
  due_date: string | null;
  pinned: boolean;
  origin: 'web' | 'desktop';
  extra: Record<string, string>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type QueuedWrite = { item: SharedItem; expectedVersion: string | null };
type Options = {
  auth: Auth;
  functions: Functions;
  supabaseUrl: string;
  supabasePublishableKey: string;
  device: { name: string; platform: string; version: string };
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  // Persist remote rows locally without calling saveItem again (avoid echo loops).
  applyRemote: (item: SharedItem) => Promise<void>;
  applyProfile: (profile: Record<string, unknown>) => Promise<void>;
  onConflict: (local: SharedItem, remote: SharedItem | null) => void;
  onStatus: (state: 'connecting' | 'live' | 'polling' | 'offline' | 'conflict' | 'error', message?: string) => void;
};

/** Drop-in sync transport. The existing desktop renderer must connect its local store to these callbacks. */
export async function startDesktopSync(options: Options) {
  const user = options.auth.currentUser;
  if (!user) throw new Error('Sign into Firebase before starting sync.');
  const uid = user.uid;
  await httpsCallable(options.functions, 'ensureWorkspaceAccount')();
  await user.getIdToken(true);
  const client = createClient(options.supabaseUrl, options.supabasePublishableKey, {
    accessToken: async () => {
      if (options.auth.currentUser?.uid !== uid) return null;
      return options.auth.currentUser.getIdToken();
    },
  });
  const deviceKey = `pebblex-device:${uid}`;
  const queueKey = `pebblex-pending-writes:${uid}`;
  const deviceId = options.storage.getItem(deviceKey) || crypto.randomUUID();
  options.storage.setItem(deviceKey, deviceId);
  let queue: QueuedWrite[] = [];
  try {
    const parsed = JSON.parse(options.storage.getItem(queueKey) || '[]');
    if (Array.isArray(parsed)) queue = parsed.filter((entry) => entry.item?.owner_id === uid);
  } catch { throw new Error('The pending sync queue is unreadable. Back it up before resetting it.'); }
  let stopped = false;
  let flushing = false;
  let pulling = false;
  let live = false;
  const conflicts = new Set<string>();
  const persist = () => options.storage.setItem(queueKey, JSON.stringify(queue));
  const report = (state: Parameters<Options['onStatus']>[0], message?: string) => { if (!stopped) options.onStatus(state, message); };
  const checkSession = () => {
    if (stopped || options.auth.currentUser?.uid !== uid) throw new Error('The sync session has ended.');
  };

  const heartbeat = async () => {
    checkSession();
    const result = await client.from('devices').upsert({
      id: deviceId, owner_id: uid, name: options.device.name, platform: options.device.platform,
      kind: 'desktop', app_version: options.device.version, last_seen: new Date().toISOString(),
    });
    if (result.error) throw result.error;
  };

  const pull = async () => {
    checkSession();
    if (pulling) return;
    pulling = true;
    try {
      // Include soft-deleted rows so deletions reach devices that were offline.
      for (let offset = 0; !stopped; offset += 500) {
        const result = await client.from('workspace_items').select('*').eq('owner_id', uid).order('id').range(offset, offset + 499);
        if (result.error) throw result.error;
        for (const row of result.data as SharedItem[]) {
          if (!queue.some((entry) => entry.item.id === row.id)) await options.applyRemote(row);
        }
        if (result.data.length < 500) break;
      }
      const profile = await client.from('profiles').select('*').eq('id', uid).single();
      if (profile.error) throw profile.error;
      await options.applyProfile(profile.data);
    } finally { pulling = false; }
  };

  const flush = async () => {
    checkSession();
    if (flushing || !navigator.onLine) return;
    flushing = true;
    try {
      for (const entry of [...queue]) {
        checkSession();
        if (conflicts.has(entry.item.id)) continue;
        const row = { ...entry.item, owner_id: uid, origin: 'desktop' as const };
        const result = entry.expectedVersion
          ? await client.from('workspace_items').update(row).eq('owner_id', uid).eq('id', row.id).eq('updated_at', entry.expectedVersion).select().maybeSingle()
          : await client.from('workspace_items').insert(row).select().single();
        if (result.error && result.error.code !== '23505') throw result.error;
        if (!result.data || result.error?.code === '23505') {
          const remote = await client.from('workspace_items').select('*').eq('owner_id', uid).eq('id', row.id).maybeSingle();
          if (remote.error) throw remote.error;
          // A timed-out insert might already have committed. Do not duplicate it.
          const alreadySaved = remote.data && ['title','body','kind','status','priority','project','due_date','pinned','deleted_at'].every((key) => remote.data[key] === row[key as keyof SharedItem]) && JSON.stringify(remote.data.extra) === JSON.stringify(row.extra);
          if (alreadySaved) {
            queue = queue.filter((current) => current !== entry); persist();
            await options.applyRemote(remote.data as SharedItem);
            continue;
          }
          conflicts.add(row.id);
          report('conflict', 'Another device saved a newer version. A local copy was preserved.');
          options.onConflict(row, remote.data as SharedItem | null);
          continue;
        }
        queue = queue.filter((current) => current !== entry); persist();
        await options.applyRemote(result.data as SharedItem);
      }
      if (!conflicts.size) report(live ? 'live' : 'polling');
    } catch (err) {
      report(navigator.onLine ? 'error' : 'offline', (err as Error).message);
    } finally { flushing = false; }
  };

  const reconcile = async () => {
    if (stopped) return;
    if (!navigator.onLine) { report('offline'); return; }
    try { await heartbeat(); await flush(); await pull(); }
    catch (err) { report('error', (err as Error).message); }
  };

  report('connecting');
  await heartbeat();
  await pull();
  await client.realtime.setAuth();
  const channel = client.channel(`desktop:${uid}:${deviceId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_items', filter: `owner_id=eq.${uid}` }, () => { void reconcile(); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, (payload) => {
      if (!stopped) void options.applyProfile(payload.new).catch((err) => report('error', (err as Error).message));
    })
    .subscribe((status) => { live = status === 'SUBSCRIBED'; report(live ? 'live' : 'polling'); });
  const poll = setInterval(() => { void reconcile(); }, 45000);
  const onOnline = () => { void reconcile(); };
  window.addEventListener('online', onOnline);
  await flush();

  return {
    deviceId,
    async saveItem(item: SharedItem, expectedVersion: string | null) {
      checkSession();
      if (item.owner_id !== uid) throw new Error('Cannot sync another account\'s item.');
      const queued = queue.find((entry) => entry.item.id === item.id);
      if (queued && flushing) throw new Error('This item is currently syncing. Keep the local draft and retry.');
      const entry = { item: { ...item, origin: 'desktop' as const }, expectedVersion: queued ? queued.expectedVersion : expectedVersion };
      queue = [...queue.filter((current) => current.item.id !== item.id), entry]; persist();
      await flush();
      return { queued: queue.some((current) => current.item.id === item.id), conflict: conflicts.has(item.id) };
    },
    async recordAppUsage(app: { app_name: string; category: string; minutes: number; day: string; color: string }) {
      checkSession();
      const profile = await client.from('profiles').select('usage_consent').eq('id', uid).single();
      if (profile.error) throw profile.error;
      if (!profile.data.usage_consent) return { shared: false };
      const result = await client.from('app_usage').upsert({ ...app, owner_id: uid, device_id: deviceId }, { onConflict: 'owner_id,device_id,app_name,day' });
      if (result.error) throw result.error;
      return { shared: true };
    },
    async acceptRemote(id: string) {
      checkSession();
      queue = queue.filter((entry) => entry.item.id !== id); conflicts.delete(id); persist(); await pull();
    },
    async keepLocalAfterReview(id: string, remoteVersion: string) {
      checkSession();
      queue = queue.map((entry) => entry.item.id === id ? { ...entry, expectedVersion: remoteVersion } : entry);
      conflicts.delete(id); persist(); await flush();
    },
    refresh: reconcile,
    stop() {
      stopped = true;
      clearInterval(poll);
      window.removeEventListener('online', onOnline);
      void client.removeChannel(channel);
      // Keep account-scoped pending edits, but never store credentials here.
    },
  };
}