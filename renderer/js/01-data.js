/* ============================================================
   Pebble 3.0 — 01-data.js
   Seed data + default app rules + API catalog
   ============================================================ */
(function(NX){
'use strict';
const S = NX.store;

/* ---------------- profile & settings defaults ---------------- */
NX.defaults = {
  'profile': { name:'You', handle:'you', avatar:'#7CD56E', bio:'Making things happen.', plan:'Pro' },
  'settings': {
    theme:'elera', sfx:true, sfxVolume:0.5, reduceMotion:false,
    compactMode:false, widgetEnabled:false, widgetOnTop:true,
    focusGoalMin:240, distractionLimitMin:120, lang:'en'
  },
  'servers': [
    { id:'srv_hub',   name:'Pebble HQ',    color:'#7CD56E', icon:'zap',  desc:'Your workspace HQ' },
    { id:'srv_work',  name:'Work Station', color:'#5EB8FF', icon:'monitor', desc:'Projects & sprints' },
    { id:'srv_study', name:'Study Hall',   color:'#8B5CF6', icon:'book', desc:'Learning together' },
    { id:'srv_life',  name:'Life Lounge',  color:'#E8853D', icon:'fire', desc:'Chill zone' }
  ],
  'channels': {
    srv_hub:   [ {id:'ch_welcome',name:'welcome',topic:'Start here 👋'}, {id:'ch_general',name:'general',topic:'Everything & anything'}, {id:'ch_ideas',name:'ideas',topic:'Big brain energy'}, {id:'ch_updates',name:'updates',topic:'What changed in Pebble'} ],
    srv_work:  [ {id:'ch_sprint',name:'sprint-board',topic:'This week\'s sprint'}, {id:'ch_deep-work',name:'deep-work',topic:'Focus mode: ON'}, {id:'ch_ship',name:'shipped-it',topic:'Wins go here 🚀'} ],
    srv_study: [ {id:'ch_notes',name:'notes-dump',topic:'Share your notes'}, {id:'ch_questions',name:'questions',topic:'No question is dumb'}, {id:'ch_resources',name:'resources',topic:'Links & books'} ],
    srv_life:  [ {id:'ch_random',name:'random',topic:'Chaos allowed'}, {id:'ch_music',name:'music',topic:'Now playing 🎧'}, {id:'ch_gamers',name:'gamers',topic:'GG only'} ]
  },
  'messages': {},
  'notes': [
    { id:'nt_1', title:'Welcome to PebbleX Notes', body:'# Real notes, real files\n\nEvery note is a **real .md file** in a real folder on disk.\n\n- Press **/** in the editor for the Notion-style menu\n- Click **Import .md** to bring files in\n- Find them later in Documents/PebbleX Notes\n\nTip: press Ctrl+K anywhere to jump between modules.', tags:['welcome'], pinned:true, updated:Date.now()-3600e3 }
  ],
  'tasks': [
    { id:'tk_1', name:'Explore the new Pebble dashboard',   col:'today',    cat:'work',  note:'', created:Date.now()-86400e3, timeLinked:0, done:false },
    { id:'tk_2', name:'Set up Timeless app rules',          col:'today',    cat:'work',  note:'Categorize your apps', created:Date.now()-82000e3, timeLinked:0, done:false },
    { id:'tk_3', name:'Plan the week ahead',                col:'week',     cat:'work',  note:'', created:Date.now()-172000e3, timeLinked:0, done:false },
    { id:'tk_4', name:'Evening walk (20 min)',              col:'today',    cat:'health',note:'', created:Date.now()-70000e3, timeLinked:0, done:false }
  ],
  'reminders': [
    { id:'rm_1', name:'Drink water 💧', when:Date.now()+45*60e3,    repeat:'none',  cat:'health', fired:false },
    { id:'rm_2', name:'Stand up & stretch', when:Date.now()+2*3600e3, repeat:'daily', cat:'health', fired:false }
  ],
  'rules': [
    /* code & dev */
    { match:'vscode',   cat:'prod' }, { match:'code',     cat:'prod' },
    { match:'idea',     cat:'prod' }, { match:'pycharm',  cat:'prod' },
    { match:'webstorm', cat:'prod' }, { match:'rider',    cat:'prod' },
    { match:'goland',   cat:'prod' }, { match:'clion',    cat:'prod' },
    { match:'sublime',  cat:'prod' }, { match:'neovim',   cat:'prod' },
    { match:'github',   cat:'prod' }, { match:'gitlab',   cat:'prod' },
    { match:'stackoverflow', cat:'prod' }, { match:'terminal', cat:'prod' },
    { match:'powershell', cat:'prod' }, { match:'windowsterminal', cat:'prod' },
    { match:'docker',   cat:'prod' }, { match:'postman',  cat:'prod' },
    { match:'insomnia', cat:'prod' }, { match:'notion',   cat:'prod' },
    { match:'obsidian', cat:'prod' }, { match:'pebble',   cat:'prod' },
    { match:'discord',  cat:'prod' }, { match:'slack',    cat:'prod' },
    { match:'teams',    cat:'prod' }, { match:'zoom',     cat:'prod' },
    { match:'outlook',  cat:'prod' }, { match:'gmail',    cat:'prod' },
    { match:'telegram', cat:'prod' }, { match:'whatsapp', cat:'prod' },
    { match:'linear',   cat:'prod' }, { match:'jira',     cat:'prod' },
    { match:'trello',   cat:'prod' }, { match:'asana',    cat:'prod' },
    { match:'docs.google', cat:'prod' }, { match:'sheets.google', cat:'prod' },
    { match:'drive.google', cat:'prod' }, { match:'calendar.google', cat:'prod' },
    { match:'winword',  cat:'prod' }, { match:'excel',    cat:'prod' },
    { match:'powerpnt', cat:'prod' }, { match:'onenote',  cat:'prod' },
    { match:'office',   cat:'prod' }, { match:'libreoffice', cat:'prod' },
    { match:'figma',    cat:'prod' }, { match:'photoshop', cat:'prod' },
    { match:'illustrator', cat:'prod' }, { match:'blender', cat:'prod' },
    { match:'gimp',     cat:'prod' }, { match:'canva',    cat:'prod' },
    { match:'audacity', cat:'prod' }, { match:'premiere', cat:'prod' },
    { match:'davinci',  cat:'prod' }, { match:'unity',    cat:'prod' },
    { match:'unreal',   cat:'prod' }, { match:'godot',    cat:'prod' },
    /* neutral */
    { match:'explorer', cat:'neut' }, { match:'settings', cat:'neut' },
    { match:'control',  cat:'neut' }, { match:'notepad',  cat:'neut' },
    { match:'calculator', cat:'neut' }, { match:'mspaint', cat:'neut' },
    { match:'snipping', cat:'neut' }, { match:'taskmgr',  cat:'neut' },
    { match:'msedge',   cat:'neut' }, { match:'search',   cat:'neut' },
    { match:'wikipedia', cat:'neut' },
    /* distraction */
    { match:'youtube',  cat:'distr' }, { match:'instagram', cat:'distr' },
    { match:'tiktok',   cat:'distr' }, { match:'netflix',  cat:'distr' },
    { match:'twitter',  cat:'distr' }, { match:'x.com',    cat:'distr' },
    { match:'reddit',   cat:'distr' }, { match:'twitch',   cat:'distr' },
    { match:'facebook', cat:'distr' }, { match:'snapchat', cat:'distr' },
    { match:'pinterest', cat:'distr' }, { match:'threads', cat:'distr' },
    { match:'steam',    cat:'distr' }, { match:'epicgames', cat:'distr' },
    { match:'roblox',   cat:'distr' }, { match:'minecraft', cat:'distr' },
    { match:'spotify',  cat:'distr' }, { match:'hulu',     cat:'distr' },
    { match:'disney',   cat:'distr' }, { match:'primevideo', cat:'distr' }
  ],

  /* real-AI settings (Pollinations — no key, real models) */
  'ai': { model:'openai', context:true, history:[] },

  /* onboarding + whats-new flags */
  'onboarded': false,
  'whatsnew': '',
  'timeless': {},          // { 'YYYY-MM-DD': { appKey: { name, cat, sec, isSite } } }
  'sessions': [],          // linked sessions {id, date, app, cat, sec, taskId?, noteId?}
  'pomo': { mode:'focus', len:25, breakLen:5 },
  'notesAutoSavedAt': 0
};

NX.ensureDefaults = function(){
  Object.keys(NX.defaults).forEach(k=>{
    if(S.get(k) == null) S.set(k, NX.defaults[k]);
  });
};

/* ---------------- dashboard live widgets (weather & jokes) ----------------
   Real key-free APIs, fetched fresh every time you open the dashboard.
   NX.weather.load() -> { ok, city, temp, desc, hi, lo, wind, hum, emoji, at }
   NX.joke.load()    -> { ok, setup, punchline, source, at }
--------------------------------------------------------------------------- */
const WCODES = {
  0:['Clear sky','\u2600\uFE0F'],1:['Mainly clear','\uD83C\uDF24\uFE0F'],2:['Partly cloudy','\u26C5'],3:['Overcast','\u2601\uFE0F'],
  45:['Fog','\uD83C\uDF2B\uFE0F'],48:['Icy fog','\uD83C\uDF2B\uFE0F'],51:['Light drizzle','\uD83C\uDF26\uFE0F'],53:['Drizzle','\uD83C\uDF26\uFE0F'],55:['Heavy drizzle','\uD83C\uDF27\uFE0F'],
  61:['Light rain','\uD83C\uDF27\uFE0F'],63:['Rain','\uD83C\uDF27\uFE0F'],65:['Heavy rain','\u26C8\uFE0F'],71:['Light snow','\uD83C\uDF28\uFE0F'],73:['Snow','\uD83C\uDF28\uFE0F'],
  75:['Heavy snow','\u2744\uFE0F'],77:['Snow grains','\uD83C\uDF28\uFE0F'],80:['Rain showers','\uD83C\uDF26\uFE0F'],81:['Showers','\uD83C\uDF27\uFE0F'],
  82:['Violent showers','\u26C8\uFE0F'],85:['Snow showers','\uD83C\uDF28\uFE0F'],86:['Heavy snow showers','\u2744\uFE0F'],95:['Thunderstorm','\u26C8\uFE0F'],
  96:['Storm + hail','\u26C8\uFE0F'],99:['Severe storm','\u26C8\uFE0F']
};
NX.WCODES = WCODES;

let _wxCache = null;

NX.weather = {
  async geo(){
    try{
      const d = await (await fetch('https://ipapi.co/json/', { cache:'no-store' })).json();
      if(d && d.latitude != null) return { lat:d.latitude, lon:d.longitude, city:d.city || d.region || 'Your area' };
    }catch(e){}
    try{
      const d = await (await fetch('https://get.geojs.io/v1/ip/geo.json', { cache:'no-store' })).json();
      if(d && d.latitude) return { lat:parseFloat(d.latitude), lon:parseFloat(d.longitude), city:d.city || d.region || 'Your area' };
    }catch(e){}
    return null;
  },
  async load(){
    try{
      const g = await this.geo();
      if(!g) throw new Error('no-geo');
      const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + g.lat + '&longitude=' + g.lon +
        '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
        '&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1';
      const w = await (await fetch(u, { cache:'no-store' })).json();
      const c = w.current || {};
      const wc = WCODES[c.weather_code] || ['Weather','\uD83C\uDF21\uFE0F'];
      const r = { ok:true, city:g.city, temp:Math.round(c.temperature_2m), feels:Math.round(c.apparent_temperature),
        desc:wc[0], emoji:wc[1],
        hi:Math.round(w.daily && w.daily.temperature_2m_max ? w.daily.temperature_2m_max[0] : c.temperature_2m),
        lo:Math.round(w.daily && w.daily.temperature_2m_min ? w.daily.temperature_2m_min[0] : c.temperature_2m),
        wind:Math.round(c.wind_speed_10m), hum:c.relative_humidity_2m, at:Date.now() };
      _wxCache = r;
      return r;
    }catch(e){
      if(_wxCache) return Object.assign({}, _wxCache, { cached:true });
      return { ok:false };
    }
  }
};

const LOCAL_JOKES = [
  ['Why do programmers prefer dark mode?','Because light attracts bugs.'],
  ['There are 10 types of people in the world.','Those who understand binary and those who don\'t.'],
  ['A SQL query walks into a bar, approaches two tables...','"Mind if I join you?"'],
  ['Why did the developer go broke?','Because he used up all his cache.'],
  ['Debugging is like being a detective...','...in a crime movie where you are also the murderer.']
];

NX.joke = {
  async load(){
    try{
      const d = await (await fetch('https://official-joke-api.appspot.com/random_joke', { cache:'no-store' })).json();
      if(d && d.setup) return { ok:true, setup:d.setup, punchline:d.punchline, source:'official-joke-api', at:Date.now() };
    }catch(e){}
    try{
      const d = await (await fetch('https://v2.jokeapi.dev/joke/Any?safe-mode', { cache:'no-store' })).json();
      if(d && !d.error){
        if(d.type === 'twopart') return { ok:true, setup:d.setup, punchline:d.delivery, source:'jokeapi', at:Date.now() };
        return { ok:true, setup:d.joke, punchline:'', source:'jokeapi', at:Date.now() };
      }
    }catch(e){}
    const lj = NX.util.pick(LOCAL_JOKES);
    return { ok:true, setup:lj[0], punchline:lj[1], source:'offline', at:Date.now() };
  }
};

/* games catalog */
NX.GAMES = [
  { id:'gm_2048',  name:'2048 Lite',    icon:'grid',    color:'#E8853D', desc:'Swipe tiles, merge numbers, chase 2048.' },
  { id:'gm_mem',   name:'Memory Match', icon:'layers',  color:'#8B5CF6', desc:'Flip cards, match pairs, train your brain.' },
  { id:'gm_react', name:'Reaction Test',icon:'zap',     color:'#7CD56E', desc:'How fast are your reflexes, really?' },
  { id:'gm_snake', name:'Snake',        icon:'target',  color:'#0FA3A3', desc:'The all-time classic. Arrows to steer.' },
  { id:'gm_word',  name:'Word Scramble',icon:'book',    color:'#5EB8FF', desc:'Unscramble the letters before time runs out.' },
  { id:'gm_click', name:'Focus Clicker',icon:'fire',    color:'#E25C4A', desc:'Click the pebble as many times as you can in 10s.' },
  { id:'gm_simon', name:'Simon Says',   icon:'star',    color:'#5EB8FF', desc:'Repeat the glowing pattern. It grows fast.' },
  { id:'gm_math',  name:'Math Rush',    icon:'grid',    color:'#0FA3A3', desc:'Solve quick math against the clock, build streaks.' },
  { id:'gm_aim',   name:'Aim Trainer',  icon:'target',  color:'#8B5CF6', desc:'Hit the dots before they move. 20 seconds.' },
  { id:'gm_type',  name:'Typing Speed', icon:'keyboard', color:'#0FA3A3', desc:'30-second typing sprint. Real WPM plus accuracy.' },
  { id:'gm_mine',  name:'Minesweeper',  icon:'bug',      color:'#E25C4A', desc:'Clear the grid without a blast. Flags are free.' },
  { id:'gm_sudoku',name:'Sudoku Lite',  icon:'hash',     color:'#3E7BFA', desc:'Real 9x9 logic puzzle. Three difficulties, notes pad.' },
  { id:'gm_stroop',name:'Color Match',  icon:'palette',  color:'#E05C9C', desc:'Name the ink, not the word. Trains selective focus.' },
  { id:'gm_code',  name:'Break the Code',icon:'key',     color:'#D4A017', desc:'Crack a 4-digit lock in as few guesses as you can.' }
];
NX.gameBest = function(id){ const b = S.get('gameBest:'+id, null); return b; };
NX.setGameBest = function(id, score){ const cur = S.get('gameBest:'+id, null); if(cur==null || score>cur) S.set('gameBest:'+id, score); };
NX.recordMin = function(id, score){ const cur = S.get('gameBest:'+id, null); if(cur==null || score<cur) S.set('gameBest:'+id, score); };
})(window.NX);
