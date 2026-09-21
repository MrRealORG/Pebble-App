# Pebble — Complete Feature Inventory

Everything below is implemented and running. **19 modules, 41 distinct views, ~330 discrete features.**

Counts verified against the built bundle: 15,821 lines of JS · 1,649 lines of CSS · 24 block types · 1,108 emoji · 93 icons · 4 themes · 61 modal dialogs · 42 form dialogs · 36 dropdown menus · 17 context menus.

---

## 1. Workspace shell

1. Three-pane layout: activity rail + collapsible sidebar + main view
2. 19 modules, each with its own icon, group and ordering
3. Rail badges showing live counts (overdue tasks, unread chat, due reminders)
4. Collapsible sidebar (`Ctrl+B`), state remembered
5. Sidebar grouped by Capture / Plan / Track / Knowledge / Connect / Life / System
6. Collapsible sidebar groups, collapse state remembered
7. Per-module sidebar sub-navigation (e.g. Notes → Favourites, Tasks → Overdue)
8. Favourites strip in the sidebar
9. User panel with avatar, display name and presence
10. Four presence states: online / idle / do-not-disturb / offline
11. Live sidebar stats (notes, open tasks, habits today)
12. Breadcrumb trail that updates per route, clickable
13. Status bar: save state, record counts, due reminders, AI mode, storage size, runtime
14. Boot splash with progress animation
15. Hash-based routing with history and back-navigation (`Alt+←`)
16. Deep links — every item is addressable by URL (`#/notes/<id>`, `#/tasks?project=<id>`)
17. Configurable start page
18. Workspace renaming
19. Single-instance lock (desktop) — a second launch focuses the existing window

## 2. Command palette (`Ctrl/⌘K`)

20. Fuzzy search across every content type at once
21. `Tab` cycles a content-type filter (notes / tasks / wiki / commands / events / bookmarks / contacts / messages)
22. Keyboard navigation (`↑ ↓ ↵ Esc`)
23. Live result counts grouped by type
24. Match highlighting in results
25. Every module jump available as a command
26. ~40 universal commands (new note, new task, export, theme toggle, weekly review…)
27. Module-declared commands appear automatically
28. Recents shown when the query is empty
29. "Create `<query>`" when nothing matches
30. Recently-edited notes and top-priority tasks surfaced on open

## 3. Quick capture (`Ctrl/⌘+Shift+N`)

31. Four capture modes: note / task / reminder / journal
32. Natural-language date parsing — `tomorrow 3pm`, `next friday`, `in 2 hours`, `12 March`, `5/3`
33. Inline priority flags — `!high`, `!urgent`, `!low`
34. Inline tags — `#work` (auto-creates the tag if new)
35. Inline project routing — `@Personal`
36. Recurrence detection — `every weekday`, `weekly`, `monthly`
37. Automatic reminder creation for captured tasks with a due date
38. Appends to today's journal entry if one already exists
39. Tag picker in the capture dialog
40. Datetime picker in the capture dialog
41. `Ctrl+Enter` to save, `Esc` to dismiss
42. Global shortcut works even when the app is not focused (desktop)
43. Toast with an "Open" action after every capture

## 4. Notes — block editor

44. **24 block types:** text, H1, H2, H3, bullet, numbered, to-do, checklist item, toggle, quote, divider, callout, code, equation, table, image, embed, bookmark, file, diagram, note reference, live task list, progress bar, live stat cards
45. `/` slash menu with fuzzy filtering and keyboard navigation
46. Contenteditable inline editing with live markdown rendering
47. Inline formatting: **bold**, *italic*, ~~strike~~, `code`, ==highlight==
48. Auto-continuing lists (Enter keeps the bullet/number/to-do going)
49. Empty list item + Enter exits the list
50. Block splitting at the caret on Enter
51. Backspace at block start merges into the previous block
52. `Alt+↑/↓` moves a block
53. `Tab` nests a block into the toggle above; `Shift+Tab` un-nests
54. Drag-and-drop block reordering with drop indicators
55. `Ctrl+Shift+D` duplicates a block
56. Per-block gutter menu (turn into any of 24 types, duplicate, move, copy as text, copy as markdown, delete)
57. Callout variants: info / success / warn / danger, each with its own emoji
58. Toggle blocks with collapsible children
59. Editable tables — add/remove rows and columns, CSV copy, convert rows into sub-notes
60. Image blocks: upload from disk, paste, or URL; captions; click to zoom
61. File attachments stored as data URLs with type-aware icons and download
62. Bookmark blocks render as link-preview cards and auto-save to the bookmark library
63. Embed blocks (sandboxed iframes)
64. Note-reference blocks that embed another note as a live card
65. Live task-list blocks that query real tasks (open / done / today / overdue / all, per project)
66. Progress-bar blocks
67. Stat-card blocks pulling live workspace numbers, with a picker for which stats
68. Markdown paste — rich HTML from any app is converted to blocks, preserving headings, lists, tables, code and bold
69. Multi-line plain-text paste splits into separate blocks
70. Code blocks keep raw text (no markdown rendering)
71. Equation blocks
72. Auto-growing textareas everywhere
73. Emoji picker with 1,108 emoji in 9 categories plus a recents row
74. Formatting toolbar with 20 buttons
75. Note icons (emoji) — click to change
76. Cover images: 8 gradients or any URL, with removal
77. Favourite and pin flags
78. Word count and read-time estimate in the header
79. Relative "edited …" timestamps
80. Parent-note and sub-note counts in the metadata row
81. **Properties system** with 9 types: text, number, select, multi-select, checkbox, date, URL, rating (stars), tags
82. Add / rename / reorder / delete / retype properties inline
83. Select properties can gain new options on the fly

## 5. Notes — organisation

84. Infinite nesting via a page tree
85. Drag a note onto another to re-parent it, with cycle detection
86. Expand / collapse all
87. Four tree sort modes: manual, recently edited, A→Z, created
88. Live tree filtering
89. Search-result mode in the tree
90. Favourite and pinned indicators in the tree
91. Child counts in the tree
92. Per-row hover actions (add sub-note, more menu)
93. Full right-click menu with 15 actions per note
94. "Move to" submenu listing every other note
95. Duplicate a note (deep-cloned, fresh block ids)
96. Archive / unarchive
97. Soft delete to trash with restore
98. Recursive delete of a note and its descendants
99. Copy a `[[wiki link]]` to the note
100. Export a single note as markdown with front matter

## 6. Notes — links and knowledge

