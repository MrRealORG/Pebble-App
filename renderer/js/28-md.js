/* ============================================================
   Pebble — md.js : block <-> markdown conversion
   ============================================================ */
(function (NX) {
  'use strict';

  /* ---------------- inline: block text (markdown-ish) -> HTML ---------------- */
  function inline(text, opts) {
    opts = opts || {};
    let s = NX.esc(text == null ? '' : String(text));
    if (!opts.noFormatting) {
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<b><i>$1</i></b>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
      s = s.replace(/__([^_]+)__/g, '<b>$1</b>');
      s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>');
      s = s.replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g, '$1<i>$2</i>');
      s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
      s = s.replace(/==([^=]+)==/g, '<span class="hl">$1</span>');
      s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<span class="wikilink" data-title="$1">$2</span>');
      s = s.replace(/\[\[([^\]]+)\]\]/g, '<span class="wikilink" data-title="$1">$1</span>');
      s = s.replace(/(^|\s)#([a-zA-Z][\w-]*)/g, '$1<span class="hashtag" data-tag="$2">#$2</span>');
      s = s.replace(/@([A-Za-z][\w-]*)/g, '<span class="mention">@$1</span>');
      s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    }
    if (opts.highlight) {
      s = NX.aiEngine.highlight(NX.unesc(s), opts.highlight);
    }
    return s;
  }

  /** Strip markdown syntax to plain text */
  function stripInline(text) {
    return String(text == null ? '' : text)
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*?([^*]+)\*\*?/g, '$1')
      .replace(/__?([^_]+)__?/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/==([^=]+)==/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/(^|\s)#[\w-]+/g, '$1')
      .trim();
  }

  /* ---------------- BLOCK TYPES ---------------- */
  const BLOCK_TYPES = [
    { type: 'text',      name: 'Text',            icon: '📝', group: 'Basic',    desc: 'Plain paragraph' },
    { type: 'h1',        name: 'Heading 1',       icon: 'H1', group: 'Basic',    desc: 'Big section heading', key: 'Ctrl+Shift+1' },
    { type: 'h2',        name: 'Heading 2',       icon: 'H2', group: 'Basic',    desc: 'Medium heading', key: 'Ctrl+Shift+2' },
    { type: 'h3',        name: 'Heading 3',       icon: 'H3', group: 'Basic',    desc: 'Small heading', key: 'Ctrl+Shift+3' },
    { type: 'bullet',    name: 'Bulleted list',   icon: '•',  group: 'Basic',    desc: 'Simple bullet list' },
    { type: 'number',    name: 'Numbered list',   icon: '1.', group: 'Basic',    desc: 'Ordered list' },
    { type: 'todo',      name: 'To-do',           icon: '☑',  group: 'Basic',    desc: 'Track with a checkbox' },
    { type: 'check',     name: 'Checklist item',  icon: '✓',  group: 'Basic',    desc: 'Decision / confirmed item' },
    { type: 'toggle',    name: 'Toggle list',     icon: '▶',  group: 'Basic',    desc: 'Collapsible section' },
    { type: 'quote',     name: 'Quote',           icon: '❝',  group: 'Basic',    desc: 'Captured words' },
    { type: 'divider',   name: 'Divider',         icon: '—',  group: 'Basic',    desc: 'Visual separator' },
    { type: 'callout',   name: 'Callout',         icon: '💡', group: 'Basic',    desc: 'Highlighted box with emoji' },
    { type: 'code',      name: 'Code',            icon: '</>',group: 'Media',    desc: 'Monospace code block' },
    { type: 'math',      name: 'Equation',        icon: '∑',  group: 'Media',    desc: 'LaTeX-style expression' },
    { type: 'table',     name: 'Table',           icon: '⊞',  group: 'Media',    desc: 'Simple grid' },
    { type: 'image',     name: 'Image',           icon: '🖼️', group: 'Media',    desc: 'Upload or embed a picture' },
    { type: 'embed',     name: 'Embed',           icon: '🔗', group: 'Media',    desc: 'iframe from a URL' },
    { type: 'bookmark',  name: 'Bookmark',        icon: '🔖', group: 'Media',    desc: 'Link preview card' },
    { type: 'file',      name: 'File',            icon: '📎', group: 'Media',    desc: 'Attach a file' },
    { type: 'mermaid',   name: 'Diagram',         icon: '📊', group: 'Advanced', desc: 'Mermaid chart source' },
    { type: 'noteRef',   name: 'Note reference',  icon: '📄', group: 'Advanced', desc: 'Embed another note' },
    { type: 'taskRef',   name: 'Task list',       icon: '✅', group: 'Advanced', desc: 'Live list of matching tasks' },
    { type: 'progress',  name: 'Progress bar',    icon: '▓',  group: 'Advanced', desc: 'Visual percentage' },
    { type: 'stats',     name: 'Stat cards',      icon: '📈', group: 'Advanced', desc: 'Live workspace numbers' }
  ];

  function newBlock(type, extra) {
    const b = Object.assign({ id: NX.uid('b'), type: type || 'text', text: '' }, extra || {});
    if (type === 'todo' || type === 'check') b.done = !!b.done;
    if (type === 'toggle') { b.open = false; b.children = b.children || []; }
    if (type === 'table') b.rows = b.rows || [['', '', ''], ['', '', ''], ['', '', '']];
    if (type === 'callout') { b.emoji = b.emoji || '💡'; b.variant = b.variant || 'info'; }
    if (type === 'image') { b.src = b.src || ''; b.caption = b.caption || ''; }
    if (type === 'progress') b.value = b.value || 0;
    if (type === 'stats') b.items = b.items || [];
    if (type === 'taskRef') b.filter = b.filter || 'open';
    return b;
  }

  /* ---------------- blocks -> markdown ---------------- */
  function blocksToMarkdown(blocks, level) {
    level = level || 0;
    const out = [];
    let num = 0;
    (blocks || []).forEach(b => {
      const indent = '  '.repeat(level);
      const t = b.type || 'text';
      switch (t) {
        case 'h1': out.push('# ' + stripInline(b.text)); break;
        case 'h2': out.push('## ' + stripInline(b.text)); break;
        case 'h3': out.push('### ' + stripInline(b.text)); break;
        case 'bullet': out.push(indent + '- ' + stripInline(b.text)); break;
        case 'number': num++; out.push(indent + `${num}. ` + stripInline(b.text)); break;
        case 'todo': out.push(indent + `- [${b.done ? 'x' : ' '}] ` + stripInline(b.text)); break;
        case 'check': out.push(indent + `- [${b.done ? 'x' : ' '}] ` + stripInline(b.text)); break;        case 'quote': out.push('> ' + stripInline(b.text)); break;
        case 'callout': out.push(`> ${b.emoji || '💡'} **${(b.variant || 'info').toUpperCase()}** — ${stripInline(b.text)}`); break;
        case 'code': out.push('```\n' + (b.text || '') + '\n```'); break;
        case 'math': out.push('$$\n' + (b.text || '') + '\n$$'); break;
        case 'divider': out.push('---'); break;
        case 'table': {
          const rows = b.rows || [];
          if (!rows.length) break;
          const esc = c => String(c == null ? '' : c).replace(/\|/g, '\\|').replace(/\n/g, ' ');
          out.push('| ' + rows[0].map(esc).join(' | ') + ' |');
          out.push('|' + rows[0].map(() => '---').join('|') + '|');
          rows.slice(1).forEach(r => out.push('| ' + rows[0].map((_, i) => esc(r[i])).join(' | ') + ' |'));
          break;
        }
        case 'image': out.push(`![${stripInline(b.caption || '')}](${b.src || ''})`); break;
        case 'embed': out.push(`[Embed](${b.src || b.text || ''})`); break;
        case 'bookmark': out.push(`🔖 [${stripInline(b.title || b.text || b.src || '')}](${b.src || ''})${b.description ? '\n> ' + stripInline(b.description) : ''}`); break;
        case 'file': out.push(`📎 ${stripInline(b.name || b.text || 'file')}${b.size ? ` (${NX.fmtBytes(b.size)})` : ''}${b.src ? ` — ${b.src}` : ''}`); break;
        case 'mermaid': out.push('```mermaid\n' + (b.text || '') + '\n```'); break;
        case 'noteRef': out.push(`[[${b.refTitle || ''}]]`); break;
        case 'taskRef': out.push(`> 📋 Task list: ${b.filter || 'open'}${b.projectId ? ' in project ' + b.projectId : ''}`); break;
        case 'progress': out.push(`> Progress: ${'█'.repeat(Math.round((b.value || 0) / 5))}${'░'.repeat(20 - Math.round((b.value || 0) / 5))} ${b.value || 0}%`); break;
        case 'stats': out.push('> 📈 Live stats block'); break;
        case 'toggle':
          out.push('<details><summary>' + stripInline(b.text) + '</summary>\n');
          out.push(blocksToMarkdown(b.children, 0));
          out.push('\n</details>');
          break;
        default: out.push(stripInline(b.text)); num = 0;
      }
      if (t !== 'number') num = 0;
    });
    return out.join('\n\n').replace(/\n{3,}/g, '\n\n');
  }

  /** Whole note -> markdown document with front matter */
  function noteToMarkdown(note, opts) {
    opts = opts || {};
    const L = [];
    const sel = NX.sel;
    if (opts.frontMatter !== false) {
      L.push('---');
      L.push(`title: "${String(note.title || '').replace(/"/g, '\\"')}"`);
      L.push(`id: ${note.id}`);
      L.push(`created: ${note.created || ''}`);
      L.push(`updated: ${note.updated || ''}`);
      const tags = (note.tags || []).map(t => sel.tagName(t)).filter(Boolean);
      if (tags.length) L.push(`tags: [${tags.join(', ')}]`);
      if (note.favorite) L.push('favorite: true');
      if (note.parentId) { const p = NX.store.notes.find(note.parentId); if (p) L.push(`parent: "${p.title}"`); }
      (note.properties || []).forEach(p => {
        if (p.value !== '' && p.value !== null && p.value !== undefined && p.type !== 'checkbox') L.push(`${NX.slug(p.name) || p.name}: ${JSON.stringify(p.value)}`);
        else if (p.type === 'checkbox') L.push(`${NX.slug(p.name) || p.name}: ${!!p.value}`);
      });
      L.push('---');
      L.push('');
    }
    if (opts.includeTitle !== false) { L.push('# ' + (note.icon && note.icon.length <= 4 ? note.icon + ' ' : '') + (note.title || 'Untitled')); L.push(''); }
    if (opts.includeMeta) {
      L.push(`_Created ${NX.fmtDate(note.created, 'long')} · Updated ${NX.relTime(note.updated)} · ${sel.noteWordCount(note)} words · ${sel.noteReadMinutes(note)} min read_`);
      L.push('');
    }
    L.push(blocksToMarkdown(note.blocks));
    if (opts.includeBacklinks) {
      const bl = sel.backlinksTo(note.id);
      if (bl.length) { L.push(''); L.push('---'); L.push(''); L.push('## Backlinks'); bl.forEach(b => L.push(`- [[${b.fromTitle}]]`)); }
    }
    return L.join('\n');
  }

  /* ---------------- markdown -> blocks ---------------- */
  function markdownToBlocks(md) {
    const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let i = 0;
    let inCode = false, codeBuf = [], codeLang = '';
    let tableBuf = [];
    let toggle = null;

    const flushTable = () => {
      if (!tableBuf.length) return;
      const rows = tableBuf.map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      // drop the separator row
      const cleaned = rows.filter(r => !r.every(c => /^:?-{2,}:?$/.test(c)));
      blocks.push(newBlock('table', { rows: cleaned.length ? cleaned : [['']] }));
      tableBuf = [];
    };

    while (i < lines.length) {
      const raw = lines[i];
      const line = raw.trim();

      if (/^```/.test(line)) {
        if (inCode) {
          blocks.push(newBlock(codeLang === 'mermaid' ? 'mermaid' : 'code', { text: codeBuf.join('\n') }));
          codeBuf = []; inCode = false; codeLang = '';
        } else { flushTable(); inCode = true; codeLang = line.replace(/^```/, '').trim(); }
        i++; continue;
      }
      if (inCode) { codeBuf.push(raw); i++; continue; }

      if (/^\|.*\|\s*$/.test(line)) { tableBuf.push(line); i++; continue; }
      else flushTable();

      if (/^---+$|^\*\*\*+$/.test(line) && !line.includes(' ')) { blocks.push(newBlock('divider')); i++; continue; }

      let m;
      if ((m = line.match(/^#\s+(.*)$/)))       { blocks.push(newBlock('h1', { text: m[1] })); i++; continue; }
      if ((m = line.match(/^##\s+(.*)$/)))      { blocks.push(newBlock('h2', { text: m[1] })); i++; continue; }
      if ((m = line.match(/^###\s+(.*)$/)))     { blocks.push(newBlock('h3', { text: m[1] })); i++; continue; }
      if ((m = line.match(/^####+\s+(.*)$/)))   { blocks.push(newBlock('h3', { text: m[1] })); i++; continue; }

      if ((m = line.match(/^>\s*(.*)$/))) {
        const content = m[1];
        if (/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(content)) {
          const em = content.match(/^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F?)\s*(.*)$/u);
          blocks.push(newBlock('callout', { emoji: em ? em[1] : '💡', text: em ? em[2] : content }));
        } else blocks.push(newBlock('quote', { text: content }));
        i++; continue;
      }
      if ((m = line.match(/^\$\$\s*(.*)$/))) {
        const buf = [m[1]];
        i++;
        while (i < lines.length && !/^\$\$/.test(lines[i].trim())) { buf.push(lines[i].trim()); i++; }
        i++;
        blocks.push(newBlock('math', { text: buf.join(' ').replace(/\$\$/g, '').trim() }));
        continue;
      }
      if ((m = line.match(/^[-*+]\s+\[( |x|X)\]\s+(.*)$/))) { blocks.push(newBlock('todo', { text: m[2], done: m[1].toLowerCase() === 'x' })); i++; continue; }
      if ((m = line.match(/^[-*+]\s+(.*)$/))) { blocks.push(newBlock('bullet', { text: m[1] })); i++; continue; }
      if ((m = line.match(/^\d+[.)]\s+(.*)$/))) { blocks.push(newBlock('number', { text: m[1] })); i++; continue; }
      if ((m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/))) { blocks.push(newBlock('image', { src: m[2], caption: m[1] })); i++; continue; }
      if ((m = line.match(/^<details>\s*<summary>(.*)<\/summary>/))) {
        toggle = newBlock('toggle', { text: m[1], open: false, children: [] });
        const buf = []; i++;
        while (i < lines.length && !/<\/details>/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        toggle.children = markdownToBlocks(buf.join('\n'));
        blocks.push(toggle); toggle = null;
        continue;
      }
      if (!line) { i++; continue; }
      blocks.push(newBlock('text', { text: line }));
      i++;
    }
    flushTable();
    if (!blocks.length) blocks.push(newBlock('text'));
    return blocks;
  }

  /* ---------------- HTML -> markdown (pasted rich content) ---------------- */
  function htmlToMarkdown(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    const walk = (node) => {
      let out = '';
      node.childNodes.forEach(child => {
        if (child.nodeType === 3) { out += child.nodeValue; return; }
        if (child.nodeType !== 1) return;
        const tag = child.tagName.toLowerCase();
        const inner = walk(child);
        switch (tag) {
          case 'h1': out += `\n# ${inner.trim()}\n`; break;
          case 'h2': out += `\n## ${inner.trim()}\n`; break;
          case 'h3': out += `\n### ${inner.trim()}\n`; break;
          case 'h4': case 'h5': case 'h6': out += `\n#### ${inner.trim()}\n`; break;
          case 'b': case 'strong': out += `**${inner}**`; break;
          case 'i': case 'em': out += `*${inner}*`; break;
          case 'u': out += inner; break;
          case 's': case 'del': case 'strike': out += `~~${inner}~~`; break;
          case 'code': out += child.parentElement && child.parentElement.tagName === 'PRE' ? inner : '`' + inner + '`'; break;
          case 'pre': out += `\n\`\`\`\n${child.textContent}\n\`\`\`\n`; break;
          case 'br': out += '\n'; break;
          case 'p': case 'div': out += `\n${inner.trim()}\n`; break;
          case 'ul': out += '\n' + Array.from(child.children).map(li => `- ${walk(li).trim().replace(/^\s*[-*]\s*/, '')}`).join('\n') + '\n'; break;
          case 'ol': out += '\n' + Array.from(child.children).map((li, idx) => `${idx + 1}. ${walk(li).trim().replace(/^\s*\d+[.)]\s*/, '')}`).join('\n') + '\n'; break;
          case 'li': out += inner; break;
          case 'blockquote': out += '\n' + inner.trim().split('\n').map(l => '> ' + l).join('\n') + '\n'; break;
          case 'a': out += `[${inner}](${child.getAttribute('href') || ''})`; break;
          case 'img': out += `![${child.getAttribute('alt') || ''}](${child.getAttribute('src') || ''})`; break;
          case 'table': {
            const rows = Array.from(child.querySelectorAll('tr'));
            const md = rows.map((tr, ri) => {
              const cells = Array.from(tr.children).map(td => walk(td).trim().replace(/\|/g, '\\|').replace(/\n/g, ' '));
              let line = '| ' + cells.join(' | ') + ' |';
              if (ri === 0) line += '\n|' + cells.map(() => '---').join('|') + '|';
              return line;
            }).join('\n');
            out += '\n' + md + '\n'; break;
          }
          case 'hr': out += '\n---\n'; break;
          case 'script': case 'style': break;
          default: out += inner;
        }
      });
      return out;
    };
    return walk(d).replace(/\n{3,}/g, '\n\n').trim();
  }

  /* ---------------- CSV helpers ---------------- */
  function toCSV(rows, delimiter) {
    const d = delimiter || ',';
    const cell = v => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return rows.map(r => r.map(cell).join(d)).join('\n');
  }
  function parseCSV(text, delimiter) {
    const d = delimiter || ',';
    const rows = []; let row = [], cur = '', inQ = false;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQ) {
        if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === d) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim()));
  }

  /* ---------------- export helpers ---------------- */
  function notesToMarkdownBundle() {
    const sel = NX.sel;
    const files = NX.store.notes.all().map(n => {
      const safe = NX.slug(n.title || 'untitled') || n.id;
      return { name: `${safe}.md`, content: noteToMarkdown(n, { includeMeta: true, includeBacklinks: true }) };
    });
    const index = ['# Workspace export', '', `Exported ${new Date().toLocaleString()}`, '', `${files.length} notes.`, '']
      .concat(NX.store.notes.all().map(n => `- ${n.icon || '📄'} ${n.title}`));
    files.unshift({ name: '_index.md', content: index.join('\n') });
    return files;
  }

  NX.md = {
    inline, stripInline, BLOCK_TYPES, newBlock,
    blocksToMarkdown, noteToMarkdown, markdownToBlocks, htmlToMarkdown,
    toCSV, parseCSV, notesToMarkdownBundle
  };
})(window.NX);
