#!/usr/bin/env node
/**
 * PebbleX — Model Context Protocol (MCP) Stdio Server Bridge
 * Connects AI tools (Claude Desktop, Cursor, Antigravity) to Pebble.
 * 
 * Usage in claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "pebble": {
 *       "command": "node",
 *       "args": ["<path-to-pebble>/scripts/mcp-server.js"]
 *     }
 *   }
 * }
 */

const readline = require('readline');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 47615;
const VERSION = '0.1.0';

function getWorkspaceFile() {
  const base = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Preferences') : path.join(os.homedir(), '.config'));
  return path.join(base, 'pebble', 'workspace.json');
}

function readLocalWorkspace() {
  try {
    const p = getWorkspaceFile();
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch(e) {
    return null;
  }
}

function saveLocalWorkspace(doc) {
  try {
    const p = getWorkspaceFile();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(doc, null, 2), 'utf8');
    return true;
  } catch(e) {
    return false;
  }
}

function getCollection(doc, name) {
  if (!doc) return [];
  const target = doc[name] || (doc.workspace && doc.workspace[name]);
  if (Array.isArray(target)) return target;
  if (typeof target === 'string') {
    try { return JSON.parse(target); } catch(e) {}
  }
  return [];
}

function forwardToBridge(reqObj) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(reqObj);
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 2500
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.write(body);
    req.end();
  });
}

function handleOfflineFallback(reqObj) {
  const id = reqObj.id !== undefined ? reqObj.id : null;
  const method = reqObj.method || '';
  const params = reqObj.params || {};

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'pebble-mcp', version: VERSION },
        capabilities: { tools: {}, resources: {}, prompts: {} }
      }
    };
  }

  if (method === 'notifications/initialized') {
    return { jsonrpc: '2.0' };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'pebble_get_notes',
            description: 'List or search markdown notes in Pebble Notes vault',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Filter title or body' },
                folder: { type: 'string', description: 'Folder name filter' },
                limit: { type: 'number', description: 'Max items to return' }
              }
            }
          },
          {
            name: 'pebble_create_note',
            description: 'Create a new note in Pebble Notes vault',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Note title' },
                body: { type: 'string', description: 'Markdown body' },
                folder: { type: 'string', description: 'Folder name' }
              },
              required: ['title', 'body']
            }
          },
          {
            name: 'pebble_get_tasks',
            description: 'List or search tasks from Microsoft To Do in Pebble',
            inputSchema: {
              type: 'object',
              properties: {
                list: { type: 'string', description: 'all, my-day, important, planned, completed' },
                query: { type: 'string', description: 'Search term' }
              }
            }
          },
          {
            name: 'pebble_create_task',
            description: 'Create a new task in Pebble / Microsoft To Do',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Task title' },
                note: { type: 'string', description: 'Task notes/details' },
                due: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
                myDay: { type: 'boolean', description: 'Add to My Day' },
                important: { type: 'boolean', description: 'Mark important' }
              },
              required: ['title']
            }
          },
          {
            name: 'pebble_complete_task',
            description: 'Mark a task completed in Pebble by title or ID',
            inputSchema: {
              type: 'object',
              properties: { id: { type: 'string', description: 'Task ID or title' } },
              required: ['id']
            }
          },
          {
            name: 'pebble_get_productivity_stats',
            description: 'Get today\'s productivity stats from Pebble',
            inputSchema: { type: 'object', properties: {} }
          }
        ]
      }
    };
  }

  if (method === 'tools/call') {
    const tool = params.name;
    const args = params.arguments || {};
    const doc = readLocalWorkspace() || {};

    if (tool === 'pebble_get_notes') {
      const all = getCollection(doc, 'notes');
      const q = (args.query || '').toLowerCase();
      const folder = args.folder || '';
      const limit = args.limit || 20;

      const filtered = all.filter(n => {
        if (n.trash) return false;
        if (folder && (n.folder || '') !== folder) return false;
        if (q) {
          const t = (n.title || '').toLowerCase();
          const b = (n.body || '').toLowerCase();
          if (!t.includes(q) && !b.includes(q)) return false;
        }
        return true;
      }).slice(0, limit);

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(filtered, null, 2) }]
        }
      };
    }

    if (tool === 'pebble_create_note') {
      const all = getCollection(doc, 'notes');
      const newNote = {
        id: 'nt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: args.title || 'Untitled Note',
        body: args.body || '',
        folder: args.folder || '',
        tags: ['mcp'],
        pinned: false,
        updated: Date.now()
      };
      all.unshift(newNote);
      doc.notes = all;
      saveLocalWorkspace(doc);

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Note '${newNote.title}' created in Pebble Notes.` }]
        }
      };
    }

    if (tool === 'pebble_get_tasks') {
      const all = getCollection(doc, 'tasks');
      const list = args.list || 'all';
      const q = (args.query || '').toLowerCase();

      const filtered = all.filter(t => {
        if (list === 'completed' && !t.done) return false;
        if (list !== 'completed' && t.done) return false;
        if (list === 'my-day' && !t.myDay) return false;
        if (list === 'important' && !t.important) return false;
        if (list === 'planned' && !t.due) return false;
        if (q) {
          const name = (t.name || t.title || '').toLowerCase();
          const note = (t.note || '').toLowerCase();
          if (!name.includes(q) && !note.includes(q)) return false;
        }
        return true;
      });

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(filtered, null, 2) }]
        }
      };
    }

    if (tool === 'pebble_create_task') {
      const all = getCollection(doc, 'tasks');
      const newTask = {
        id: 'tk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: args.title || 'New Task',
        note: args.note || '',
        due: args.due || '',
        myDay: !!args.myDay,
        important: !!args.important,
        col: 'today',
        cat: 'work',
        created: Date.now(),
        done: false
      };
      all.push(newTask);
      doc.tasks = all;
      saveLocalWorkspace(doc);

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Task '${newTask.name}' created in Pebble To-Do.` }]
        }
      };
    }

    if (tool === 'pebble_complete_task') {
      const all = getCollection(doc, 'tasks');
      const query = String(args.id || '').toLowerCase();
      const tk = all.find(t => t.id === query || (t.name || '').toLowerCase().includes(query));
      if (tk) {
        tk.done = true;
        tk.completedAt = Date.now();
        doc.tasks = all;
        saveLocalWorkspace(doc);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: `Task '${tk.name}' marked completed.` }]
          }
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Task matching '${args.id}' not found.` }]
        }
      };
    }

    if (tool === 'pebble_get_productivity_stats') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ app: 'PebbleX', version: VERSION, status: 'offline-disk-mode' }, null, 2) }]
        }
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method '${method}' not found` }
  };
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let reqObj = null;
  try {
    reqObj = JSON.parse(trimmed);
  } catch(e) {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' }
    }) + '\n');
    return;
  }

  try {
    // Try live bridge first
    const liveResp = await forwardToBridge(reqObj);
    process.stdout.write(JSON.stringify(liveResp) + '\n');
  } catch(e) {
    // Bridge offline -> handle via disk workspace.json
    const offlineResp = handleOfflineFallback(reqObj);
    process.stdout.write(JSON.stringify(offlineResp) + '\n');
  }
});