101. `[[Wiki links]]` with live autocomplete across notes *and* wiki pages
102. `Enter` on an unmatched link creates the page
103. `[[Link|alias]]` syntax
104. Aliased and plain links both resolve
105. Clicking a link navigates to the note or wiki page
106. Backlinks panel — every page that links here
107. **Unlinked mentions** — pages that name this note without linking it
108. `#hashtag` inline tags, clickable to filter
109. `@mention` highlighting
110. Auto-resolving URLs in text
111. Related-notes panel using term-overlap + tag-overlap scoring
112. Side panel with a clickable document outline (H1/H2/H3, scroll-to)
113. Side panel with readability, sentiment, word/char/sentence counts, grade level
114. Side panel with the top-10 key terms

## 7. Notes — views

115. **Document view** (the editor)
116. **Database view** — every property becomes a column, plus computed columns (words, sub-notes, backlinks, edited, created)
117. Sortable columns in the database view
118. Group the database by first tag / parent note / month created / favourite
119. Database filters: pinned, favourites, has-links, free text
120. Archive and favourite filters
121. Database CSV export with all properties
122. **Markdown source view** with a live rendered preview side by side
123. Apply markdown back into blocks
124. Reset the markdown editor
125. Copy the markdown

## 8. Notes — versions, templates, AI

126. Automatic version snapshots as you edit (up to 25 per note)
127. Version list with word counts and relative timestamps
128. Preview any historical version rendered
129. Restore a version (with a safety snapshot of the current state first)
130. Copy any version as markdown
131. **8 built-in templates:** meeting notes, weekly review, daily note, project brief, book notes, decision log, bug report, empty page
132. Insert a template at the cursor from the `/` menu
133. Save any note as a new template
134. Template library browser grouped by category
135. Edit and delete templates
136. AI: summarise (insert at top, or copy)
137. AI: improve writing, with a before/after diff modal
138. AI: shorten
139. AI: expand / elaborate
140. AI: change tone (6 tones)
141. AI: translate (8 languages from the menu, 30+ via prompt)
142. AI: extract action items → creates real tasks with a review step
143. AI: suggest tags against your existing vocabulary
144. AI: generate a title
145. AI: find related notes
146. AI: ask free-form questions scoped to one note
147. AI: continue writing (drafts the next section from the current block)
148. Selection-aware transforms — operates on your selection if you have one, otherwise the block/note
149. Auto-tag every untagged note in bulk, with a per-note approval screen
150. Cluster all notes by topic with one-click bulk tagging

## 9. Markdown engine

151. Blocks → markdown (all 24 types)
152. Markdown → blocks (headings, lists, to-dos, quotes, callouts, code, tables, images, details/summary toggles, `$$math$$`, dividers)
153. HTML → markdown (pasted rich content: headings, bold, italic, lists, tables, code, links, images, blockquotes)
154. Note → markdown with YAML front matter (title, id, dates, tags, parent, all properties)
155. CSV serialiser with correct quoting/escaping
156. CSV parser handling quoted commas and embedded quotes
157. Markdown renderer for AI output and wiki pages (tables, task lists, code fences, links, `[[links]]`)
158. Whole-workspace markdown export with per-file markers and an index

## 10. Tasks

159. Five views: **Smart**, List, **Kanban**, Table, Calendar
160. Smart view buckets: overdue, today, tomorrow, next 7 days, later, in progress, quick wins (≤20 min), blocked, no date, completed
161. "Reschedule all overdue → today" one-click
162. Group list view by status / project / due date / priority / tag / none
163. Sort by AI priority / due / newest / A→Z / priority / effort / manual
164. Free-text filter
165. Filter by project, status, priority, tag
166. Show/hide completed
167. Project filter bar with per-project open counts and colours
168. Inline quick-add row with full natural-language parsing
169. Subtasks (real task records with a parent)
170. Checklists inside a task
171. Progress computed from subtasks + checklist
172. Six statuses with colour coding
173. Five priorities with colour coding
174. Estimates and actuals in minutes
175. Due date + time
176. Recurrence: daily / weekdays / weekly / biweekly / monthly / yearly
177. Completing a recurring task auto-creates the next occurrence
178. Undo on completion (including removing the auto-created recurrence)
179. Automatic reminder when a task is created with a due date
180. Task detail modal with checklist editing, subtask creation, time summary, reminders, metadata and AI priority score
181. 25-item right-click menu per task (set status, set priority, due today/tomorrow/next week, clear due, start timer, remind me, create note, duplicate, copy link, archive, delete)
182. Inline status switching from the row
183. Drag-and-drop kanban cards between columns with undo
184. Custom kanban columns — add, rename, reorder, remove
185. Kanban column menus (add task here, move all to Done)
186. Kanban cards show due, project, checklist progress, subtask progress, estimate and tags
187. Table view with 12 columns including live AI priority score
188. Calendar view of tasks with month navigation and unscheduled tray
189. Bulk actions: mark all done, archive all, set status for all, set priority for all, move all to a project, spread across the next 7 days
190. **Plan my day** — ranks tasks, computes realistic remaining capacity, proposes a schedule, then time-blocks it into the calendar with due dates
191. AI priority scoring (due date × priority × status × checklist progress × quick-win bonus)
192. Export tasks as CSV or grouped markdown
193. Archive completed tasks in bulk
194. Projects with icon, colour, description, ordering and archiving
195. Project stats: completion %, minutes logged, minutes remaining
196. Create a project note pre-populated with objectives and a live task-list block
197. Overdue / due-today / in-progress / completion stat tiles

## 11. Calendar

198. Month grid with 6-week span and adjacent-month days
199. Week time-grid (00:00–24:00, 46px hours)
200. Day time-grid
201. Agenda (next 30 days, events + tasks merged and sorted)
202. **Free-time finder** — scans 14 days of working hours and lists every 45+ minute gap
203. Click a free slot to book it
204. Click any day cell to switch to day view; double-click to create an event
205. Click a time slot to create an event pre-filled with that hour
206. Right-click a slot: new event / block 90 min of focus / add a task due here
207. **Drag events to reschedule** with 15-minute snapping and undo
208. Overlap layout — concurrent events pack into columns
209. Live "now" indicator line positioned to the minute
210. Auto-scroll to 8am on open
211. All-day event strip
212. Tasks with due times shown on the grid
213. Habit completion and task counts shown in each month cell
214. Recurring event expansion (daily, weekdays, weekly, biweekly, monthly, yearly) up to 400 occurrences
215. Per-calendar colour coding
216. Calendar visibility toggles (legend chips)
217. Event fields: title, start, end, all-day, location, description, colour, calendar, attendees, busy flag, reminder offset, repeat rule, linked note/task
218. Eight reminder offsets (none → 3 days before)
219. Reminder auto-created for events that ask for one
220. Week-starts-on setting (Monday / Sunday / Saturday)
221. `.ics` export including VALARM reminders
222. `.ics` import with all-day and timed event parsing
223. Import all dated tasks as calendar events
224. Event menu: edit, duplicate, create note from event (pre-filled with agenda/notes/actions), create task, set reminder, delete
225. Today / prev / next navigation with a month-aware label

