export type ItemKind = 'task' | 'note' | 'conversation' | 'message' | 'reminder' | 'prompt';
export type TaskStatus = 'todo' | 'doing' | 'done';
export type WorkspaceItem = {
  id: string;
  owner_id: string;
  kind: ItemKind;
  title: string;
  body: string;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high';
  project: string;
  due_date: string | null;
  pinned: boolean;
  origin: 'web' | 'desktop';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  extra: Record<string, string>;
};

export type Profile = {
  id: string;
  name: string;
  email: string;
  bio: string;
  avatar_color: string;
  theme: string;
  usage_consent: boolean;
  created_at: string;
  last_seen: string;
};

export type Device = {
  id: string;
  owner_id: string;
  name: string;
  platform: string;
  kind: 'desktop' | 'web' | 'extension';
  last_seen: string;
  app_version: string;
};

export type Usage = {
  id: string;
  owner_id: string;
  device_id: string;
  app_name: string;
  category: string;
  minutes: number;
  day: string;
  color: string;
};

export type Activity = {
  id: string;
  owner_id: string;
  action: string;
  kind: string;
  origin: string;
  created_at: string;
};

export type WorkspaceData = {
  items: WorkspaceItem[];
  profile: Profile;
  devices: Device[];
  usage: Usage[];
  activity: Activity[];
};

export type AdminUser = Profile & { task_count: number; note_count: number; device_count: number; total_count: number };
export type AdminMetrics = { users: number; active_users: number; devices: number; changes: number };

export const dateKey = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

export function relativeTime(value: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));
}

export function minutesLabel(minutes: number) {
  const rounded = Math.round(minutes);
  return rounded >= 60 ? `${Math.floor(rounded / 60)}h ${rounded % 60}m` : `${rounded}m`;
}