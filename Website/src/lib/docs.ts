export type DocSection = { id: string; title: string; group: string; icon: string };

export const DOC_SECTIONS: DocSection[] = [
  { id: "introduction", title: "Introduction", group: "Getting started", icon: "book" },
  { id: "installation", title: "Installation", group: "Getting started", icon: "download" },
  { id: "quick-tour", title: "Quick tour (video)", group: "Getting started", icon: "play" },
  { id: "first-launch", title: "First launch", group: "Getting started", icon: "zap" },
  { id: "web-workspace", title: "Web workspace & sync", group: "Getting started", icon: "globe" },
  { id: "chat", title: "Chat", group: "Workspace", icon: "chat" },
  { id: "notes", title: "Notes", group: "Workspace", icon: "note" },
  { id: "tasks", title: "Tasks & Kanban", group: "Workspace", icon: "tasks" },
  { id: "pel-ai", title: "Pel AI", group: "Intelligence", icon: "spark" },
  { id: "timeless", title: "Timeless", group: "Intelligence", icon: "clock" },
  { id: "reminders", title: "Reminders", group: "Intelligence", icon: "bell" },
  { id: "prompts", title: "Prompt Saver", group: "Intelligence", icon: "bookmark" },
  { id: "media", title: "Media", group: "Explore", icon: "image" },
  { id: "arcade", title: "Arcade", group: "Explore", icon: "game" },
  { id: "themes", title: "Themes", group: "Personalize", icon: "palette" },
  { id: "widget", title: "Desktop widget", group: "Personalize", icon: "layers" },
  { id: "shortcuts", title: "Keyboard shortcuts", group: "Personalize", icon: "terminal" },
  { id: "tokens", title: "Design tokens", group: "Reference", icon: "cpu" },
  { id: "faq", title: "FAQ", group: "Reference", icon: "search" },
  { id: "troubleshooting", title: "Troubleshooting", group: "Reference", icon: "shield" },
];