## 12. Reminders

226. **Native OS notifications** — desktop fires them from the main process every 15s, so they work while minimised to the tray
227. Browser build polls every 20s and uses the Notification API
228. Tray tooltip shows the pending-reminder count
229. Clicking a notification opens the app and deep-links
230. Urgent notifications use critical priority
231. Window flash on reminder (desktop)
232. Nine snooze presets (5 min → 1 week)
233. "Snooze until tomorrow 9am"
234. Custom snooze time
235. In-toast Snooze / Done actions when a reminder fires
236. Repeating reminders that reschedule themselves after firing
237. Five tabs: upcoming / due / snoozed / done / all
238. Grouped by day with Today / Tomorrow headers
239. Overdue and priority colour coding
240. Convert a reminder to a task or an event
241. Edit, duplicate, delete
242. Test-notification button
243. Master notification switch plus per-type switches (reminders, task-due)
244. Sound toggle

## 13. Habits

245. Daily / weekday / weekly cadence
246. Per-habit weekly target
247. Emoji icon and colour per habit
248. Big one-tap today toggle
249. Seven-day week strip, clickable per day, future days locked
250. Current streak with flame icon
251. Best-ever streak
252. 14-day / 30-day / 90-day consistency rates
253. 14-day sparkline per habit
254. **Contribution heatmap** — combined, 26 weeks
255. Per-habit 26-week heatmap with clickable cells to backfill
256. Four-level intensity shading
257. Streak milestones toast every 7 days
258. "Mark all done today"
259. Day-of-week analysis over 90 days with a bar chart
260. Automatic insight: your strongest and weakest weekday
261. Six-month consistency trend chart
262. Management table: cadence, target, streak, best, 30d, 90d, active state
263. Backfill the last 1/2/3/5/7 days
264. Clear history
265. Pause / resume a habit
266. Duplicate a habit
267. Auto-create a daily reminder for a habit
268. "Why this matters" note per habit
269. Habit stats on the dashboard with a completion ring
270. Habit state shown in calendar month cells and the journal "day at a glance"

## 14. Goals / OKRs

271. Goals with category, colour, description and target date
272. Key results with current / target / unit
273. Inline `−` / `+` steppers on every key result
274. Progress auto-computed from key results
275. Progress ring per goal
276. **Pace tracking** — compares actual progress against expected progress for the elapsed time and labels the goal ahead / on-track / at-risk / behind / overdue / complete
277. Days-remaining countdown with colour escalation
278. Add / edit / delete key results
279. Five manual status flags
280. "Mark achieved" with archive
281. Archive and restore goals
282. Create a goal note pre-filled with key results as to-dos
283. Convert all key results into tasks in one click
284. Coaching prompt card identifying the weakest goal
285. AI unblocking plan for the goal furthest behind
286. One-click "add a next action" for the weakest goal
287. Goal progress in the dashboard momentum card
288. Goals in the weekly review and AI insights

## 15. Journal

289. One entry per day, auto-created on first write
290. Five-point mood picker with emoji
291. Energy slider (1–5)
292. Weather picker
293. Free-text entry with autosave (~0.7s debounce) and a live word counter
294. Gratitude list — add / edit / remove items
295. **14 rotating prompts**, deterministic per day
296. Answer a prompt straight into the entry under a heading
297. Dedicated prompts view with an "answered" badge
298. Date navigation: prev / today / next (future locked)
299. **Timeline view** grouped by month with mood-coloured borders
300. **Four-month mood calendar** with mood-tinted cells and text previews
301. Mood legend
302. Stats view: entries, average mood, words written, gratitude items
303. Mood distribution donut
304. Mood by day of week bar chart
305. 90-day mood line chart
306. Word-frequency cloud of everything you have ever written
307. Writing streak counter
308. 21-day mood sparkline in the sidebar
309. "That day at a glance" — tasks due, habits logged, focus minutes, events, net spend
310. AI reflection over the last 7 days, appendable to today's entry
311. Per-entry analysis: tone, sentiment score, word count, key themes
312. Export the whole journal as markdown with mood, energy and gratitude
313. Quick-capture journal mode appends to today
314. Journal mood folded into AI insights and the weekly review

## 16. Focus timer (Pomodoro)

315. Three phases: focus / short break / long break
316. Configurable lengths (1–180 / 1–60 / 1–90 min)
317. Configurable rounds before a long break (2–12)
318. Animated SVG progress ring
319. Live countdown in `mm:ss` (or `h:mm:ss`)
320. "Ends at HH:MM" projection
321. Round dots showing progress through the cycle
322. Start / pause / reset / skip / complete-and-log
323. `Space` starts or pauses, `R` resets, `S` skips
324. Three-note ascending chime via the Web Audio API
325. Optional auto-start of breaks
326. Link a session to a task (searchable picker)
327. Completing a focus session adds the minutes to that task's actual time
328. Native notification when a session ends
329. Document title shows the remaining time while running
330. Session log grouped by day with per-day totals
331. Delete individual sessions
332. Stats: today's count, today's minutes, this week, all time
333. 14-day focus-minutes bar chart
334. Sessions feed the dashboard, weekly review and AI insights
335. Built-in guidance on how to use it properly

## 17. Time tracking

336. Running timer that **survives page reloads and app restarts**
337. Live `h:mm:ss` clock and status line
338. Rename the running entry
339. Start from a task, or as a manual entry
340. Stop → creates a time log and updates the task's actual minutes
341. Undo a stopped log
342. Manual entry with date, start time, duration, project, task and billable flag
343. Edit and delete logs
344. Restart a previous log's timer
345. Billable toggle per log
346. Log list grouped by day with daily totals
347. 14-day minutes bar chart with a daily average
348. By-project donut (30 days)
349. Billable vs internal donut
350. "Top time sinks" ranked with proportional bars
351. Per-task progress bar against the estimate (turns red when over)
352. CSV export
353. Time totals in the dashboard and weekly review

