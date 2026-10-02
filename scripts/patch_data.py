#!/usr/bin/env python3
"""Remove NX.APIS catalog from 01-data.js and inject weather/joke helpers."""
import re, sys

P = '/home/z/my-project/renderer/js/01-data.js'
src = open(P, encoding='utf-8').read()

start = src.index('/* ---------------- API catalog')
end = src.index('/* games catalog */')

block = '''/* ---------------- dashboard live widgets (weather & jokes) ----------------
   Real key-free APIs, fetched fresh every time you open the dashboard.
   NX.weather.load() -> { ok, city, temp, desc, hi, lo, wind, hum, emoji, at }
   NX.joke.load()    -> { ok, setup, punchline, source, at }
--------------------------------------------------------------------------- */
const WCODES = {
  0:['Clear sky','\\u2600\\uFE0F'],1:['Mainly clear','\\uD83C\\uDF24\\uFE0F'],2:['Partly cloudy','\\u26C5'],3:['Overcast','\\u2601\\uFE0F'],
  45:['Fog','\\uD83C\\uDF2B\\uFE0F'],48:['Icy fog','\\uD83C\\uDF2B\\uFE0F'],51:['Light drizzle','\\uD83C\\uDF26\\uFE0F'],53:['Drizzle','\\uD83C\\uDF26\\uFE0F'],55:['Heavy drizzle','\\uD83C\\uDF27\\uFE0F'],
  61:['Light rain','\\uD83C\\uDF27\\uFE0F'],63:['Rain','\\uD83C\\uDF27\\uFE0F'],65:['Heavy rain','\\u26C8\\uFE0F'],71:['Light snow','\\uD83C\\uDF28\\uFE0F'],73:['Snow','\\uD83C\\uDF28\\uFE0F'],
  75:['Heavy snow','\\u2744\\uFE0F'],77:['Snow grains','\\uD83C\\uDF28\\uFE0F'],80:['Rain showers','\\uD83C\\uDF26\\uFE0F'],81:['Showers','\\uD83C\\uDF27\\uFE0F'],
  82:['Violent showers','\\u26C8\\uFE0F'],85:['Snow showers','\\uD83C\\uDF28\\uFE0F'],86:['Heavy snow showers','\\u2744\\uFE0F'],95:['Thunderstorm','\\u26C8\\uFE0F'],
  96:['Storm + hail','\\u26C8\\uFE0F'],99:['Severe storm','\\u26C8\\uFE0F']
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
      const wc = WCODES[c.weather_code] || ['Weather','\\uD83C\\uDF21\\uFE0F'];
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
  ['There are 10 types of people in the world.','Those who understand binary and those who don\\'t.'],
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

'''

src = src[:start] + block + src[end:]
open(P, 'w', encoding='utf-8').write(src)

# sanity: parse check with node
import subprocess
r = subprocess.run(['node', '--check', P], capture_output=True, text=True)
print('node --check:', 'OK' if r.returncode == 0 else r.stderr[:800])
