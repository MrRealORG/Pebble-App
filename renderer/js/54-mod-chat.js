/* ============================================================
   Pebble — mod-chat.js : Discord-style servers, channels,
   threads, roles, reactions, mentions, presence, DMs, search
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, esc, iconHTML } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  let currentServer = NX.localStore.get('nexadesk.chatServer', null);
  let currentChannel = NX.localStore.get('nexadesk.chatChannel', null);
  let showMembers = NX.localStore.get('nexadesk.chatMembers', true);
  let replyTo = null;
  let editingId = null;
  let typingNames = [];
  let botTimer = null;

  const QUICK_EMOJI = ['👍', '❤️', '😂', '🎉', '🔥', '👀', '✅', '🚀', '💯', '😅', '🤔', '👏'];

  function ensureDefaults() {
    if (!currentServer || !store().servers.find(currentServer)) {
      currentServer = (store().servers.all().find(s => !s.isDM) || store().servers.all()[0] || {}).id;
    }
    const chans = sel().serverChannels(currentServer);
    if (!currentChannel || !chans.find(c => c.id === currentChannel)) currentChannel = (chans[0] || {}).id;
  }

  function render(params) {
    ensureDefaults();
    if (params && params.channel) {
      currentChannel = params.channel;
      const ch = store().channels.find(params.channel);
      if (ch) currentServer = ch.serverId;
    }
    const wrap = h('div.chat-layout' + (showMembers ? '' : '.no-members'));
    wrap.appendChild(serverColumn());
    wrap.appendChild(mainColumn(params));
    if (showMembers) wrap.appendChild(membersColumn());
    markRead();
    startSimulatedPresence();
    return wrap;
  }

  function onMount() {
    const onKey = e => {
      if (NX.router.currentId() !== 'chat') return;
      if (e.key === 'Escape' && replyTo) { replyTo = null; renderComposerReply(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); clearInterval(botTimer); };
  }

  /* =====================================================================
     LEFT COLUMN — servers + channels
     ===================================================================== */
  function serverColumn() {
    const col = h('div.chat-servers');
    const srv = store().servers.find(currentServer);
    col.appendChild(h('div.cs-head', [
      h('span', { style: { fontSize: '16px' } }, srv ? srv.icon : '🚀'),
      h('span.cs-name', srv ? srv.name : 'Workspace'),
      h('button.icon-btn', { html: iconHTML('chevD', 15), onclick: e => serverMenu(e.currentTarget) })
    ]));

    // channel list grouped by category
    const list = h('div.cs-list');
    const chans = sel().serverChannels(currentServer);
    const cats = NX.unique(chans.map(c => c.category || 'Channels'));
    cats.forEach(cat => {
      const inCat = chans.filter(c => (c.category || 'Channels') === cat);
      if (!inCat.length) return;
      list.appendChild(h('div.cs-cat', [
        h('span', { html: iconHTML('chevD', 11), style: { display: 'flex' } }),
        h('span.grow', cat),
        h('button.icon-btn', { html: iconHTML('plus', 12), title: 'New channel', onclick: () => newChannel(cat) })
      ]));
      inCat.forEach(c => {
        const unread = sel().unreadCount(c.id);
        list.appendChild(h('div.cs-ch' + (c.id === currentChannel ? '.on' : '') + (unread ? '.unread' : ''), {
          onclick: () => switchChannel(c.id)
        }, [
          h('span.ch-hash', c.type === 'dm' ? '@' : (c.type === 'voice' ? '🔊' : '#')),
          h('span.ch-name', c.name),
          unread ? h('span.ch-unread', unread > 9 ? '9+' : String(unread)) : null,
          h('span.row-actions', [h('button', { html: iconHTML('more', 12), onclick: e => { e.stopPropagation(); NX.ui.dropdown(e.currentTarget, channelMenu(c), { right: true }); } })])
        ]));
      });
    });
    if (!chans.length) list.appendChild(h('p.small.muted', { style: { padding: '12px' } }, 'No channels yet.'));
    list.appendChild(h('button.task-add', { style: { marginTop: '8px' }, onclick: () => newChannel() }, [h('span', { html: iconHTML('plus', 13) }), 'Create channel']));
    col.appendChild(list);

    // user panel
    const me = sel().me();
    const role = sel().roleOf(me.id);
    col.appendChild(h('div.cs-user', [
      NX.ui.avatar(me.name, me.color, 'sm', store().getSetting('userStatus', 'online')),
      h('div.grow', { style: { minWidth: '0' } }, [
        h('div.cu-name', me.displayName || me.name),
        h('div.cu-status', role.name ? role.name : 'Member')
      ]),
      h('button.icon-btn', { html: iconHTML('bell', 14), title: 'Mute notifications', onclick: () => { const on = store().getSetting('notificationsEnabled', true); store().setSetting('notificationsEnabled', !on); NX.ui.toast({ message: 'Notifications ' + (!on ? 'on' : 'muted'), duration: 1600 }); } }),
      h('button.icon-btn', { html: iconHTML('settings', 14), title: 'Status & profile', onclick: e => NX.ui.dropdown(e.currentTarget, statusMenu(), { right: true, up: true }) })
    ]));
    return col;
  }

  function statusMenu() {
    return [
      { header: 'Set status' },
      ...['online', 'idle', 'dnd', 'offline'].map(s => ({
        label: s === 'dnd' ? 'Do not disturb' : s[0].toUpperCase() + s.slice(1), checked: store().getSetting('userStatus') === s,
        onClick: () => { store().setSetting('userStatus', s); NX.shell.updateUserFooter(); NX.router.render(); }
      })),
      '-',
      { icon: 'edit', label: 'Change display name…', onClick: async () => {
          const v = await NX.ui.prompt({ title: 'Display name', value: store().getSetting('userName', 'You') });
          if (v) { store().setSetting('userName', v); const me = sel().me(); store().members.update(me.id, { name: v, displayName: v }); NX.shell.updateUserFooter(); NX.router.render(); }
        } },
      { icon: 'palette', label: 'Change my colour…', onClick: () => {
          const me = sel().me();
          NX.ui.modal({ title: 'Your colour', size: 'narrow', hideFooter: true, body: h('div.row-wrap', { style: { gap: '8px' } }, NX.ui.COLORS.map(c =>
            h('button.color-dot', { style: { background: c, width: '34px', height: '34px' }, onclick: () => { store().members.update(me.id, { color: c }); NX.ui.closeTopModal(); NX.router.render(); } }))) });
        } },
      { icon: showMembers ? 'eyeOff' : 'eye', label: (showMembers ? 'Hide' : 'Show') + ' member list', onClick: () => { showMembers = !showMembers; NX.localStore.set('nexadesk.chatMembers', showMembers); NX.router.render(); } }
    ];
  }

  function serverMenu(anchor) {
    NX.ui.dropdown(anchor, [
      { header: 'Switch workspace' },
      ...store().servers.all().map(s => ({ emoji: s.icon, label: s.name, checked: s.id === currentServer, onClick: () => { currentServer = s.id; currentChannel = null; NX.localStore.set('nexadesk.chatServer', s.id); ensureDefaults(); NX.router.render(); } })),
      '-',
      { icon: 'plus', label: 'New server…', onClick: newServer },
      { icon: 'users', label: 'Manage members…', onClick: manageMembers },
      { icon: 'shield', label: 'Manage roles…', onClick: manageRoles },
      { icon: 'edit', label: 'Server settings…', onClick: () => editServer(currentServer) },
      '-',
      { icon: 'search', label: 'Search all messages', key: 'Ctrl+F', onClick: () => messageSearch() },
      { icon: 'bell', label: 'Mark everything read', onClick: markAllRead },
      '-',
      { icon: 'sparkle', label: 'AI: summarise this channel', onClick: () => summarizeChannel() },
      { icon: 'download', label: 'Export channel as Markdown', onClick: () => exportChannel() },
      '-',
      { icon: 'trash', label: 'Delete server', danger: true, onClick: async () => {
          const s = store().servers.find(currentServer);
          if (await NX.ui.confirmDelete(`the server “${s.name}”`, 'All its channels and messages will be removed.')) {
            sel().serverChannels(currentServer).forEach(c => { store().messages.all().filter(m => m.channelId === c.id).forEach(m => store().messages.remove(m.id, true)); store().channels.remove(c.id, true); });
            store().servers.remove(currentServer);
            currentServer = null; ensureDefaults(); store().touch(); store().emit('channels');
            NX.router.render();
          }
        } }
    ], { right: true, up: true });
  }

  function channelMenu(c) {
    return [
      { icon: 'edit', label: 'Edit channel…', onClick: () => editChannel(c.id) },
      { icon: 'bell', label: 'Mark as read', onClick: () => { store().channels.update(c.id, { lastRead: Date.now() }); NX.router.render(); } },
      { icon: 'pin', label: 'Pinned messages', onClick: () => showPinned(c.id) },
      { icon: 'search', label: 'Search this channel', onClick: () => messageSearch(c.id) },
      { icon: 'sparkle', label: 'AI: summarise', onClick: () => summarizeChannel(c.id) },
      { icon: 'download', label: 'Export as Markdown', onClick: () => exportChannel(c.id) },
      '-',
      { icon: 'copy', label: 'Copy channel link', onClick: () => NX.copyText(location.origin + location.pathname + '#/chat?channel=' + c.id).then(() => NX.ui.toast({ message: 'Link copied', duration: 1500 })) },
      { icon: 'trash', label: 'Delete channel', danger: true, onClick: async () => {
          if (await NX.ui.confirmDelete(`#${c.name}`, 'Every message in this channel will be deleted.')) {
            store().messages.all().filter(m => m.channelId === c.id).forEach(m => store().messages.remove(m.id, true));
            store().channels.remove(c.id);
            if (currentChannel === c.id) currentChannel = null;
            store().touch(); store().emit('channels');
            NX.router.render();
          }
        } }
    ];
  }

  function switchChannel(id) {
    currentChannel = id;
    NX.localStore.set('nexadesk.chatChannel', id);
    const ch = store().channels.find(id);
    if (ch) { currentServer = ch.serverId; NX.localStore.set('nexadesk.chatServer', ch.serverId); }
    replyTo = null; editingId = null;
    markRead();
    NX.router.render();
    setTimeout(() => { const sc = document.getElementById('chatScroll'); if (sc) sc.scrollTop = sc.scrollHeight; const ta = document.getElementById('composerInput'); if (ta) ta.focus(); }, 60);
  }

  function markRead() {
    if (!currentChannel) return;
    const ch = store().channels.find(currentChannel);
    if (ch && (ch.lastRead || 0) < Date.now()) { store().channels.patchSilent(currentChannel, { lastRead: Date.now() }); store().touch(); }
    NX.shell.updateBadges();
  }
  function markAllRead() {
    store().channels.all().forEach(c => store().channels.patchSilent(c.id, { lastRead: Date.now() }));
    store().touch(); store().emit('channels');
    NX.router.render();
    NX.ui.toast({ type: 'success', message: 'All channels marked read' });
  }

  /* =====================================================================
     MAIN COLUMN
     ===================================================================== */
  function mainColumn(params) {
    const ch = store().channels.find(currentChannel);
    const col = h('div.chat-main');
    if (!ch) { col.appendChild(NX.ui.emptyState('chat', 'No channel selected', 'Create a channel to start talking.')); return col; }

    // header
    col.appendChild(h('div.chat-head', [
      h('span', { style: { color: 'var(--tx-4)', fontSize: '19px', fontWeight: '400' } }, ch.type === 'dm' ? '@' : '#'),
      h('div', { style: { minWidth: '0' } }, [
        h('div.ch-title', ch.name),
        ch.topic ? h('div.ch-topic', ch.topic) : null
      ]),
      h('div.grow'),
      h('button.icon-btn', { html: iconHTML('pin', 16), title: 'Pinned messages', onclick: () => showPinned(ch.id) }),
      h('button.icon-btn', { html: iconHTML('search', 16), title: 'Search messages', onclick: () => messageSearch(ch.id) }),
      h('button.icon-btn', { html: iconHTML('sparkle', 16), title: 'AI: summarise channel', onclick: () => summarizeChannel(ch.id) }),
      h('button.icon-btn', { html: iconHTML('bell', 16), title: 'Notifications for this channel', onclick: e => NX.ui.dropdown(e.currentTarget, [
        { label: 'Mute this channel', onClick: () => { store().channels.update(ch.id, { muted: !ch.muted }); NX.ui.toast({ message: ch.muted ? 'Unmuted' : 'Muted' }); } },
        { label: 'Mark as read', onClick: () => { store().channels.update(ch.id, { lastRead: Date.now() }); NX.router.render(); } },
        { label: 'Mark as unread', onClick: () => { store().channels.update(ch.id, { lastRead: 0 }); NX.router.render(); } }
      ], { right: true }) }),
      h('button.icon-btn' + (showMembers ? '.on' : ''), { html: iconHTML('users', 16), title: 'Toggle member list', onclick: () => { showMembers = !showMembers; NX.localStore.set('nexadesk.chatMembers', showMembers); NX.router.render(); } }),
      h('button.icon-btn', { html: iconHTML('edit', 16), title: 'Channel settings', onclick: () => editChannel(ch.id) })
    ]));

    // messages
    const scroll = h('div.chat-msgs', { id: 'chatScroll' });
    const msgs = sel().channelMessages(ch.id);
    if (!msgs.length) {
      scroll.appendChild(h('div', { style: { padding: '40px 24px', textAlign: 'center' } }, [
        h('div', { style: { width: '62px', height: '62px', borderRadius: '99px', background: 'var(--bg-active)', display: 'grid', placeItems: 'center', margin: '0 auto 14px', fontSize: '28px' } }, ch.type === 'dm' ? '@' : '#'),
        h('h3', { style: { fontSize: '19px', marginBottom: '5px' } }, ch.type === 'dm' ? `This is the beginning of your conversation with ${ch.name}` : `Welcome to #${ch.name}!`),
        h('p.small.muted', ch.topic || 'Say something. Markdown works: **bold**, *italic*, `code`, ```blocks```, > quotes.'),
        h('div.row-wrap', { style: { justifyContent: 'center', gap: '6px', marginTop: '16px' } }, ['👋 Say hello', '📋 What is this channel for?', '✨ Ask the AI bot'].map(s =>
          h('button.btn.sm.subtle', { onclick: () => { const ta = document.getElementById('composerInput'); if (ta) { ta.value = s.replace(/^[^\s]+\s/, ''); ta.focus(); ta.dispatchEvent(new Event('input')); } } }, s)))
      ]));
    } else {
      let lastDay = null, lastAuthor = null, lastTime = 0;
      msgs.forEach(m => {
        const dk = NX.ymd(m.created);
        if (dk !== lastDay) {
          lastDay = dk; lastAuthor = null;
          scroll.appendChild(h('div.msg-day-sep', h('span', NX.isToday(dk) ? 'Today' : NX.isYesterday(dk) ? 'Yesterday' : NX.fmtDate(dk, 'long'))));
        }
        const grouped = lastAuthor === m.authorId && (new Date(m.created) - lastTime) < 5 * 60000 && !m.replyTo && !m.system;
        scroll.appendChild(renderMessage(m, grouped, params && params.focus === m.id));
        lastAuthor = m.authorId; lastTime = new Date(m.created);
      });
    }
    col.appendChild(scroll);

    // typing indicator
    col.appendChild(h('div.msg-typing', { id: 'typingBar' }));

    // reply preview
    col.appendChild(h('div', { id: 'replyBar' }));

    // composer
    col.appendChild(composer(ch));

    setTimeout(() => {
      scroll.scrollTop = scroll.scrollHeight;
      if (params && params.focus) { const el = document.querySelector(`[data-msg="${params.focus}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.style.background = 'var(--sel)'; setTimeout(() => el.style.background = '', 2200); } }
    }, 50);
    return col;
  }

  function renderMessage(m, grouped, highlight) {
    const author = sel().member(m.authorId);
    const role = sel().roleOf(m.authorId);
    const me = sel().me();
    const isMine = m.authorId === me.id;
    const row = h('div.msg-group', { dataset: { msg: m.id }, style: highlight ? { background: 'var(--sel)' } : null, id: grouped ? null : null });

    if (m.system) {
      row.style.padding = '6px 16px';
      row.appendChild(h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start', width: '100%' } }, [
        h('span', { html: iconHTML('sparkle', 15), style: { color: author.color || 'var(--acc-grn)', marginTop: '3px', display: 'flex' } }),
        h('div.grow', [
          h('div.msg-head', [h('span.msg-author', { style: { color: author.color } }, author.displayName || author.name), h('span.msg-role', { style: { background: (role.color || '#8b8f98') + '22', color: role.color } }, role.name), h('span.msg-time', NX.fmtTime(m.created))]),
          h('div.msg-text', { html: NX.ai.renderMarkdown(m.text) })
        ])
      ]));
      return row;
    }

    row.appendChild(h('div.msg-avatar', grouped
      ? h('span', { style: { width: '38px', textAlign: 'center', fontSize: '10px', color: 'var(--tx-4)', opacity: '0', paddingTop: '4px' }, title: NX.fmtTime(m.created) }, NX.fmtTime(m.created).replace(/\s?[AP]M/i, ''))
      : h('div', { style: { cursor: 'pointer' }, onclick: () => showProfile(author.id) }, NX.ui.avatar(author.displayName || author.name, author.color, '', author.status))));

    const body = h('div.msg-body');
    if (!grouped) {
      body.appendChild(h('div.msg-head', [
        h('span.msg-author', { style: { color: author.color }, onclick: () => showProfile(author.id) }, author.displayName || author.name),
        author.bot ? h('span.msg-role', { style: { background: 'var(--acc-grn-bg)', color: 'var(--acc-grn)' } }, 'BOT') : null,
        role.name && !author.bot ? h('span.msg-role', { style: { background: (role.color || '#8b8f98') + '22', color: role.color || 'var(--tx-3)' } }, role.name) : null,
        isMine ? h('span.tiny', { style: { color: 'var(--tx-4)' } }, 'you') : null,
        h('span.msg-time', NX.fmtDateTime(m.created, 'short') + ' ' + NX.fmtTime(m.created)),
        m.pinned ? h('span', { html: iconHTML('pin', 11), style: { color: 'var(--acc-yel)', display: 'flex' }, title: 'Pinned' }) : null,
        m.edited ? h('span.tiny.muted', '(edited)') : null
      ]));
    }
    if (m.replyTo) {
      const orig = store().messages.find(m.replyTo);
      if (orig) {
        const oa = sel().member(orig.authorId);
        body.appendChild(h('div.msg-reply-ref', { style: { cursor: 'pointer' }, onclick: () => { const el = document.querySelector(`[data-msg="${orig.id}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.style.background = 'var(--sel)'; setTimeout(() => el.style.background = '', 1800); } } }, [
          h('b', { style: { color: oa.color } }, oa.displayName || oa.name),
          h('span.nowrap', { style: { maxWidth: '380px' } }, String(orig.text).slice(0, 90))
        ]));
      }
    }

    // text with markdown + mentions
    let html = NX.ai.renderMarkdown(m.text);
    html = html.replace(/@([\w-]+)/g, (full, name) => {
      const mem = store().members.all().find(x => (x.name || '').toLowerCase() === name.toLowerCase() || (x.displayName || '').toLowerCase() === name.toLowerCase());
      return mem ? `<span class="mention-txt" data-user="${mem.id}" style="color:${mem.color};background:${mem.color}22">@${esc(mem.displayName || mem.name)}</span>` : full;
    });
    // big-emoji-only messages
    const onlyEmoji = /^(\p{Extended_Pictographic}|\uFE0F|\s){1,8}$/u.test(m.text || '');
    body.appendChild(h('div.msg-text' + (onlyEmoji ? '' : ''), { html: onlyEmoji ? `<span class="emoji-big">${m.text}</span>` : html }));

    // attachments
    if ((m.attachments || []).length) {
      body.appendChild(h('div.msg-attach', m.attachments.map(a => a.type && a.type.startsWith('image/')
        ? h('img', { src: a.src, alt: a.name, onclick: () => NX.ui.viewImage(a.src, a.name) })
        : h('div.block.t-file', [h('span', '📎'), h('div.grow', [h('div.small.strong', a.name), h('div.tiny.muted', NX.fmtBytes(a.size || 0))]), a.src ? h('a.btn.sm.subtle', { href: a.src, download: a.name }, 'Download') : null]))));
    }

    // reactions
    const byEmoji = new Map();
    (m.reactions || []).forEach(r => { if (!byEmoji.has(r.emoji)) byEmoji.set(r.emoji, []); byEmoji.get(r.emoji).push(r.userId); });
    if (byEmoji.size) {
      body.appendChild(h('div.msg-reactions', Array.from(byEmoji.entries()).map(([emoji, users]) =>
        h('button.msg-react' + (users.includes(me.id) ? '.mine' : ''), {
          title: users.map(u => (sel().member(u).displayName || sel().member(u).name)).join(', '),
          onclick: () => toggleReaction(m.id, emoji)
        }, [h('span', emoji), h('span', String(users.length))]))));
    }

    // hover actions
    const actions = h('div.msg-actions', [
      h('button', { html: '😀', title: 'Add reaction', onclick: e => reactionPicker(e.currentTarget, m.id) }),
      h('button', { html: iconHTML('send', 13), title: 'Reply', onclick: () => { replyTo = m.id; renderComposerReply(); const ta = document.getElementById('composerInput'); if (ta) ta.focus(); } }),
      h('button', { html: iconHTML('sparkle', 13), title: 'AI actions', onclick: e => NX.ui.dropdown(e.currentTarget, [
        { icon: 'sparkle', label: 'Summarise thread from here', onClick: () => summarizeFrom(m.id) },
        { icon: 'edit', label: 'Rewrite this message', onClick: () => rewriteMessage(m.id) },
        { icon: 'task', label: 'Extract tasks from this message', onClick: () => extractTasksFromMessage(m.id) },
        { icon: 'note', label: 'Save to a note', onClick: () => saveMessageToNote(m.id) },
        { icon: 'globe', label: 'Translate…', onClick: async () => { const l = await NX.ui.prompt({ title: 'Translate to', value: 'Spanish' }); if (!l) return; const r = await NX.ai.features.translate(m.text, l); NX.ui.modal({ title: 'Translation — ' + l, body: h('div.md-preview', { html: NX.ai.renderMarkdown(r.text) }) }); } }
      ], { right: true }) }),
      isMine ? h('button', { html: iconHTML('edit', 13), title: 'Edit', onclick: () => startEdit(m.id) }) : null,
      h('button', { html: iconHTML('pin', 13), title: m.pinned ? 'Unpin' : 'Pin', onclick: () => { store().messages.update(m.id, { pinned: !m.pinned }); NX.router.render(); } }),
      h('button', { html: iconHTML('link', 13), title: 'Copy link', onclick: () => NX.copyText(location.origin + location.pathname + '#/chat?channel=' + m.channelId + '&focus=' + m.id).then(() => NX.ui.toast({ message: 'Link copied', duration: 1500 })) }),
      h('button', { html: iconHTML('copy', 13), title: 'Copy text', onclick: () => NX.copyText(m.text).then(() => NX.ui.toast({ message: 'Copied', duration: 1400 })) }),
      isMine || canManage() ? h('button', { html: iconHTML('trash', 13), title: 'Delete', onclick: async () => { if (await NX.ui.confirmDelete('this message')) { store().messages.remove(m.id); NX.router.render(); } } }) : null
    ].filter(Boolean));
    row.appendChild(actions);

    row.appendChild(body);
    NX.ui.bindMenu(row, () => [
      { emoji: '↩️', label: 'Reply', onClick: () => { replyTo = m.id; renderComposerReply(); } },
      { emoji: '📌', label: m.pinned ? 'Unpin message' : 'Pin message', onClick: () => { store().messages.update(m.id, { pinned: !m.pinned }); NX.router.render(); } },
      { emoji: '📋', label: 'Copy text', onClick: () => NX.copyText(m.text) },
      { emoji: '🔗', label: 'Copy message link', onClick: () => NX.copyText(location.origin + location.pathname + '#/chat?channel=' + m.channelId + '&focus=' + m.id) },
      { emoji: '📝', label: 'Save to a note', onClick: () => saveMessageToNote(m.id) },
      { emoji: '✅', label: 'Turn into a task', onClick: () => { store().tasks.create({ title: m.text.slice(0, 100), description: `From ${(sel().member(m.authorId).displayName || 'chat')} in #${(store().channels.find(m.channelId) || {}).name}: "${m.text}"`, projectId: null, status: 'To Do', priority: 'Medium', due: null, repeat: null, tags: [], checklist: [], estimate: 0, order: 0, done: false, archived: false }); NX.ui.toast({ type: 'success', message: 'Task created' }); } },
      { emoji: '⏰', label: 'Remind me about this', onClick: async () => { const mins = await NX.ui.prompt({ title: 'Remind me in (minutes)', value: '60' }); if (mins) { store().reminders.create({ title: 'Chat: ' + m.text.slice(0, 60), body: `#${(store().channels.find(m.channelId) || {}).name}`, at: NX.addMinutes(new Date(), Number(mins) || 60).toISOString(), done: false, priority: 'normal', deepLink: '#/chat?channel=' + m.channelId }); NX.ui.toast({ type: 'success', message: 'Reminder set' }); } } },
      '-',
      ...(isMine || canManage() ? [{ emoji: '🗑️', label: 'Delete message', danger: true, onClick: async () => { if (await NX.ui.confirmDelete('this message')) { store().messages.remove(m.id); NX.router.render(); } } }] : [])
    ]);
    return row;
  }

  function canManage() {
    const me = sel().me();
    const role = sel().roleOf(me.id);
    return (role.permissions || []).includes('manage') || (role.permissions || []).includes('admin');
  }

  function toggleReaction(msgId, emoji) {
    const m = store().messages.find(msgId);
    if (!m) return;
    const me = sel().me();
    const list = (m.reactions || []).slice();
    const i = list.findIndex(r => r.emoji === emoji && r.userId === me.id);
    if (i >= 0) list.splice(i, 1); else list.push({ emoji, userId: me.id });
    store().messages.update(msgId, { reactions: list }, true);
    store().touch();
    rerenderMessages();
  }

  function reactionPicker(anchor, msgId) {
    const pop = h('div.dropdown-menu', { style: { position: 'fixed', display: 'flex', gap: '2px', padding: '5px' } });
    QUICK_EMOJI.forEach(e => pop.appendChild(h('button', { style: { fontSize: '18px', padding: '3px 5px', borderRadius: '5px' }, onmouseover: ev => ev.target.style.background = 'var(--bg-hover)', onmouseout: ev => ev.target.style.background = '', onclick: () => { NX.ui.closeMenu(); toggleReaction(msgId, e); } }, e)));
    pop.appendChild(h('button', { style: { fontSize: '13px', padding: '3px 6px', color: 'var(--tx-3)' }, onclick: () => { NX.ui.closeMenu(); NX.ui.emojiPicker(anchor, e => toggleReaction(msgId, e)); } }, '＋'));
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect(), pr = pop.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pr.width - 8)) + 'px';
    pop.style.top = (r.top - pr.height - 6 < 8 ? r.bottom + 6 : r.top - pr.height - 6) + 'px';
    NX.ui.closeMenu.__keep = true;
    setTimeout(() => document.addEventListener('mousedown', function od(ev) { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('mousedown', od); } }), 0);
    // register for Escape
    const esc = ev => { if (ev.key === 'Escape') { pop.remove(); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);
  }

  function startEdit(msgId) {
    const m = store().messages.find(msgId);
    editingId = msgId;
    const ta = document.getElementById('composerInput');
    if (ta) { ta.value = m.text; ta.focus(); ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
    renderComposerReply();
  }

  function renderComposerReply() {
    const bar = document.getElementById('replyBar');
    if (!bar) return;
    NX.clear(bar);
    if (editingId) {
      const m = store().messages.find(editingId);
      bar.appendChild(h('div.composer-reply', [
        h('span', { html: iconHTML('edit', 13), style: { display: 'flex' } }),
        h('span', 'Editing your message'),
        h('div.grow'),
        h('button.icon-btn', { html: iconHTML('x', 14), onclick: () => { editingId = null; const ta = document.getElementById('composerInput'); if (ta) ta.value = ''; renderComposerReply(); } })
      ]));
      return;
    }
    if (!replyTo) return;
    const m = store().messages.find(replyTo);
    if (!m) { replyTo = null; return; }
    const a = sel().member(m.authorId);
    bar.appendChild(h('div.composer-reply', [
      h('span', 'Replying to'), h('b', { style: { color: a.color } }, a.displayName || a.name),
      h('span.nowrap.muted', { style: { maxWidth: '320px' } }, String(m.text).slice(0, 70)),
      h('div.grow'),
      h('button.icon-btn', { html: iconHTML('x', 14), title: 'Cancel reply (Esc)', onclick: () => { replyTo = null; renderComposerReply(); } })
    ]));
  }

  function composer(ch) {
    const wrap = h('div.chat-composer', { style: { position: 'relative' } });
    const box = h('div.composer-box');
    const ta = h('textarea', { id: 'composerInput', rows: 1, placeholder: `Message ${ch.type === 'dm' ? '@' + ch.name : '#' + ch.name}`, spellcheck: 'true' });
    box.appendChild(h('div.composer-tools', [
      h('button.icon-btn', { html: iconHTML('plus', 17), title: 'Attach a file', onclick: () => attachFiles() }),
      h('button.icon-btn', { html: iconHTML('task', 16), title: 'Attach a task from your workspace', onclick: () => attachTask() }),
      h('button.icon-btn', { html: iconHTML('note', 16), title: 'Share a note', onclick: () => shareNote() })
    ]));
    box.appendChild(ta);
    box.appendChild(h('div.composer-tools', [
      h('button.icon-btn', { html: iconHTML('smile', 17), title: 'Emoji', onclick: e => NX.ui.emojiPicker(e.currentTarget, em => { ta.value += em; ta.focus(); ta.dispatchEvent(new Event('input')); }) }),
      h('button.icon-btn', { html: iconHTML('sparkle', 17), title: 'AI assist', onclick: e => NX.ui.dropdown(e.currentTarget, [
        { header: 'AI writing tools' },
        { icon: 'edit', label: 'Improve my draft', onClick: () => aiAssist('improve') },
        { icon: 'minus', label: 'Make it shorter', onClick: () => aiAssist('shorten') },
        { icon: 'plus', label: 'Expand it', onClick: () => aiAssist('expand') },
        { icon: 'globe', label: 'Translate…', onClick: async () => { const l = await NX.ui.prompt({ title: 'Translate draft to', value: 'Spanish' }); if (l) aiAssist('translate', l); } },
        '-',
        { header: 'Change tone' },
        ...['professional', 'casual', 'friendly', 'concise'].map(t => ({ label: t[0].toUpperCase() + t.slice(1), onClick: () => aiAssist('tone', t) })),
        '-',
        { icon: 'send', label: 'Draft a reply to the last message', onClick: () => aiDraftReply() }
      ], { right: true, up: true }) }),
      h('button.icon-btn.primary', { html: iconHTML('send', 17), title: 'Send (Enter)', style: { color: 'var(--brand-1)' }, onclick: () => send(ch.id) })
    ]));
    wrap.appendChild(box);
    wrap.appendChild(h('div.row', { style: { marginTop: '5px', gap: '10px', padding: '0 3px' } }, [
      h('span.tiny.muted', 'Enter to send · Shift+Enter for a new line · @ to mention · markdown supported'),
      h('div.grow'),
      h('span.tiny.muted', `${sel().channelMessages(ch.id).length} messages`)
    ]));

    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(150, ta.scrollHeight) + 'px';
      handleMentionPopup(ta, wrap);
    });
    ta.addEventListener('keydown', e => {
      if (mentionOpen && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(e.key) && mentionHandleKey(e)) return;
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(ch.id); return; }
      if (e.key === 'Escape') { if (editingId) { editingId = null; ta.value = ''; renderComposerReply(); } if (replyTo) { replyTo = null; renderComposerReply(); } }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); wrapSel(ta, '**'); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); wrapSel(ta, '*'); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); wrapSel(ta, '`'); }
      if (e.key === 'ArrowUp' && !ta.value) {
        const mine = sel().channelMessages(ch.id).filter(m => m.authorId === sel().me().id).pop();
        if (mine) { e.preventDefault(); startEdit(mine.id); }
      }
    });
    ta.addEventListener('paste', e => {
      const files = Array.from(e.clipboardData.files || []);
      if (files.length) { e.preventDefault(); sendWithFiles(ch.id, files); }
    });
    return wrap;
  }

  function wrapSel(ta, mark) {
    const s = ta.selectionStart, e2 = ta.selectionEnd;
    const selText = ta.value.slice(s, e2);
    ta.value = ta.value.slice(0, s) + mark + selText + mark + ta.value.slice(e2);
    ta.focus(); ta.setSelectionRange(s + mark.length, e2 + mark.length);
  }

  /* ---------------- mention autocomplete ---------------- */
  let mentionOpen = false, mentionItems = [], mentionIdx = 0, mentionEl = null, mentionStart = -1;
  function handleMentionPopup(ta, wrap) {
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const m = before.match(/(?:^|\s)@([\w-]*)$/);
    if (!m) { closeMention(); return; }
    mentionStart = pos - m[1].length - 1;
    const q = m[1].toLowerCase();
    const srv = store().servers.find(currentServer);
    const memberIds = srv ? srv.memberIds : store().members.all().map(x => x.id);
    mentionItems = store().members.byIds(memberIds)
      .filter(x => !q || (x.name || '').toLowerCase().includes(q) || (x.displayName || '').toLowerCase().includes(q))
      .concat(q ? [] : [{ id: '__everyone', name: 'everyone', displayName: 'everyone', color: '#eb5757' },
                        { id: '__here', name: 'here', displayName: 'here', color: '#f2994a' }])
      .slice(0, 8);
    mentionIdx = 0;
    if (!mentionEl) { mentionEl = h('div.mention-pop'); }
    if (!mentionEl.parentElement) wrap.appendChild(mentionEl);
    mentionEl.hidden = false;
    NX.clear(mentionEl);
    mentionItems.forEach((x, i) => mentionEl.appendChild(h('button', {
      style: { display: 'flex', gap: '9px', alignItems: 'center', width: '100%', padding: '5px 8px', borderRadius: '6px', textAlign: 'left', background: i === 0 ? 'var(--sel)' : 'transparent' },
      onmousemove: () => { mentionIdx = i; paintMention(); },
      onclick: () => chooseMention(ta, x)
    }, [
      x.id.startsWith('__') ? h('span', { style: { fontSize: '13px' } }, x.id === '__everyone' ? '📢' : '📣') : NX.ui.avatar(x.displayName || x.name, x.color, 'xs', x.status),
      h('span', { style: { fontSize: '12.8px', fontWeight: '550' } }, x.displayName || x.name),
      h('span.tiny.muted', sel().roleOf(x.id).name || '')
    ])));
    mentionOpen = true;
  }
  function paintMention() { NX.$$('button', mentionEl).forEach((b, i) => b.style.background = i === mentionIdx ? 'var(--sel)' : 'transparent'); }
  function chooseMention(ta, x) {
    const name = x.displayName || x.name;
    ta.value = ta.value.slice(0, mentionStart) + '@' + name + ' ' + ta.value.slice(ta.selectionStart);
    closeMention();
    ta.focus();
    ta.setSelectionRange(mentionStart + name.length + 2, mentionStart + name.length + 2);
  }
  function closeMention() { mentionOpen = false; if (mentionEl) mentionEl.hidden = true; }
  function mentionHandleKey(e) {
    if (e.key === 'Escape') { closeMention(); return true; }
    if (e.key === 'ArrowDown') { e.preventDefault(); mentionIdx = Math.min(mentionItems.length - 1, mentionIdx + 1); paintMention(); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); mentionIdx = Math.max(0, mentionIdx - 1); paintMention(); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (!mentionItems.length) return false;
      e.preventDefault();
      chooseMention(document.getElementById('composerInput'), mentionItems[mentionIdx]);
      return true;
    }
    return false;
  }

  /* ---------------- send ---------------- */
  async function send(channelId) {
    const ta = document.getElementById('composerInput');
    const text = (ta.value || '').trim();
    if (!text) return;
    const me = sel().me();

    if (editingId) {
      store().messages.update(editingId, { text, edited: true });
      editingId = null; ta.value = ''; ta.style.height = 'auto';
      renderComposerReply(); rerenderMessages();
      return;
    }
    store().messages.create({
      authorId: me.id, channelId, text, reactions: [], attachments: [],
      replyTo: replyTo, threadId: null, edited: false, pinned: false, system: false
    }, true);
    store().touch(); store().emit('messages');
    replyTo = null;
    ta.value = ''; ta.style.height = 'auto';
    renderComposerReply();
    rerenderMessages();
    scrollBottom();
    maybeBotReply(text, channelId);
    // inbox + notification for mentions
    const mentions = (text.match(/@([\w-]+)/g) || []).map(x => x.slice(1).toLowerCase());
    if (mentions.length) {
      store().members.all().forEach(mm => {
        if (mentions.includes((mm.name || '').toLowerCase()) && mm.id !== me.id) {
          store().inbox.create({ type: 'chat', title: `You were mentioned by ${me.displayName || me.name}`, body: text.slice(0, 140), icon: 'chat', read: false, deepLink: '#/chat?channel=' + channelId, priority: 'normal' }, true);
        }
      });
      store().touch(); store().emit('inbox');
    }
  }

  async function sendWithFiles(channelId, files) {
    const ta = document.getElementById('composerInput');
    const text = (ta.value || '').trim();
    const attachments = [];
    for (const f of files) {
      const dataUrl = await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(String(rd.result)); rd.readAsDataURL(f); });
      attachments.push({ name: f.name, size: f.size, type: f.type, src: dataUrl });
    }
    store().messages.create({ authorId: sel().me().id, channelId, text, reactions: [], attachments, replyTo, edited: false, pinned: false, system: false }, true);
    store().touch(); store().emit('messages');
    ta.value = ''; replyTo = null; renderComposerReply();
    rerenderMessages(); scrollBottom();
  }

  async function attachFiles() {
    if (store().desktop && window.nex.openDialog) {
      const r = await window.nex.openDialog({ multiple: true });
      if (!r.ok) return;
      const atts = r.files.map(f => ({ name: f.name, size: f.size, type: guessMime(f.name), src: 'data:' + guessMime(f.name) + ';base64,' + f.data }));
      store().messages.create({ authorId: sel().me().id, channelId: currentChannel, text: '', reactions: [], attachments: atts, replyTo: null, edited: false, pinned: false, system: false });
      rerenderMessages(); scrollBottom(); return;
    }
    const inp = h('input', { type: 'file', multiple: true, style: { display: 'none' } });
    inp.onchange = () => sendWithFiles(currentChannel, Array.from(inp.files));
    document.body.appendChild(inp); inp.click(); setTimeout(() => inp.remove(), 4000);
  }
  function guessMime(name) {
    const ext = String(name).split('.').pop().toLowerCase();
    return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', json: 'application/json' }[ext] || 'application/octet-stream';
  }

  function attachTask() {
    const tasks = sel().openTasks();
    const list = h('div.list', { style: { maxHeight: '320px', overflow: 'auto' } });
    tasks.slice(0, 60).forEach(t => list.appendChild(h('button.list-row.selectable', { style: { width: '100%' }, onclick: () => {
      const ta = document.getElementById('composerInput');
      ta.value += (ta.value ? '\n' : '') + `**Task:** ${t.title}\nStatus: ${t.status} · Priority: ${t.priority}${t.due ? ' · Due: ' + NX.fmtDate(t.due, 'medium') : ''}${t.projectId ? ' · Project: ' + sel().projectName(t.projectId) : ''}`;
      ta.dispatchEvent(new Event('input'));
      NX.ui.closeTopModal(); ta.focus();
    } }, [h('span.ico', { html: iconHTML('task', 14) }), h('div.lr-main', [h('div.lr-title', t.title), h('div.lr-sub', t.status + ' · ' + t.priority)])])));
    NX.ui.modal({ title: 'Share a task', size: '', hideFooter: true, body: list.length ? list : h('p.small.muted', 'No open tasks.') });
  }

  function shareNote() {
    const notes = sel().recentNotes(30);
    const list = h('div.list', { style: { maxHeight: '320px', overflow: 'auto' } });
    notes.forEach(n => list.appendChild(h('button.list-row.selectable', { style: { width: '100%' }, onclick: () => {
      const ta = document.getElementById('composerInput');
      const summary = NX.aiEngine.summarize(sel().notePlain(n), 2);
      ta.value += (ta.value ? '\n\n' : '') + `📄 **${n.title || 'Untitled'}**\n> ${summary}\n_${sel().noteWordCount(n)} words · edited ${NX.relTime(n.updated)}_`;
      ta.dispatchEvent(new Event('input'));
      NX.ui.closeTopModal(); ta.focus();
    } }, [h('span', { style: { fontSize: '15px' } }, n.icon || '📄'), h('div.lr-main', [h('div.lr-title', n.title || 'Untitled'), h('div.lr-sub', sel().noteWordCount(n) + ' words · ' + NX.relTime(n.updated))])])));
    NX.ui.modal({ title: 'Share a note', size: '', hideFooter: true, body: list });
  }

  function rerenderMessages() {
    const scroll = document.getElementById('chatScroll');
    if (!scroll) { NX.router.render(); return; }
    const ch = store().channels.find(currentChannel);
    if (!ch) return;
    const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 120;
    const replacement = mainColumn({});
    const layout = scroll.closest('.chat-layout');
    if (layout) { const old = layout.querySelector('.chat-main'); if (old) old.replaceWith(replacement); }
    if (atBottom) scrollBottom();
    renderComposerReply();
  }
  function scrollBottom() { const s = document.getElementById('chatScroll'); if (s) s.scrollTop = s.scrollHeight; }

  /* ---------------- simulated presence & bot ---------------- */
  function startSimulatedPresence() {
    clearInterval(botTimer);
    botTimer = setInterval(() => {
      if (NX.router.currentId() !== 'chat') return;
      // occasionally show someone typing, then a message
      if (Math.random() > 0.25) return;
      const others = store().members.all().filter(m => m.id !== sel().me().id && !m.bot);
      if (!others.length) return;
      const who = NX.randomOf(others);
      const bar = document.getElementById('typingBar');
      if (bar) bar.innerHTML = `<span class="dots"><span></span><span></span><span></span></span> <b style="color:${who.color}">${NX.esc(who.displayName || who.name)}</b> is typing…`;
      setTimeout(() => {
        if (bar) bar.innerHTML = '';
        if (Math.random() > 0.55) return;
        const ch = store().channels.find(currentChannel);
        if (!ch || ch.type === 'dm') return;
        const lines = [
          'Looking at it now.', 'Good point — I had not considered that.', 'Can you put that in the doc?',
          'Agreed.', 'I will pick that up after lunch.', 'Just pushed a fix, can someone check?',
          'That matches what I saw in the beta data.', 'Let us revisit this tomorrow with fresh eyes.',
          '👍', 'Nice work on that.', 'Do we have a number for this yet?', 'I am blocked on the same thing.',
          'Adding it to the war-room checklist.', 'Sounds good to me.'
        ];
        store().messages.create({ authorId: who.id, channelId: ch.id, text: NX.randomOf(lines), reactions: [], attachments: [], replyTo: null, edited: false, pinned: false, system: false }, true);
        store().touch(); store().emit('messages');
        const scroll = document.getElementById('chatScroll');
        const wasBottom = scroll ? (scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 160) : true;
        rerenderMessages();
        if (wasBottom) scrollBottom();
        store().inbox.create({ type: 'chat', title: `${who.displayName || who.name} in #${ch.name}`, body: NX.randomOf(lines), icon: 'chat', read: false, deepLink: '#/chat?channel=' + ch.id, priority: 'low' }, true);
        store().touch();
      }, 1400 + Math.random() * 1800);
    }, 22000);
  }

  function maybeBotReply(text, channelId) {
    const ch = store().channels.find(channelId);
    if (!ch) return;
    const bot = store().members.all().find(m => m.bot);
    if (!bot) return;
    const lower = text.toLowerCase();
    const isCommand = /^(\/ask|\/ai|nexa|hey bot|@nexabot)/i.test(text.trim());
    const isDigest = /daily digest|what'?s on today|today'?s summary/i.test(lower);
    if (!isCommand && !isDigest && !/\?$/.test(text.trim()) && !/\b(summari[sz]e|explain|what do you think|help me)\b/i.test(lower)) return;
    const bar = document.getElementById('typingBar');
    if (bar) bar.innerHTML = `<span class="dots"><span></span><span></span><span></span></span> <b style="color:${bot.color}">NexaBot</b> is typing…`;
    setTimeout(async () => {
      if (bar) bar.innerHTML = '';
      let reply;
      try {
        if (isDigest) {
          const r = await NX.ai.features.dailyDigest();
          reply = r.text.slice(0, 900);
        } else {
          const q = text.replace(/^(\/ask|\/ai|nexa|hey bot|@nexabot)[,:]?\s*/i, '');
          const r = await NX.ai.features.chat(q, []);
          reply = r.text.slice(0, 900) + (r.source === 'offline' ? '\n\n_Offline retrieval — add an API key in Settings → AI for full reasoning._' : '');
        }
      } catch (e) { reply = 'I hit an error: ' + String(e.message || e); }
      store().messages.create({ authorId: bot.id, channelId, text: reply, reactions: [], attachments: [], replyTo: null, edited: false, pinned: false, system: true }, true);
      store().touch(); store().emit('messages');
      rerenderMessages(); scrollBottom();
    }, 900);
  }

  /* ---------------- AI channel tools ---------------- */
  async function summarizeChannel(channelId) {
    const id = channelId || currentChannel;
    const ch = store().channels.find(id);
    const msgs = sel().channelMessages(id);
    if (!msgs.length) { NX.ui.toast({ type: 'info', message: 'Nothing to summarise yet' }); return; }
    const text = msgs.map(m => `${sel().member(m.authorId).displayName || sel().member(m.authorId).name}: ${m.text}`).join('\n');
    const t = NX.ui.toast({ type: 'info', message: 'Summarising #' + ch.name + '…', duration: 0 });
    const r = await NX.ai.features.summarize(text);
    t.close();
    NX.ui.modal({
      title: `Summary of #${ch.name}`, subtitle: `${msgs.length} messages`, size: 'wide',
      body: h('div.md-preview', { html: NX.ai.renderMarkdown(r.text) }),
      footer: [
        h('span.small.muted.grow', r.source === 'api' ? 'via ' + NX.ai.providerInfo().name : 'via offline engine'),
        h('button.btn.ghost', { onclick: () => NX.copyText(r.text) }, 'Copy'),
        h('button.btn.primary', { onclick: () => {
            const bot = store().members.all().find(m => m.bot) || sel().me();
            store().messages.create({ authorId: bot.id, channelId: id, text: '**📋 Channel summary**\n\n' + r.text, reactions: [], attachments: [], replyTo: null, edited: false, pinned: false, system: true });
            NX.ui.closeTopModal(); rerenderMessages(); scrollBottom();
          } }, 'Post to channel')
      ]
    });
  }

  async function summarizeFrom(msgId) {
    const m = store().messages.find(msgId);
    const msgs = sel().channelMessages(m.channelId);
    const i = msgs.findIndex(x => x.id === msgId);
    const text = msgs.slice(i).map(x => `${sel().member(x.authorId).displayName || x.authorId}: ${x.text}`).join('\n');
    const t = NX.ui.toast({ type: 'info', message: 'Summarising…', duration: 0 });
    const r = await NX.ai.features.summarize(text);
    t.close();
    NX.ui.modal({ title: 'Summary from that message', size: 'wide', body: h('div.md-preview', { html: NX.ai.renderMarkdown(r.text) }) });
  }

  async function rewriteMessage(msgId) {
    const m = store().messages.find(msgId);
    const t = NX.ui.toast({ type: 'info', message: 'Rewriting…', duration: 0 });
    const r = await NX.ai.features.improve(m.text);
    t.close();
    NX.ui.modal({
      title: 'Rewritten message', size: '',
      body: h('div', [h('div.small.muted', { style: { marginBottom: '6px' } }, 'Original'), h('div.card.pad-sm', { style: { marginBottom: '12px', background: 'var(--bg-sunken)' } }, m.text),
        h('div.small.muted', { style: { marginBottom: '6px' } }, 'Rewritten'), h('div.card.pad-sm', { style: { background: 'var(--sel)' } }, r.text)]),
      footer: [h('div.grow'), h('button.btn.ghost', { onclick: () => NX.copyText(r.text) }, 'Copy'),
        h('button.btn.primary', { onclick: () => { store().messages.update(msgId, { text: r.text, edited: true }); NX.ui.closeTopModal(); rerenderMessages(); } }, 'Replace message')]
    });
  }

  async function extractTasksFromMessage(msgId) {
    const m = store().messages.find(msgId);
    const t = NX.ui.toast({ type: 'info', message: 'Extracting tasks…', duration: 0 });
    const r = await NX.ai.features.extractTasks(m.text);
    t.close();
    if (!r.tasks.length) { NX.ui.toast({ type: 'info', message: 'No tasks found in that message' }); return; }
    const ch = store().channels.find(m.channelId);
    r.tasks.forEach(a => store().tasks.create({
      title: a.title, description: `From ${sel().member(m.authorId).displayName || 'chat'} in #${ch ? ch.name : 'chat'}: "${m.text.slice(0, 200)}"`,
      projectId: null, status: 'To Do', priority: a.priority || 'Medium', due: a.due ? new Date(a.due).toISOString() : null,
      repeat: null, tags: [], checklist: [], estimate: 0, order: 0, done: false, archived: false
    }, true));
    store().touch(); store().emit('tasks');
    NX.ui.toast({ type: 'success', title: `${r.tasks.length} task(s) created`, duration: 4500, actions: [{ label: 'View', onClick: () => NX.router.navigate('#/tasks') }] });
  }

  function saveMessageToNote(msgId) {
    const m = store().messages.find(msgId);
    const ch = store().channels.find(m.channelId);
    const msgs = sel().channelMessages(m.channelId);
    const i = msgs.findIndex(x => x.id === msgId);
    const thread = msgs.slice(Math.max(0, i - 2), i + 8);
    const blocks = [
      NX.md.newBlock('h2', { text: `Conversation from #${ch ? ch.name : 'chat'}` }),
      NX.md.newBlock('text', { text: `Saved ${NX.fmtDateTime(new Date(), 'medium')}` }),
      NX.md.newBlock('divider'),
      ...thread.map(x => NX.md.newBlock('quote', { text: `**${(sel().member(x.authorId).displayName || '?')}** (${NX.fmtTime(x.created)}): ${x.text}` })),
      NX.md.newBlock('divider'),
      NX.md.newBlock('h2', { text: 'My notes' }),
      NX.md.newBlock('text')
    ];
    const n = store().notes.create({ title: `Chat: ${ch ? ch.name : ''} — ${NX.fmtDate(new Date(), 'medium')}`, icon: '💬', emoji: '💬', tags: [], parentId: null, order: 0, favorite: false, archived: false, properties: [], blocks });
    NX.ui.toast({ type: 'success', title: 'Saved to a note', duration: 4200, actions: [{ label: 'Open', primary: true, onClick: () => NX.router.go('notes', { id: n.id }) }] });
  }

  async function aiAssist(kind, arg) {
    const ta = document.getElementById('composerInput');
    if (!ta || !ta.value.trim()) { NX.ui.toast({ type: 'warn', message: 'Write something first' }); return; }
    const t = NX.ui.toast({ type: 'info', message: 'AI is working…', duration: 0 });
    try {
      let r;
      if (kind === 'improve') r = await NX.ai.features.improve(ta.value);
      else if (kind === 'shorten') r = await NX.ai.features.shorten(ta.value);
      else if (kind === 'expand') r = await NX.ai.features.expand(ta.value);
      else if (kind === 'tone') r = await NX.ai.features.tone(ta.value, arg);
      else if (kind === 'translate') r = await NX.ai.features.translate(ta.value, arg);
      t.close();
      ta.value = r.text;
      ta.dispatchEvent(new Event('input'));
      ta.focus();
      if (r.note) NX.ui.toast({ type: 'info', message: r.note, duration: 4000 });
    } catch (e) { t.close(); NX.ui.toast({ type: 'error', message: String(e.message || e) }); }
  }

  async function aiDraftReply() {
    const msgs = sel().channelMessages(currentChannel).slice(-6);
    if (!msgs.length) return;
    const convo = msgs.map(m => `${sel().member(m.authorId).displayName || '?'}: ${m.text}`).join('\n');
    const t = NX.ui.toast({ type: 'info', message: 'Drafting a reply…', duration: 0 });
    const r = await NX.ai.features.chat('Here is a chat conversation:\n\n' + convo + '\n\nDraft a short, natural reply from me to the last message. Match the tone of the conversation. Just the reply text, nothing else.', []);
    t.close();
    const ta = document.getElementById('composerInput');
    if (ta) { ta.value = r.text.replace(/^["']|["']$/g, ''); ta.dispatchEvent(new Event('input')); ta.focus(); }
  }

  /* ---------------- members column ---------------- */
  function membersColumn() {
    const col = h('div.chat-members');
    const srv = store().servers.find(currentServer);
    const ch = store().channels.find(currentChannel);
    const ids = ch && ch.type === 'dm' && ch.memberIds && ch.memberIds.length ? ch.memberIds.concat([sel().me().id]) : (srv ? srv.memberIds : store().members.all().map(m => m.id));
    const members = NX.unique(ids).map(id => sel().member(id));
    const roles = store().roles.all().slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    roles.forEach(r => {
      const group = members.filter(m => m.roleId === r.id);
      if (!group.length) return;
      col.appendChild(h('div.cm-cat', `${r.name} — ${group.length}`));
      group.forEach(m => col.appendChild(memberRow(m, r)));
    });
    const unroled = members.filter(m => !roles.some(r => r.id === m.roleId));
    if (unroled.length) { col.appendChild(h('div.cm-cat', `Members — ${unroled.length}`)); unroled.forEach(m => col.appendChild(memberRow(m, { name: '', color: '#8b8f98' }))); }
    col.appendChild(h('div.divider', { style: { margin: '12px 0' } }));
    col.appendChild(h('button.btn.sm.subtle', { style: { width: '100%' }, onclick: manageMembers }, 'Manage members'));
    return col;
  }

  function memberRow(m, role) {
    const offline = m.status === 'offline';
    return h('div.cm-user' + (offline ? '.offline' : ''), { onclick: () => showProfile(m.id) }, [
      NX.ui.avatar(m.displayName || m.name, m.color, 'sm', m.status),
      h('div.grow', { style: { minWidth: '0' } }, [
        h('div.cm-name', { style: { color: role && role.color ? role.color : undefined } }, m.displayName || m.name),
        m.activity ? h('div.cm-act', m.activity) : null
      ]),
      m.bot ? h('span.cm-role', { style: { background: 'var(--acc-grn-bg)', color: 'var(--acc-grn)' } }, 'BOT') : null
    ]);
  }

  function showProfile(memberId) {
    const m = sel().member(memberId);
    const role = sel().roleOf(memberId);
    const msgs = store().messages.all().filter(x => x.authorId === memberId);
    const reactions = NX.sum(store().messages.all().map(x => (x.reactions || []).filter(r => r.userId === memberId).length));
    const body = h('div', { style: { textAlign: 'center' } });
    body.appendChild(NX.ui.avatar(m.displayName || m.name, m.color, 'xl', m.status));
    body.appendChild(h('h2', { style: { fontSize: '19px', marginTop: '10px' } }, m.displayName || m.name));
    body.appendChild(h('div', { style: { marginTop: '4px' } }, h('span.msg-role', { style: { background: (role.color || '#8b8f98') + '22', color: role.color } }, role.name || 'Member')));
    if (m.activity) body.appendChild(h('div.small.muted', { style: { marginTop: '7px' } }, m.activity));
    body.appendChild(h('div.grid.grid-3', { style: { marginTop: '16px', gap: '8px' } }, [
      h('div.stat', [h('div.st-label', 'Messages'), h('div.st-value', { style: { fontSize: '19px' } }, String(msgs.length))]),
      h('div.stat', [h('div.st-label', 'Reactions'), h('div.st-value', { style: { fontSize: '19px' } }, String(reactions))]),
      h('div.stat', [h('div.st-label', 'Joined'), h('div.st-value', { style: { fontSize: '13px', marginTop: '8px' } }, NX.fmtDate(m.joined, 'short'))])
    ]));
    if (msgs.length) {
      body.appendChild(h('div.section-head', { style: { marginTop: '16px', textAlign: 'left' } }, [h('h2', { style: { fontSize: '12.5px' } }, 'Recent messages')]));
      body.appendChild(h('div', { style: { textAlign: 'left', maxHeight: '180px', overflow: 'auto' } },
        msgs.slice(-8).reverse().map(x => h('div', { style: { padding: '5px 0', borderBottom: '1px solid var(--bd)', fontSize: '12.3px' } }, [
          h('span.tiny.muted', `#${(store().channels.find(x.channelId) || {}).name || '?'} · ${NX.relTime(x.created)}`),
          h('div', String(x.text).slice(0, 130))
        ]))));
    }
    const isMe = memberId === sel().me().id;
    NX.ui.modal({
      title: 'Profile', size: 'narrow', hideFooter: isMe,
      body,
      footer: isMe ? [] : [
        h('div.grow'),
        h('button.btn.ghost', { onclick: () => { NX.ui.closeTopModal(); openDM(memberId); } }, 'Message'),
        h('button.btn.primary', { onclick: () => { const ta = document.getElementById('composerInput'); if (ta) { ta.value += `@${m.displayName || m.name} `; ta.focus(); } NX.ui.closeTopModal(); } }, 'Mention')
      ]
    });
  }

  function openDM(memberId) {
    const m = sel().member(memberId);
    const dmServer = store().servers.all().find(s => s.isDM);
    let ch = store().channels.all().find(c => c.serverId === (dmServer || {}).id && c.type === 'dm' && (c.memberIds || []).includes(memberId));
    if (!ch) {
      ch = store().channels.create({ serverId: dmServer.id, name: m.displayName || m.name, type: 'dm', topic: '', category: 'DM', order: store().channels.count(), private: true, memberIds: [memberId], lastRead: 0 }, true);
      store().touch(); store().emit('channels');
    }
    switchChannel(ch.id);
  }

  /* ---------------- pinned / search ---------------- */
  function showPinned(channelId) {
    const id = channelId || currentChannel;
    const pinned = store().messages.all().filter(m => m.channelId === id && m.pinned);
    NX.ui.modal({
      title: `Pinned in #${(store().channels.find(id) || {}).name}`, size: 'wide', hideFooter: true,
      body: pinned.length ? h('div', pinned.map(m => h('div.card.pad-sm', { style: { marginBottom: '8px', cursor: 'pointer' }, onclick: () => { NX.ui.closeTopModal(); const el = document.querySelector(`[data-msg="${m.id}"]`); if (el) el.scrollIntoView({ block: 'center' }); } }, [
        h('div.row', [NX.ui.avatar(sel().member(m.authorId).displayName || '?', sel().member(m.authorId).color, 'xs'), h('b.small', sel().member(m.authorId).displayName || '?'), h('div.grow'), h('span.tiny.muted', NX.fmtDate(m.created, 'medium'))]),
        h('div.small', { style: { marginTop: '6px', whiteSpace: 'pre-wrap' } }, m.text)
      ]))) : NX.ui.emptyState('pin', 'Nothing pinned', 'Hover a message and click the pin icon.')
    });
  }

  function messageSearch(channelId) {
    const inp = h('input.input', { placeholder: 'Search messages…', autofocus: true });
    const results = h('div', { style: { maxHeight: '46vh', overflow: 'auto' } });
    const draw = q => {
      NX.clear(results);
      if (!q.trim()) { results.appendChild(h('p.small.muted', { style: { padding: '14px' } }, 'Type to search across all messages.')); return; }
      const hits = NX.aiEngine.search(q, { limit: 40, kinds: ['message'] });
      if (!hits.length) { results.appendChild(h('p.small.muted', { style: { padding: '14px' } }, 'No matches.')); return; }
      hits.forEach(r => {
        const m = store().messages.find(r.doc.id);
        if (!m) return;
        if (channelId && m.channelId !== channelId) return;
        const ch = store().channels.find(m.channelId);
        const a = sel().member(m.authorId);
        results.appendChild(h('button.list-row.selectable', { style: { width: '100%' }, onclick: () => { NX.ui.closeTopModal(); switchChannel(m.channelId); setTimeout(() => { const el = document.querySelector(`[data-msg="${m.id}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.style.background = 'var(--sel)'; setTimeout(() => el.style.background = '', 2000); } }, 200); } }, [
          NX.ui.avatar(a.displayName || a.name, a.color, 'xs'),
          h('div.lr-main', [
            h('div.lr-title', { html: NX.aiEngine.highlight(String(m.text).slice(0, 140), q) }),
            h('div.lr-sub', `#${ch ? ch.name : '?'} · ${a.displayName || a.name} · ${NX.fmtDateTime(m.created, 'short')}`)
          ])
        ]));
      });
    };
    inp.addEventListener('input', NX.debounce(() => draw(inp.value), 180));
    NX.ui.modal({ title: channelId ? `Search #${(store().channels.find(channelId) || {}).name}` : 'Search all messages', size: 'wide', hideFooter: true, body: h('div', [inp, h('div', { style: { height: '10px' } }), results]) });
    draw('');
    setTimeout(() => inp.focus(), 40);
  }

  function exportChannel(channelId) {
    const id = channelId || currentChannel;
    const ch = store().channels.find(id);
    const msgs = sel().channelMessages(id);
    const L = [`# #${ch.name}`, '', ch.topic ? '> ' + ch.topic : '', `Exported ${new Date().toLocaleString()} · ${msgs.length} messages`, ''];
    let lastDay = null;
    msgs.forEach(m => {
      const dk = NX.ymd(m.created);
      if (dk !== lastDay) { lastDay = dk; L.push('', `## ${NX.fmtDate(dk, 'long')}`, ''); }
      const a = sel().member(m.authorId);
      L.push(`**${a.displayName || a.name}** _${NX.fmtTime(m.created)}_${m.replyTo ? ' _(reply)_' : ''}`);
      L.push(m.text.split('\n').map(l => '> ' + l).join('\n'));
      if ((m.reactions || []).length) {
        const byE = new Map(); m.reactions.forEach(r => byE.set(r.emoji, (byE.get(r.emoji) || 0) + 1));
        L.push(''); L.push('_Reactions: ' + Array.from(byE.entries()).map(([e, c]) => `${e}×${c}`).join(' ') + '_');
      }
      L.push('');
    });
    NX.download(`nexadesk-${NX.slug(ch.name)}-${NX.todayStr()}.md`, L.join('\n'), 'text/markdown');
    NX.ui.toast({ type: 'success', message: `${msgs.length} messages exported` });
  }

  /* ---------------- create / edit ---------------- */
  async function newChannel(category) {
    const c = await NX.ui.form({
      title: 'New channel', okLabel: 'Create',
      fields: [
        { key: 'name', label: 'Channel name', type: 'text', required: true, placeholder: 'lowercase-with-dashes', full: true },
        { key: 'type', label: 'Type', type: 'select', options: [{ value: 'text', label: 'Text' }, { value: 'voice', label: 'Voice (simulated)' }], value: 'text' },
        { key: 'category', label: 'Category', type: 'select', value: category || 'General', options: NX.unique(store().channels.all().map(x => x.category).concat(['General', 'Team', 'Social', category].filter(Boolean))) },
        { key: 'private', label: 'Private channel', type: 'checkbox' },
        { key: 'topic', label: 'Topic', type: 'text', full: true, placeholder: 'What is this channel for?' }
      ]
    });
    if (!c) return;
    const ch = store().channels.create({ serverId: currentServer, name: c.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'), type: c.type, topic: c.topic || '', category: c.category, order: store().channels.count(), private: !!c.private, memberIds: [], lastRead: Date.now() });
    switchChannel(ch.id);
    // system message
    store().messages.create({ authorId: sel().me().id, channelId: ch.id, text: `Channel created. ${c.topic || ''}`, reactions: [], attachments: [], replyTo: null, edited: false, pinned: false, system: true }, true);
    store().touch(); store().emit('messages');
  }

  async function editChannel(id) {
    const c = store().channels.find(id);
    const r = await NX.ui.form({
      title: 'Channel settings', okLabel: 'Save',
      fields: [
        { key: 'name', label: 'Name', type: 'text', value: c.name, required: true },
        { key: 'category', label: 'Category', type: 'select', value: c.category, options: NX.unique(store().channels.all().map(x => x.category).concat([c.category])) },
        { key: 'topic', label: 'Topic', type: 'text', value: c.topic || '', full: true },
        { key: 'slowMode', label: 'Slow mode (seconds)', type: 'number', value: c.slowMode || 0, min: 0 },
        { key: 'private', label: 'Private', type: 'checkbox', value: !!c.private }
      ]
    });
    if (!r) return;
    store().channels.update(id, r);
    NX.router.render();
  }

  async function newServer() {
    const s = await NX.ui.form({
      title: 'New server', okLabel: 'Create',
      fields: [
        { key: 'name', label: 'Server name', type: 'text', required: true },
        { key: 'icon', label: 'Icon (emoji)', type: 'text', value: '🚀' },
        { key: 'color', label: 'Colour', type: 'color', value: NX.colorFromString(String(Math.random())) },
        { key: 'description', label: 'Description', type: 'textarea', rows: 2, full: true }
      ]
    });
    if (!s) return;
    const srv = store().servers.create({ name: s.name, icon: s.icon || '🚀', color: s.color, ownerId: sel().me().id, description: s.description || '', memberIds: store().members.all().map(m => m.id) });
    ['general', 'random'].forEach((n, i) => store().channels.create({ serverId: srv.id, name: n, type: 'text', topic: '', category: 'Text Channels', order: i, private: false, memberIds: [], lastRead: Date.now() }, true));
    store().touch(); store().emit('channels');
    currentServer = srv.id; currentChannel = null;
    NX.localStore.set('nexadesk.chatServer', srv.id);
    ensureDefaults(); NX.router.render();
    NX.ui.toast({ type: 'success', message: 'Server created' });
  }

  async function editServer(id) {
    const s = store().servers.find(id);
    const r = await NX.ui.form({
      title: 'Server settings', okLabel: 'Save',
      fields: [
        { key: 'name', label: 'Name', type: 'text', value: s.name, required: true },
        { key: 'icon', label: 'Icon', type: 'text', value: s.icon },
        { key: 'color', label: 'Colour', type: 'color', value: s.color },
        { key: 'description', label: 'Description', type: 'textarea', value: s.description || '', rows: 2, full: true }
      ]
    });
    if (!r) return;
    store().servers.update(id, r); NX.router.render();
  }

  function manageMembers() {
    const members = store().members.all();
    const roles = store().roles.all().slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const body = h('div');
    body.appendChild(h('div.row', { style: { marginBottom: '10px' } }, [
      h('div.grow'), h('button.btn.sm.primary', { onclick: async () => {
        const r = await NX.ui.form({ title: 'New member', okLabel: 'Add', fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'color', label: 'Colour', type: 'color', value: NX.colorFromString(String(Math.random())) },
          { key: 'roleId', label: 'Role', type: 'select', options: roles.map(x => ({ value: x.id, label: x.name })) },
          { key: 'bot', label: 'Is a bot', type: 'checkbox' }
        ] });
        if (!r) return;
        store().members.create({ name: r.name, displayName: r.name, color: r.color, status: 'online', roleId: r.roleId, bot: !!r.bot, activity: '', joined: new Date().toISOString() });
        const srv = store().servers.find(currentServer);
        if (srv) store().servers.update(srv.id, { memberIds: (srv.memberIds || []).concat([store().members.all()[0].id]) });
        NX.ui.closeTopModal(); manageMembers(); NX.router.render();
      } }, '+ Add member')]));
    members.forEach(m => {
      const role = sel().roleOf(m.id);
      body.appendChild(h('div.list-row', [
        NX.ui.avatar(m.displayName || m.name, m.color, '', m.status),
        h('div.lr-main', [h('div.lr-title', (m.displayName || m.name) + (m.id === sel().me().id ? ' (you)' : '')), h('div.lr-sub', `${role.name || 'no role'} · ${m.status}${m.bot ? ' · bot' : ''}`)]),
        h('select.select.sm', { style: { width: 'auto' }, onchange: e => store().members.update(m.id, { roleId: e.target.value }) },
          roles.map(r => h('option', { value: r.id, selected: r.id === m.roleId }, r.name))),
        h('select.select.sm', { style: { width: 'auto' }, onchange: e => store().members.update(m.id, { status: e.target.value }) },
          ['online', 'idle', 'dnd', 'offline'].map(s => h('option', { value: s, selected: s === m.status }, s))),
        h('button.icon-btn', { html: iconHTML('edit', 14), onclick: async () => { const v = await NX.ui.prompt({ title: 'Display name', value: m.displayName || m.name }); if (v) store().members.update(m.id, { displayName: v, name: v }); NX.ui.closeTopModal(); manageMembers(); } }),
        m.id === sel().me().id ? null : h('button.icon-btn', { html: iconHTML('trash', 14), onclick: async () => { if (await NX.ui.confirmDelete(m.displayName || m.name)) { store().members.remove(m.id); NX.ui.closeTopModal(); manageMembers(); NX.router.render(); } } })
      ]));
    });
    NX.ui.modal({ title: 'Members', size: 'wide', hideFooter: true, body });
  }

  function manageRoles() {
    const roles = store().roles.all().slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const body = h('div');
    const PERMS = [{ k: 'admin', l: 'Administrator' }, { k: 'manage', l: 'Manage channels & members' }, { k: 'post', l: 'Send messages' }];
    roles.forEach(r => {
      body.appendChild(h('div.card.pad-sm', { style: { marginBottom: '9px' } }, [
        h('div.row', [
          h('span.color-dot', { style: { background: r.color, width: '16px', height: '16px' } }),
          h('b.small.grow', r.name),
          h('span.badge-count', String(store().members.all().filter(m => m.roleId === r.id).length)),
          h('button.icon-btn', { html: iconHTML('edit', 14), onclick: async () => {
            const v = await NX.ui.form({ title: 'Edit role', okLabel: 'Save', fields: [
              { key: 'name', label: 'Name', type: 'text', value: r.name, required: true },
              { key: 'color', label: 'Colour', type: 'color', value: r.color },
              { key: 'hoist', label: 'Show separately in member list', type: 'checkbox', value: !!r.hoist }
            ] });
            if (v) { store().roles.update(r.id, v); NX.ui.closeTopModal(); manageRoles(); NX.router.render(); }
          } }),
          h('button.icon-btn', { html: iconHTML('trash', 14), onclick: async () => { if (await NX.ui.confirmDelete('the role “' + r.name + '”')) { store().roles.remove(r.id); NX.ui.closeTopModal(); manageRoles(); } } })
        ]),
        h('div.row-wrap', { style: { marginTop: '7px', gap: '10px' } }, PERMS.map(p => h('label.checkbox', [
          h('input', { type: 'checkbox', checked: (r.permissions || []).includes(p.k), onchange: e => {
            const cur = new Set(r.permissions || []);
            e.target.checked ? cur.add(p.k) : cur.delete(p.k);
            store().roles.update(r.id, { permissions: Array.from(cur) });
          } }), h('span', p.l)
        ])))
      ]));
    });
    body.appendChild(h('button.btn.sm.subtle', { onclick: async () => {
      const name = await NX.ui.prompt({ title: 'New role name' });
      if (!name) return;
      store().roles.create({ name, color: NX.colorFromString(name), permissions: ['post'], hoist: false, order: store().roles.count() });
      NX.ui.closeTopModal(); manageRoles();
    } }, '+ Add role'));
    NX.ui.modal({ title: 'Roles & permissions', size: 'wide', hideFooter: true, body });
  }

  NX.router.register({
    id: 'chat', name: 'Chat', icon: 'chat', group: 'connect', order: 50,
    badge: () => sel().totalUnread(),
    badgeCount: 'unreadChat',
    render, onMount,
    commands: () => [
      { label: 'Chat: mark everything read', icon: 'check', run: markAllRead },
      { label: 'Chat: search all messages', icon: 'search', run: () => messageSearch() },
      { label: 'Chat: new channel', icon: 'plus', run: () => newChannel() },
      { label: 'Chat: new server', icon: 'plus', run: newServer },
      { label: 'Chat: summarise current channel with AI', icon: 'sparkle', run: () => summarizeChannel() },
      { label: 'Chat: export current channel', icon: 'download', run: () => exportChannel() },
      { label: 'Chat: manage roles', icon: 'shield', run: manageRoles }
    ]
  });
})(window.NX);