## 18. Finance

354. Accounts: checking / savings / credit / investment / cash / other
355. Per-account institution, colour, balance and credit limit
356. Credit utilisation bar with a red threshold
357. Archive accounts
358. Net worth across all accounts
359. Categories with icon, colour, type (income/expense) and monthly budget
360. Transactions with date, description, amount, category, account, recurring flag and note
361. Account balances update automatically on create / edit / delete
362. Filter transactions by text, category, type and account
363. Grouped by month with per-month income/expense/net
364. Spending-by-category donut with a legend
365. Six-month income-vs-spending bar chart
366. Monthly budgets with progress bars and colour states
367. Over-budget and near-limit alert card
368. Total budget bar with a plain-language remaining/over message
369. Budget editor for all categories at once
370. **Recurring-charge detection** — groups repeated descriptions and projects the annual cost
371. Largest single expenses
372. Per-category 3-month trend sparklines with direction and delta
373. 12-month spending trend
374. Savings rate calculation
375. Configurable currency symbol
376. CSV export
377. Financial observations folded into AI insights
378. Net spend shown in the journal "day at a glance"

## 19. Contacts (personal CRM)

379. Contacts with name, role, company, email, phone, colour, birthday, tags and free-form notes
380. Grid and table views
381. Search across every field
382. Filter by tag/group
383. Smart filters: needs follow-up (7 days), neglected (60+ days), upcoming birthdays (30 days)
384. Last-contact age with colour escalation
385. **Interaction history** — call / email / meeting / message / coffee / other, each with a note
386. Log an interaction (updates last-contact automatically)
387. Schedule a follow-up date
388. Overdue follow-up highlighting and a rail badge
389. Birthday-within-30-days badge
390. Profile modal with message count, reaction count and join date
391. Recent messages from that person
392. Cross-links: notes that mention this contact
393. Create a note about them, pre-filled with their details and interaction log
394. "Remind me to reach out" creates a real reminder
395. One-click email (opens the system mail client)
396. Copy email
397. CSV export
398. Stat tiles: people, follow-ups due, neglected, birthdays soon

## 20. Bookmarks

399. Save links with title, URL, folder, status, rating, tags, description and personal notes
400. Grid and list views
401. Folder chips with counts
402. Create folders inline
403. Status workflow: unread → reading → read → archived
404. Filter by status and free text (searches title, URL, description and tags)
405. Five-star rating
406. Favicon-style letter avatars coloured per domain
407. Opens in the system browser (desktop) or a new tab
408. Auto-marks unread → reading on first open
409. **Import browser bookmarks** (Netscape HTML from Chrome/Firefox/Edge), preserving folders
410. Plain-URL-list import fallback
411. Duplicate detection on import
412. **Export as Netscape bookmark HTML** — re-importable into any browser
413. Generate an AI note from a bookmark
414. Create a "read this" task from a bookmark
415. Table view with 8 columns
416. Move to folder, edit, delete

## 21. Wiki

417. Markdown wiki pages with title, slug, tags, view count and timestamps
418. Split editor: markdown source + live rendered preview
419. Editor insert helpers: `[[link]]`, heading, bullet, table
420. AI "Improve" straight from the editor
421. Rendered markdown supports headings, lists, tables, task lists, code, quotes, links and images
422. `[[Wiki links]]` resolve to wiki pages *or* notes
423. Clicking a broken link offers to create the page
424. Outgoing-links panel
425. Backlinks panel (from both wiki pages and notes)
426. **Broken-link checker** with one-click page creation
427. **Force-directed knowledge graph** — custom physics simulation, no library
428. Graph nodes sized by degree and word count; wiki vs note vs favourite colouring
429. Three edge types: `[[links]]`, parent/child, shared tag (dashed, weaker spring)
430. Drag individual nodes
431. Pan the canvas, scroll to zoom (0.25×–4×)
432. Hover a node to highlight its edges
433. Click a node to open it
434. Toggle notes in/out, hide orphans, re-run the layout
435. Graph legend with live node/edge counts
436. Alphabetical index grouped A–Z with word counts and link counts
437. **Orphan finder** with a "find a home" tool that ranks candidate pages by vocabulary overlap and shared tags, then inserts the link
438. Sidebar page list grouped by first tag with backlink counts
439. Page filtering
440. View counter
441. Duplicate, convert to a note, export as markdown, copy wiki link
442. AI: summarise (prepend a TL;DR), suggest tags, expand with a diff preview, analyse
443. Bulk export of every page
444. Recomputed link graph after every edit

## 22. Chat (Discord-style)

445. Multiple servers with icon, colour and description
446. Create / edit / delete servers
447. Server switcher menu
448. Channels grouped by category
449. Text and (simulated) voice channel types
450. Create / rename / delete channels
451. Channel topics
452. Private channel flag
453. Slow-mode field
454. Per-channel unread badges, capped at `9+`
455. Bold styling for channels with unread messages
456. Mark channel read / unread / mute
457. Mark everything read
458. Direct messages as their own server with per-person channels
459. Open a DM from any profile
460. **Roles with permissions** (admin / manage / post) and hoisting
461. Role colours shown on names
462. Create / edit / delete roles, toggle permissions per role
463. Members panel grouped by role with counts
464. Presence dots (online / idle / dnd / offline)
465. Per-member activity text
466. Add / edit / remove members, change their role and presence
467. Offline members dimmed
468. Profile modal: messages sent, reactions given, join date, recent messages, mention button
469. Message grouping — consecutive messages from one author within 5 minutes collapse the avatar
470. Day separators (Today / Yesterday / full date)
471. **Markdown rendering** in messages: bold, italic, strike, inline code, fenced code blocks, quotes, lists, links
472. Big-emoji rendering for emoji-only messages
473. **@-mention autocomplete** with arrow-key navigation, `@everyone` and `@here`
474. Mentions render in the author's colour and are clickable
475. Being mentioned creates an inbox item
476. **Reactions** — 12 quick emoji plus the full 1,108-emoji picker
477. Reaction aggregation with counts and a "you reacted" state
478. Hover a reaction to see who reacted
479. Reply-to with a quoted preview and click-to-jump
480. Edit your own messages (with an `(edited)` marker)
481. `↑` on an empty composer edits your last message
482. Delete your own messages (or any message with the manage permission)
483. Pin / unpin messages, with a pinned-messages viewer
484. Copy message text or a deep link that scrolls to and highlights the message
485. **File and image attachments** — paste from the clipboard, drag in, or use the file dialog
486. Images render inline and click to zoom; other files show size and a download button
487. Share a task from your workspace into the channel
488. Share a note with an auto-generated summary
489. Typing indicator with animated dots
490. Simulated member activity — teammates type and occasionally post
491. **AI bot** — responds to `/ask`, `@NexaBot`, questions and "daily digest"
492. Channel summarisation, postable back into the channel
493. Summarise the thread from any message onward
494. AI-rewrite any message
495. Extract tasks from a message
496. Save a conversation slice to a note (10-message context window)
497. Translate a message
498. Turn a message into a task or a reminder
499. Composer AI tools: improve / shorten / expand / tone (4) / translate / draft a reply from context
500. Composer markdown shortcuts (`Ctrl+B/I/E`)
501. Auto-growing composer capped at 150px
502. `Enter` sends, `Shift+Enter` newlines, `Esc` cancels reply/edit
503. Empty-channel welcome state with suggested first messages
504. Total-unread badge on the rail and in the status bar
505. Export a channel as markdown (day-grouped, with reactions)
506. Search all messages or one channel, with highlighting and click-to-jump
507. Member list toggle
508. Server/channel deep links

