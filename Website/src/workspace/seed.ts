import { dateKey, type WorkspaceData, type WorkspaceItem } from './types';

export const PREVIEW_ID = 'local-preview';
export function makeItem(kind: WorkspaceItem['kind'], owner: string, patch: Partial<WorkspaceItem> = {}): WorkspaceItem {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), owner_id: owner, kind, title: '', body: '', status: 'todo', priority: 'medium',
    project: 'Personal', due_date: null, pinned: false, origin: 'web', created_at: now, updated_at: now,
    deleted_at: null, extra: {}, ...patch,
  };
}

export function seedWorkspace(): WorkspaceData {
  const now = new Date();
  const earlier = (minutes: number) => new Date(now.getTime() - minutes * 60000).toISOString();
  const today = dateKey();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const items: WorkspaceItem[] = [
    ...[
      ['Refine the landing page', 'doing', 'high', 'PebbleX'],
      ['Explore a softer color palette', 'todo', 'medium', 'Design'],
      ['Write a little. Think a little.', 'todo', 'low', 'Personal'],
      ['Review the onboarding flow', 'todo', 'high', 'PebbleX'],
      ['Send the weekly update', 'todo', 'medium', 'Work'],
      ['Collect inspiration for next week', 'todo', 'low', 'Design'],
      ['Clear a little space on the desktop', 'done', 'low', 'Personal'],
      ['Sketch the new workspace', 'done', 'medium', 'Design'],
    ].map(([title, status, priority, project], i) => makeItem('task', PREVIEW_ID, {
      title, status: status as WorkspaceItem['status'], priority: priority as WorkspaceItem['priority'], project,
      due_date: i < 4 ? today : dateKey(tomorrow), origin: i % 2 ? 'web' : 'desktop',
      created_at: earlier(800 + i * 70), updated_at: earlier(10 + i * 15),
      body: i === 0 ? 'Keep the hierarchy simple. Make room for the work, not more distractions.' : '',
    })),
    makeItem('note', PREVIEW_ID, { title: 'A few thoughts for a calmer week', project: 'Personal', pinned: true, origin: 'desktop', updated_at: earlier(20), body: '# A little space to think\n\nNot everything needs to be finished today. Start with what matters, and let the rest wait.\n\n## This week\n\n- Finish the landing page\n- Spend a morning exploring new ideas\n- Leave some room for the unexpected\n\n> Do fewer things, with a little more care.\n\n## One small reminder\n\nGood work starts with a clear mind. Take a walk. Write something down. Then come back.' }),
    makeItem('note', PREVIEW_ID, { title: 'PebbleX / launch checklist', project: 'Work', pinned: true, origin: 'desktop', updated_at: earlier(85), body: '# Ready when it feels right\n\n- [x] Define our visual language\n- [x] Explore thirteen themes\n- [ ] Polish the first-run experience\n- [ ] Review desktop and web sync\n\n## A quieter launch\n\nMake the product useful before making it loud.' }),
    makeItem('note', PREVIEW_ID, { title: 'Small things worth keeping', project: 'Ideas', updated_at: earlier(135), body: '# The inspiration shelf\n\nA good book. An interesting typeface. A really simple interface.\n\nCollect the things that make you pause.\n\n- Warm paper and green ink\n- The light just before sunset\n- Software that gets out of the way' }),
    makeItem('reminder', PREVIEW_ID, { title: 'Step away for a short walk', due_date: today, extra: { time: '16:00' }, project: 'Personal' }),
    makeItem('reminder', PREVIEW_ID, { title: 'Review the launch checklist', due_date: dateKey(tomorrow), extra: { time: '09:30' }, project: 'Work' }),
    makeItem('prompt', PREVIEW_ID, { title: 'Make it simpler', body: 'Rewrite this with fewer words and a calm, confident voice. Keep the meaning. Remove the noise.', project: 'Writing', pinned: true }),
    makeItem('prompt', PREVIEW_ID, { title: 'A thoughtful second opinion', body: 'Review this idea. What is clear, what needs work, and what am I missing? Give me three practical suggestions.', project: 'Thinking' }),
  ];
  const desktopId = crypto.randomUUID();
  const apps = [
    ['Figma', 'Design', 84, '#9176db'], ['Visual Studio Code', 'Development', 66, '#5d9dd7'],
    ['Arc', 'Browsing', 42, '#d190a4'], ['PebbleX', 'Productivity', 28, '#7eaf6a'], ['Spotify', 'Audio', 18, '#61ad88'],
  ] as const;
  const usage = Array.from({ length: 7 }, (_, dayOffset) => {
    const day = new Date(now); day.setDate(day.getDate() - dayOffset);
    return apps.map(([name, category, minutes, color], i) => ({
      id: crypto.randomUUID(), owner_id: PREVIEW_ID, device_id: desktopId, app_name: name,
      category, minutes: Math.round(minutes * [1, 1.2, .85, 1.4, .65, .35, .5][dayOffset] + i), day: dateKey(day), color,
    }));
  }).flat();
  return {
    items,
    profile: { id: PREVIEW_ID, name: 'Alex Morgan', email: 'alex@example.com', bio: 'Making things with a little more care.', avatar_color: '#b7cba4', theme: 'elera', usage_consent: true, created_at: earlier(20000), last_seen: earlier(1) },
    devices: [
      { id: desktopId, owner_id: PREVIEW_ID, name: 'Alex\'s MacBook Pro', kind: 'desktop', platform: 'macOS', last_seen: earlier(3), app_version: '0.1.0' },
      { id: crypto.randomUUID(), owner_id: PREVIEW_ID, name: 'This browser', kind: 'web', platform: 'Web', last_seen: earlier(0), app_version: '0.1.0' },
    ],
    usage,
    activity: [
      { id: crypto.randomUUID(), owner_id: PREVIEW_ID, action: 'Updated a note', kind: 'note', origin: 'desktop', created_at: earlier(20) },
      { id: crypto.randomUUID(), owner_id: PREVIEW_ID, action: 'Completed a task', kind: 'task', origin: 'web', created_at: earlier(38) },
      { id: crypto.randomUUID(), owner_id: PREVIEW_ID, action: 'Created a task', kind: 'task', origin: 'desktop', created_at: earlier(65) },
      { id: crypto.randomUUID(), owner_id: PREVIEW_ID, action: 'Updated a note', kind: 'note', origin: 'desktop', created_at: earlier(85) },
    ],
  };
}