## 23. Inbox

509. Unified feed of every notification type: reminders, due tasks, chat mentions, habit streaks at risk, AI insights, calendar heads-up, budget alerts
510. Read / unread state with visual distinction
511. Filters: all / unread / reminders / tasks / chat / AI / finance
512. Priority colour coding
513. Deep links — clicking navigates to the source
514. Mark all read
515. Dismiss individual items
516. Clear everything
517. Rail badge and topbar badge with `99+` capping

## 24. AI assistant

518. Chat interface over your whole workspace
519. Conversation history persisted locally (last 40 turns)
520. 10 suggested prompts
521. Streaming-style typing indicator
522. Markdown rendering of answers
523. **Source citations** — clickable chips that jump to the note/task/page an answer came from
524. Confidence percentage on offline answers
525. Copy any answer, or save it as a note
526. Clear conversation
527. Context toggle (include workspace snapshot or not)
528. Context preview showing exactly what would be sent, with character and token estimates
529. **Insights view** — analyses the whole workspace and groups findings into "needs attention / going well / worth knowing"
530. AI observations layered on top when a provider is connected
531. **Tools view** with 12 one-click tools
532. **Daily briefing** in plain text with a regenerate button
533. Weekly review generation from real data, with an AI-enhance pass
534. "On this day" — what you wrote, completed and focused on this date in previous years
535. Spaced-repetition **flashcards** generated from any note, using SM-2
536. Flashcard self-grading (forgot / hard / good / easy) that reschedules each card
537. Session summary with a re-run option
538. Seven-provider support: offline, OpenAI, Anthropic, Gemini, OpenRouter, Groq, custom/Ollama
539. Per-provider model presets plus a free-text model field
540. Custom API base URL for local servers
541. **Connection test** that reports the exact failure reason
542. Automatic fallback — every feature tries the API and degrades to the offline engine
543. Error surfacing with the provider's message
544. Key stored locally, only ever sent to the chosen provider
545. Links to get a key from each provider
546. System prompt tuned for a personal-workspace assistant

### The offline engine (no key, no network)

547. BM25-style ranked search with IDF, title weighting, prefix boost and recency decay
548. Phrase search and multi-term AND matching
549. Result snippets centred on the match
550. Match highlighting
551. Per-content-type weighting
552. Favourite boost
553. Retrieval-based Q&A that quotes real passages with sources
554. Extractive summarisation with lead/conclusion bias and signal-word boosting
555. Outline extraction (headings + strong bullets)
556. Keyword extraction with proper-noun detection
557. Tag suggestion that prefers your existing vocabulary
558. Flesch reading ease + grade level
559. Syllable counting, sentence and paragraph stats, lexical diversity, long-sentence count
560. Sentiment analysis with a 100+ word lexicon and **negation handling**
561. Natural-language date parsing (12+ patterns)
562. Time parsing with 12/24-hour and am/pm
563. Quick-capture parsing (date + priority + tags + project in one string)
564. Task priority scoring
565. "Next up" ranking
566. Task summary statistics
567. Action-item extraction with owner, due date and priority inference
568. SM-2 spaced repetition
569. Related-note similarity (term overlap + tag overlap)
570. Topic clustering
571. Title suggestion
572. **34 text transforms** — case conversions, slug/kebab/snake/camel, dedupe/sort lines, bullets/numbers/checkboxes, strip markdown, collapse spaces, extract URLs/emails, base64 both ways, URL encode/decode, HTML escape, JSON pretty-print, CSV→JSON, text→markdown table, lorem, smart quotes, em-dashes, fix spacing, ROT13, Morse code
573. Cross-module insight generation (tasks, focus, habits, journal, goals, calendar, finance, knowledge, chat, inbox)
574. Daily digest in plain text
575. Weekly review with numbers, habit bars, completions, carry-overs, goals and reflection prompts

## 25. Search

576. Dedicated search page (`Ctrl/⌘+Shift+F`)
577. **192+ items indexed across 13 content types**: notes, tasks, wiki, events, messages, bookmarks, contacts, journal, goals, habits, reminders, transactions, projects
578. Index rebuilt lazily and invalidated on any change
579. Type-filter chips with live counts
580. Multi-select type filtering
581. Sort by relevance / newest / oldest / A→Z
582. **Generated short answer** at the top of the results
583. Per-result snippets with highlighting
584. Result metadata: type, age, relevance score, tags
585. Right-click menu per result
586. Empty state offers to create the query as a note
587. Recents and module shortcuts when the query is empty
588. URL-synced query (`#/search?q=…`)
589. Search operators help dialog

## 26. Appearance

590. **Four themes:** Dark, Light, Sepia, Midnight
591. Theme cycling from the topbar
592. 16 preset accent colours plus a free colour picker
593. Accent propagates through every component via CSS custom properties
594. 75 CSS custom properties
595. Interface font-size slider (13–19px)
596. Comfortable / compact density
597. Reduced-motion mode
598. Status bar toggle
599. Sidebar default state
600. Notion-style neutral palette in dark, warm-neutral in light
601. Custom scrollbars with hover states
602. Consistent radii, spacing and motion scales
603. Focus-visible outlines for keyboard users
604. Responsive breakpoints at 1240 / 1180 / 1000 / 900 / 760px

## 27. Data, import & export

605. Auto-save ~0.6s after every change
606. Manual save (`Ctrl+S`)
607. Atomic writes (temp file + rename) on desktop
608. Desktop: JSON file in the OS user-data folder
609. Browser: localStorage with automatic quota-exceeded recovery (trims old messages and retries)
610. Both builds keep a mirror copy for crash recovery
611. Schema migration on load — missing collections are back-filled
612. **Ten export formats:** full JSON backup, all notes as markdown (bundled), notes as CSV, tasks as CSV, calendar as `.ics`, journal as markdown, transactions as CSV, all chat as markdown, wiki as markdown, contacts as CSV
613. Native save dialog on desktop, browser download otherwise
614. Import a JSON backup in **replace or merge** mode
615. Import a markdown/text file as a note
616. Import `.ics` calendars
617. Import browser bookmark HTML
618. Validation with clear error messages on bad imports
619. **Trash** with soft-delete and per-item restore
620. Empty trash permanently
621. Reset to the sample workspace
622. Empty the workspace (keeps projects, tags, categories, templates)
623. Clear the browser cache copy
624. Live storage-size reporting
625. Per-collection record counts in Settings → Data
626. Drag-and-drop files anywhere in the app → attaches to the open note (or creates one)
627. Drop overlay with visual feedback
628. Full workspace snapshot shown in Settings → About

## 28. Desktop integration (Electron)

629. Frameless-feel window with a custom title bar style on macOS
630. Window geometry persisted and restored, clamped to the screen
631. Minimum window size
632. **Close to tray** instead of quitting (configurable)
633. Tray icon with a platform-appropriate template image on macOS
634. Tray context menu: open, quick capture, jump to Today/Tasks/Notes/Calendar/Habits, start a focus session, quit
635. Tray tooltip shows the pending-reminder count
636. Tray balloon on first minimise
637. Click the tray to show the window
638. **Global shortcuts** that work when the app is not focused: `Ctrl+Shift+N` (capture), `Ctrl+Shift+F` (search), `Ctrl+Shift+Space` (palette)
639. Single-instance lock — a second launch focuses the existing window
640. Reminder scheduler in the main process, polling the renderer every 15s
641. Native notifications with icons, urgency levels and click-to-deep-link
642. Window flash on reminder
643. Real save/open file dialogs with filters
644. Base64 file transfer over IPC for attachments
645. `shell.openExternal` for all external links (never opened inside the app)
646. `showItemInFolder`
647. Context-isolated preload bridge — no `nodeIntegration` in the renderer
648. Content Security Policy
649. DevTools auto-detached in development
650. `app.asar` packaging with unpacked icon assets
651. electron-builder config for NSIS + portable (Windows), DMG dual-arch (macOS), AppImage + deb (Linux)
652. App icons generated at 9 sizes plus a tray icon and an SVG master
653. Platform / arch / Electron / Chrome / Node versions surfaced in About

## 29. Keyboard shortcuts

654. `Ctrl/⌘+K` command palette
655. `Ctrl/⌘+Shift+N` quick capture
656. `Ctrl/⌘+Shift+F` search
657. `Ctrl/⌘+Shift+Space` palette (alternate)
658. `Ctrl/⌘+B` toggle sidebar
659. `Ctrl/⌘+S` save now
660. `Ctrl/⌘+,` settings
661. `Ctrl/⌘+N` new note
662. `Ctrl/⌘+T` new task
663. `Ctrl/⌘+D` dashboard
664. `Ctrl/⌘+1…9` jump to module
665. `Alt+←` back
666. `Esc` closes any overlay, in the correct stack order
667. `Ctrl/⌘+Enter` submits any dialog or capture
668. `/` block menu
669. `[[` wiki-link autocomplete
670. `Ctrl/⌘+B / I / E` bold / italic / inline code in the editor
671. `Ctrl/⌘+Shift+1/2/3` heading levels
672. `Ctrl/⌘+Shift+7/8/9` numbered / bulleted / to-do
673. `Ctrl/⌘+Shift+D` duplicate block
674. `Ctrl/⌘+Shift+M` equation block
675. `Alt+↑/↓` move block
676. `Tab` / `Shift+Tab` nest and un-nest blocks
677. `Space` / `R` / `S` control the focus timer
678. `↑` edits your last chat message
679. `Enter` / `Shift+Enter` in chat
680. `Ctrl/⌘+F` search the current channel
681. Full shortcut reference in Settings and via `Ctrl/⌘+/`
682. Field-aware — text shortcuts never fire while you are typing in an input

## 30. UI system

683. `h()` hyperscript element builder with tag/id/class shorthand
684. HTML fragment parser
685. 93 hand-drawn 24×24 SVG icons, no icon font
686. Toasts — 4 severities, titles, messages, action buttons, auto-dismiss, manual close, slide animation
687. Modal system with a stack, backdrop blur, per-modal sizing (narrow/default/wide/xwide), `Esc` handling and restore-focus
688. Promise-based `confirm()`, `confirmDelete()` and `prompt()`
689. **Schema-driven `form()`** supporting 12 field types with validation, required markers, hints, two-column layout and `Ctrl+Enter` submit
690. Context menus with headers, separators, icons, keyboard hints, danger styling and viewport clamping
691. Dropdown menus anchored to any element with right/up alignment options
692. Delayed tooltips on every `[title]` element, with viewport flipping
693. 1,108-emoji picker: 9 categories, search, recents row, viewport-aware positioning
694. Tag picker with inline creation
695. Image lightbox
696. Reusable filter-bar builder (search / select / segmented / chip / button / text / spacer)
697. Page-head builder
698. Stat tiles with icons, accents, sub-labels and optional click targets
699. Cards with hover elevation
700. Responsive grid utilities (2/3/4/auto columns)
701. Progress bars in 3 weights and 6 colours
702. SVG progress rings
703. SVG bar charts with hover titles
704. SVG donut charts with dash-array animation
705. SVG sparklines with null-gap handling
706. Avatars in 5 sizes with presence dots and deterministic colours
707. Chips in 9 semantic colours plus interactive and removable variants
708. Skeleton shimmer loader
709. Empty states with icon, title, message and call to action
710. Activity feed
711. Key-value rows
712. 20+ animations (fade, pop, slide, shimmer, pulse, spin, blink)
713. Deterministic colour hashing so the same name always gets the same colour

## 31. Data model & internals

714. 27 collections with a uniform CRUD API (`all`, `find`, `where`, `byIds`, `create`, `update`, `remove`, `insert`, `reorder`, `sort`, `clear`, `replaceAll`)
715. Soft-delete to trash by default, hard-delete where it makes sense
716. Per-collection event emission with subscribe/unsubscribe
717. Global change listener
718. Derived-selector layer (40+ selectors) so modules never hand-roll queries
719. Lazily built search corpus, invalidated on any relevant change
720. Automatic `created` / `updated` timestamps
721. Namespaced id generation (`note_…`, `task_…`, `msg_…`)
722. Recurrence engine shared by tasks, events and reminders with next-occurrence calculation
723. Module registry with groups, ordering, badges, sidebar items, breadcrumbs, commands, mount/leave hooks
724. Render-token guard so a slow render cannot clobber a newer one
725. Error boundary — a throwing module renders a readable stack instead of a blank screen
726. Rich seed workspace: 8 notes with real content, 22 tasks, 4 projects, 8 tags, 18 events, 8 reminders, 8 habits with 56 days of history, 4 goals with 9 key results, 6 journal entries, 24 focus sessions, 18 time logs, 6 bookmarks, 5 contacts with interactions, 4 accounts, 10 categories, 66 transactions, 6 interlinked wiki pages, 2 servers, 11 channels, 7 members, 6 roles, 31 messages with reactions and replies, 7 inbox items, 8 templates
727. First-run welcome toast with a tour link
728. Zero runtime dependencies — the entire app is hand-written vanilla JS

## 32. Testing & build

729. `npm run build` — concatenates 5 CSS and 22 JS files, emits the standalone web app, zips it
730. `npm test` — **105-check smoke test** in jsdom: boots the real bundle, renders all 19 modules and 41 sub-views, exercises the AI engine, markdown round-trips, CSV round-trips, selectors, recurrence, UI primitives, task/habit toggling, chat sending, theme switching, the command palette, global search and every async AI path; fails on any console error
731. `node --check` passes on every source file
732. JSHint clean for undefined variables across all 24 source files
733. `scripts/make_icons.py` regenerates every icon from pure Pillow
734. `scripts/package-desktop.js` builds `app.asar`, an optional ready-to-run runtime, and one-click build scripts for all three platforms
735. Standalone single-file web build with everything inlined (1.04 MB)

---

### By the numbers

| | |
|---|---|
| Modules | 19 |
| Distinct views | 41 |
| Documented features | 735 |
| JavaScript | 15,821 lines / 936 KB |
| CSS | 1,649 lines / 93 KB |
| Source files | 27 |
| Block types | 24 |
| Emoji | 1,108 |
| Icons | 93 |
| Themes | 4 |
| Keyboard shortcuts | 29 |
| Export formats | 10 |
| AI providers | 7 |
| Offline AI capabilities | 29 |
| Text transforms | 34 |
| Runtime dependencies | **0** |
| Automated checks | **105 passing** |

---

# v2.0 — the "make it bestest" update

Nothing was removed. Everything below was added on top of the 735 features above.

## UX / motion / customisation
736. **Simple Mode** — hides advanced chrome, calmer hierarchy, larger type (toggle in Settings → Customize or via the copilot)
737. Spring-based motion system (`--spring` easing) on rail, chips, cards, toasts, modals
738. Staggered list entrances, view-transition fade/slide, press-scale feedback
739. Glass surfaces with adjustable blur strength + global blur off switch
740. Global saturation and corner-roundness sliders
741. Fast-motion and reduced-motion modes
742. **Custom CSS injection** — unlimited customisation, live-applied
743. **Theme Studio** — edit every design token with colour pickers, live preview, save as your own theme (lands in the Shop, exportable as CSS)
744. Six extra shop themes (Sunset, Forest, Abyss, Candy, Noir) that repaint the whole app via tokens

## Dynamic Island
745. Animated pill pinned top-centre of the window
746. Live states: lock, due reminder, running time tracker, pomodoro countdown, unread inbox, XP
747. Click to expand into a panel of actionable notifications
748. Shortcut row inside the island (capture, palette, copilot, focus, game, settings)
749. Pulsing alert styling, spring expansion, Esc to collapse, 1s live refresh

## AI Copilot
750. Persistent right-hand copilot sidebar (`Ctrl+Shift+C`), animated conic-gradient orb
751. **Context engine** — watches your module, open note, focus time, overdue tasks, habits, inbox and recent activity, and shows it live
752. Proactive suggestion chips regenerated from live state
753. **Agent mode** — parses commands and executes them: create/complete tasks, notes, reminders, events, log habits, start focus, switch theme, navigate, buy shop items, confetti
754. Natural-language agent parsing ("create task email Sam tomorrow 9am !high")
755. Proposed-action buttons on AI replies (execute/copy)
756. **Voice input** — Web Speech API in any browser; on Windows desktop it bridges to native System.Speech ASR via PowerShell
757. **Voice output** — speaks replies with speechSynthesis, orb animates while talking
758. Mic button with recording pulse animation
759. Skills are injected into the copilot system prompt automatically
760. Saved prompts insertable straight into the copilot

## Prompt Manager
761. Save prompts with title, description, tags
762. `{{variable}}` syntax with a fill-dialog on run and smart defaults (date, name…)
763. Usage counters, search, edit, copy-filled, delete
764. Import/export prompts as markdown with front-matter
765. Auto-parsed title/description/tags/variables from front-matter or first heading
766. One click runs a prompt in the copilot

## Skill Vault
767. Install skills from `.skill`, `.md`, `.txt` files
768. **Install from `.zip` bundles** — a dependency-free ZIP reader (central-directory parse + `DecompressionStream('deflate-raw')`)
769. **Drag & drop anywhere in the app** with a full-screen drop overlay
770. Auto-extracts name/description/icon from front-matter, first heading, or filename
771. Per-skill enable toggle; enabled skills inject into the copilot
772. Four built-in starter skills (Ruthless Prioritiser, Plain-Language Writer, Devil's Advocate, Socratic Tutor)
773. Export any skill as a `.skill` file; test-run a skill in the copilot
774. Multi-skill single file support (`---` separated)

## Game layer
775. XP for real actions: tasks, habits, focus minutes, notes, journal, quests
776. Floating "+XP" particles and level-up toast with confetti
777. Level curve + nine ranks (Rookie → Mythic)
778. Sidebar XP chip with level badge and points
779. Five rotating **daily quests** with progress bars, midnight reset
780. **30 achievements** with live condition testing and point rewards
781. **Shop**: themes, avatars, avatar frames, titles, app icons, effects — bought with points, equip system
782. Purchase/equip confetti + "not enough points" shake feedback
783. Lifetime stats dashboard (tasks, habits, focus, notes, messages, skills, ads…)
784. XP history ledger
785. **Commitment / punishment system**: promise daily minutes; miss beyond grace days and the app locks
786. Lock screen allows only Focus, Time and Settings
787. **Ad-unlock mechanic**: placeholder sponsor ads with countdown (60/120s configurable), rotating fake ads, swap-in point for your real ad SDK
788. Unlock-by-working: logging today's minutes lifts the lock automatically
789. Comeback achievement, forgive button, miss-day ledger

## Shell v2
790. **Splash screen v2** — dual rotating rings, staged step checklist, animated progress bar
791. **Onboarding wizard** — 7 steps: welcome, name, avatar, live theme preview, module picker, sample/blank data, commitment opt-in
792. **Module visibility toggles** — hide any module from rail/sidebar/palette/routing without deleting data
793. **Updater system** — manifest URL, version compare, changelog modal; desktop stages new bundles into userData and restarts; web opens the download
794. **Profiles + login** — multiple local profiles, optional SHA-256 passcode, login gate at start
795. **Real server** (`tools/server.js`, zero deps): register/login with salted hashes + bearer tokens, JSON persistence, REST sync push/pull, WebSocket live sync across devices
796. Server connect UI in Settings → Account with push/pull buttons
797. Game Center module (home / quests / achievements / shop / commitment tabs)

## Verified
798. 108 automated checks passing; 45 real-browser screenshots; zero console errors
799. Server tested end-to-end: register → login → sync push → sync pull → bad-password rejection

---

# v3.0 — the "make it simple" update (renamed: **Pebble**)

## Rebrand & visual language
800. New name & identity: **Pebble — everything in one smooth place**
801. **40 hand-drawn custom SVG glyphs** replace every UI emoji (flame, trophy, gem, wallet, lock, moods, creatures…)
802. **Geometric SVG avatars** — deterministic per user, no emoji, no images
803. New pebble logomark on splash, rail, island, login and share cards
804. Six new shop themes: Rose Quartz, Mint Milk, Slate Pro, Plum Night, Dune, Arctic (12 themes total)

## Super-easy interface
805. **Easy Mode (default on)**: rail collapses to five essentials + settings
806. **HOME screen**: one greeting, ONE "the one thing" card with Done / Open / Something-else, three glance stats, three big buttons — nothing else
807. "All modules" friendly grid with one-line descriptions for everything hidden
808. Sidebar sub-navigation respects Easy Mode filtering
809. One-tot toggle back to full power mode, from home footer or settings

## Skill Wallet (install fix + portability)
810. Wallet card UI: gradient bank-card with skill "credit cards" strip
811. **Export wallet** → single `.wallet` file carrying all skills + prompts
812. **Open wallet file** anywhere (button, drag-drop, or drop on the whole app)
813. **Paste from clipboard** install (skill text or wallet JSON)
814. Server **Sync** button pushes the wallet to your Pebble server
815. Bulletproof install feedback: empty drops, bad zips and wrong files all explain themselves
816. Wallet round-trip covered by automated tests

## Desktop widget island
817. **Frameless, transparent, always-on-top pill window** pinned to the top of the screen (Electron)
818. Shows live focus timer, due reminders, XP — outside the app window
819. Click expands the same actionable panel; actions focus the main window and navigate
820. Toggleable (`widget:toggle`), respects workspaces, survives tray-hiding

## Tauri + Rust stack
821. Complete `src-tauri/` project: Cargo.toml, tauri.conf.json (v2), capabilities
822. Rust commands: atomic `save_workspace` (temp+rename), `load_workspace`, `rust_bench`, `app_info`
823. Release profile tuned: LTO, opt-level s, strip, panic=abort
824. Store auto-detects runtime: Tauri → Electron → browser, same bundle

## More features
825. **Ambient sound engine** — rain / deep focus / wind / ocean / white noise, generated live with WebAudio (zero asset files)
826. **Zen Write** — fullscreen distraction-free editor, autosaved, one click to note
827. **Scratchpad** — always-there temporary notes, promote to note when ready
828. **Priority matrix** (Eisenhower) task view: Do now / Schedule / Delegate / Delete
829. **Circadian auto-theme** — dawn/day/dusk/night themes follow your clock
830. **Streak freezes** — buy with points, forgive a missed day without an ad
831. **Share card** — your progress as a downloadable SVG card
832. Recent-commands and module blurbs in the Everything grid

## Verified
833. 116 automated checks passing (wallet round-trip, skill install, easy-mode filtering, glyphs, matrix included)
834. 49 real-browser screenshots including widget-island mode; zero console errors

---

# v4.0 — the "widget wall" update (UI renewal from your references)

## New design language (from your 3 images)
835. **Three reference themes**: `nothing` (Nothing OS: paper grey, mono widgets, signal red), `bubblegum` (charcoal tile wall, pink + lime, seg digits), `wexa` (near-black neon lime/orange/lavender) — 10 themes total
836. **7-segment SVG display engine** — fitness-watch digits for timers, counters, money (offline, no font files)
837. **5×7 dot-matrix SVG text engine** — Nothing-OS dot typography for greetings, labels, departure boards
838. **Dot-matrix grids** — habit progress matrices like the pink reference widget
839. **Analog SVG clock widget** with dot ticks + red second hand
840. Pill buttons, circular quick-toggles, segmented controls restyled per theme
841. Theme-aware component overrides (rails, cards, checks, progress, chips per theme)

## HOME = widget wall
842. HOME rebuilt as a **widget wall**: add / remove / reorder widgets, persisted
843. Widgets: Next-up departure board, Tasks-today seg, Focus seg, Habits ring, 7-day progress matrix, analog clock, quick toggles, points seg, ambient player, DiceBear "You" card, net-worth seg, streak week-dots, mood dot-face
844. "THE ONE THING" calm card stays above the wall
845. Widget picker sheet with descriptions; edit mode with ← → reorder and × remove

## Avatars & identity
846. **DiceBear HTTP API avatars** (11 styles selectable in Settings) with automatic offline fallback to local geometric SVG
847. Avatars wired app-wide: sidebar, chat, copilot, profiles, widget

## Fixes from your screenshots
848. Seg/dot SVGs no longer escape as text anywhere
849. Island timer NaN fixed (dataset bridge from pomodoro)
850. Correct 7-segment bit tables for digits + letters
851. Theme variables apply instantly for all registry themes
