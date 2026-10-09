"use strict";
/* ============ Mar del Masnou · previsió ============ */
const LOC = {lat:41.4766, lon:2.3185, mlat:41.465, mlon:2.33};
const COAST = 135; // la platja mira al SE
const DEFAULTS = {
  pati:     {name:"Patí català", short:"Patí",     min:5,  iMin:8,  iMax:16, max:20, gust:24, wOk:0.6, wMax:1.2},
  windsurf: {name:"Windsurf",    short:"Windsurf", min:10, iMin:14, iMax:24, max:30, gust:34, wOk:1.2, wMax:2.2},
  hobie:    {name:"Hobie Cat",   short:"Hobie",    min:6,  iMin:10, iMax:18, max:22, gust:26, wOk:0.8, wMax:1.5}
};
const SLOTS = [
  {k:"mati",   label:"Matí",   ab:"M",  range:"9–12 h",  hours:[9,10,11]},
  {k:"migdia", label:"Migdia", ab:"Mg", range:"12–15 h", hours:[12,13,14]},
  {k:"tarda",  label:"Tarda",  ab:"T",  range:"15–19 h", hours:[15,16,17,18]}
];
const VERD = [{min:80,k:"ideal",t:"Ideal"},{min:60,k:"bo",t:"Bo"},{min:35,k:"marg",t:"Marginal"},{min:-1,k:"no",t:"No apte"}];
const WINDS = ["Tramuntana","Gregal","Llevant","Xaloc","Migjorn","Garbí","Ponent","Mestral"];
const WABBR = ["TRA","GRE","LLE","XAL","MIG","GAR","PON","MES"];
const DAYS_L = ["Diumenge","Dilluns","Dimarts","Dimecres","Dijous","Divendres","Dissabte"];
const MONTHS = ["gen","feb","març","abr","maig","juny","jul","ag","set","oct","nov","des"];
const KMH = 0.539957;

const store = {
  get(k){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
let act = store.get("mm_act"); if(!DEFAULTS[act]) act = "pati";
let crit = JSON.parse(JSON.stringify(DEFAULTS));
const savedCrit = store.get("mm_crit"); if(savedCrit) for(const k in crit) if(savedCrit[k]) Object.assign(crit[k], savedCrit[k]);
let DATA = null, ST = null, openDay = null;

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const r1 = v => v==null||isNaN(v) ? "–" : (Math.round(v*10)/10).toLocaleString("ca");
const r0 = v => v==null||isNaN(v) ? "–" : String(Math.round(v));
const norm = d => ((d%360)+360)%360;
const windName = d => d==null ? "–" : WINDS[Math.round(norm(d)/45)%8];
const windAbbr = d => d==null ? "–" : WABBR[Math.round(norm(d)/45)%8];
const isOffshore = d => { if(d==null) return false; const x = norm(d); return x>=255 || x<=15; };
const isOnshore = d => { if(d==null) return false; const x = norm(d); return x>=75 && x<=195; };
const pad = n => String(n).padStart(2,"0");
function arrow(deg, size){
  if(deg==null) return "";
  const s = size||16;
  return `<svg width="${s}" height="${s}" viewBox="0 0 20 20" aria-hidden="true" style="flex:none"><g transform="rotate(${norm(deg+180)} 10 10)"><path d="M10 1.5 L15.5 16 L10 12.5 L4.5 16 Z" fill="currentColor"/></g></svg>`;
}
function wxIcon(code, size){
  const z = size||18, s = `width="${z}" height="${z}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"`;
  if(code==null) return "";
  if(code>=95) return `<svg ${s} aria-label="Tempesta"><path d="M7 15a4 4 0 1 1 1-7.9A5 5 0 0 1 18 9a3 3 0 0 1 0 6"/><path d="M12 13l-2 4h3l-2 4"/></svg>`;
  if(code>=51) return `<svg ${s} aria-label="Pluja"><path d="M7 14a4 4 0 1 1 1-7.9A5 5 0 0 1 18 8a3 3 0 0 1 0 6H7"/><path d="M9 17l-1 3M13 17l-1 3M17 17l-1 3"/></svg>`;
  if(code>=3) return `<svg ${s} aria-label="Ennuvolat"><path d="M7 18a4 4 0 1 1 1-7.9A5 5 0 0 1 18 12a3 3 0 0 1 0 6Z"/></svg>`;
  if(code>=1) return `<svg ${s} aria-label="Sol i núvols"><circle cx="8" cy="8" r="3"/><path d="M8 2v1M2 8h1M3.8 3.8l.7.7M12.2 3.8l-.7.7"/><path d="M9 19a3.5 3.5 0 1 1 1-6.8A4.5 4.5 0 0 1 19 14a2.5 2.5 0 0 1 0 5Z"/></svg>`;
  return `<svg ${s} aria-label="Sol"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
}
const IC = {
  gust:`<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h6"/>`,
  wave:`<path d="M2 15c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3"/><path d="M2 20c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3"/>`,
  per:`<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>`,
  air:`<path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0z"/>`,
  water:`<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>`,
  sun:`<path d="M17 18a5 5 0 0 0-10 0M12 9V3M4.2 10.2l1.4 1.4M18.4 11.6l1.4-1.4M1 18h2M21 18h2M23 22H1"/>`,
  speed:`<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>`,
  dist:`<path d="M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M8.5 14.5l7-7"/>`,
  course:`<circle cx="12" cy="12" r="9"/><path d="M12 7l3 8-3-2-3 2z"/>`,
  clock:`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`
};
const icon = (k, z) => `<svg width="${z||14}" height="${z||14}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;
const suit = t => t==null ? "" : t>=22 ? "Lycra o banyador" : t>=19 ? "Neoprè curt 2–3 mm" : t>=16 ? "Neoprè 3/2 mm" : "Neoprè 4/3 + escarpins";

/* ---------- puntuació ---------- */
function windScore(w, c){
  if(w==null) return null;
  if(w < c.min) return Math.max(0, 30*(w/c.min));
  if(w < c.iMin) return 40 + 60*(w-c.min)/(c.iMin-c.min);
  if(w <= c.iMax) return 100;
  if(w <= c.max) return 100 - 60*(w-c.iMax)/(c.max-c.iMax);
  return Math.max(0, 25 - 6*(w-c.max));
}
function waveScore(h, c){
  if(h==null) return 100;
  if(h <= c.wOk) return 100;
  if(h <= c.wMax) return 100 - 60*(h-c.wOk)/(c.wMax-c.wOk);
  return Math.max(0, 25 - 60*(h-c.wMax));
}
function scoreHour(p, c){
  const ws = windScore(p.wind, c);
  if(ws==null) return {score:null, flags:[]};
  let s = Math.min(ws, waveScore(p.wave, c));
  const flags = [];
  if(p.gust!=null && p.gust > c.gust){ s = Math.min(s, 25); flags.push("Ratxes fortes"); }
  else if(p.gust!=null && p.wind!=null && p.gust - p.wind > 10){ s -= 15; flags.push("Racheig"); }
  if(isOffshore(p.dir) && p.wind >= 6){ s = p.wind >= 10 ? Math.min(s-25, 40) : s-25; flags.push("Terral"); }
  if(p.code!=null && p.code>=95){ s = 0; flags.push("Tempesta"); }
  else if(p.pp!=null && p.pp>=60){ s -= 15; flags.push("Pluja"); }
  return {score:Math.max(0, Math.min(100, Math.round(s))), flags};
}
const verdict = s => s==null ? {k:"no",t:"Sense dades"} : VERD.find(v => s >= v.min);

/* ---------- dades ---------- */
const URL_FC = `https://api.open-meteo.com/v1/forecast?latitude=${LOC.lat}&longitude=${LOC.lon}`+
  "&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m"+
  "&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m"+
  "&daily=sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min"+
  "&wind_speed_unit=kn&timezone=Europe%2FMadrid&forecast_days=7";
const URL_MA = `https://marine-api.open-meteo.com/v1/marine?latitude=${LOC.mlat}&longitude=${LOC.mlon}`+
  "&hourly=wave_height,wave_direction,wave_period,sea_surface_temperature"+
  "&current=wave_height,wave_direction,wave_period,sea_surface_temperature"+
  "&cell_selection=sea&timezone=Europe%2FMadrid&forecast_days=7";
const URL_ST = "https://www.meteoelmasnou.cat/meteotemplateLive.txt";

async function getJSON(u){ const r = await fetch(u, {cache:"no-store"}); if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); }
function build(fc, ma){
  const hours = {}, H = fc.hourly;
  H.time.forEach((t,i) => { hours[t] = {t, temp:H.temperature_2m[i], pp:H.precipitation_probability?.[i], code:H.weather_code[i],
    wind:H.wind_speed_10m[i], dir:H.wind_direction_10m[i], gust:H.wind_gusts_10m[i], wave:null, wdir:null, per:null, sst:null}; });
  if(ma && ma.hourly){ const M = ma.hourly;
    M.time.forEach((t,i) => { const h = hours[t]; if(!h) return;
      h.wave = M.wave_height?.[i] ?? null; h.wdir = M.wave_direction?.[i] ?? null; h.per = M.wave_period?.[i] ?? null; h.sst = M.sea_surface_temperature?.[i] ?? null; }); }
  const c = fc.current || {}, mc = (ma && ma.current) || {};
  return { hours, daily: fc.daily, fetchedAt: new Date().toISOString(), marineOk: !!(ma && ma.hourly),
    now: {t:c.time, temp:c.temperature_2m, code:c.weather_code, wind:c.wind_speed_10m, dir:c.wind_direction_10m, gust:c.wind_gusts_10m,
      wave:mc.wave_height ?? null, per:mc.wave_period ?? null, wdir:mc.wave_direction ?? null, sst:mc.sea_surface_temperature ?? null} };
}
function showMsg(text, err){ const m = $("msg"); m.hidden = !text; m.textContent = text || ""; m.className = "msg"+(err?" err":""); }
async function load(){
  $("refresh").setAttribute("aria-busy","true");
  try{
    const [fc, ma] = await Promise.all([getJSON(URL_FC), getJSON(URL_MA).catch(()=>null)]);
    DATA = build(fc, ma); store.set("mm_cache", DATA);
    showMsg(DATA.marineOk ? "" : "Sense dades d'onatge ara mateix: la valoració només té en compte el vent.");
  }catch(e){
    const cached = store.get("mm_cache");
    if(cached){ DATA = cached; showMsg("Sense connexió. Mostro la previsió desada el "+stamp(cached.fetchedAt)+".", true); }
    else { showMsg("No s'ha pogut carregar la previsió. Comprova la connexió i torna-ho a provar.", true); $("refresh").removeAttribute("aria-busy"); return; }
  }
  $("refresh").removeAttribute("aria-busy");
  render();
}
async function loadStation(){
  try{
    const j = await getJSON(URL_ST+"?t="+Date.now());
    ST = {wind:j.W*KMH, gust:j.G*KMH, dir:j.B, temp:j.T, hum:j.H, pres:j.P, at:(j.U||0)*1000};
  }catch(e){}
  if(DATA) renderNow();
  return ST;
}
const stFresh = () => !!(ST && (Date.now() - ST.at) < 30*60*1000);
const stamp = iso => { const d = new Date(iso); return d.toLocaleDateString("ca",{day:"numeric",month:"short"})+" a les "+d.toLocaleTimeString("ca",{hour:"2-digit",minute:"2-digit"}); };
const hourKey = (date,h) => date+"T"+pad(h)+":00";
const nowKey = () => (DATA?.now?.t || new Date().toISOString()).slice(0,13)+":00";
const todayDate = () => DATA.daily.time.find(d => d === nowKey().slice(0,10)) || DATA.daily.time[0];
// Previsió de vent per a un instant qualsevol (la fa servir el registre de sortides)
function forecastAt(ms){
  if(!DATA) return null; const d = new Date(ms);
  const k = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
  return DATA.hours[k] || null;
}

function slotAgg(date, slot, c){
  const hs = slot.hours.map(h => DATA.hours[hourKey(date,h)]).filter(Boolean);
  if(!hs.length) return null;
  const vals = f => hs.map(f).filter(x=>x!=null);
  const avg = f => { const v = vals(f); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null; };
  const max = f => { const v = vals(f); return v.length ? Math.max(...v) : null; };
  let sx=0, sy=0; hs.forEach(h => { if(h.dir!=null && h.wind!=null){ sx += Math.sin(h.dir*Math.PI/180)*h.wind; sy += Math.cos(h.dir*Math.PI/180)*h.wind; }});
  const dir = (sx||sy) ? norm(Math.atan2(sx,sy)*180/Math.PI) : null;
  const sc = hs.map(h => scoreHour(h,c));
  const ss = sc.map(s=>s.score).filter(s=>s!=null);
  const score = ss.length ? Math.round(Math.min(ss.reduce((a,b)=>a+b,0)/ss.length, Math.min(...ss)+25)) : null;
  return {wind:avg(h=>h.wind), gust:max(h=>h.gust), dir, wave:max(h=>h.wave), per:avg(h=>h.per), temp:avg(h=>h.temp), sst:avg(h=>h.sst),
    code:max(h=>h.code), score, flags:[...new Set(sc.flatMap(s=>s.flags))], past: hs[hs.length-1].t < nowKey()};
}

/* ---------- indicador d'idoneïtat ---------- */
function gaugeSvg(score, v){
  const R = 78, a0 = 135, span = 270, P = (a, r) => [Math.cos(a*Math.PI/180)*r, Math.sin(a*Math.PI/180)*r];
  const arc = (from, to, r) => { const [x0,y0] = P(from,r), [x1,y1] = P(to,r); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${to-from>180?1:0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
  const s = score ?? 0, end = a0 + span*Math.max(0.005, s/100);
  let g = `<path d="${arc(a0, a0+span, R)}" fill="none" stroke="var(--grid)" stroke-width="12" stroke-linecap="round"/>`;
  [35,60,80].forEach(t => { const a = a0+span*t/100, [x0,y0] = P(a,R-11), [x1,y1] = P(a,R+11); g += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="var(--muted)" stroke-width="1.5"/>`; });
  g += `<g class="arc" style="color:var(--${v.k})"><path d="${arc(a0, end, R)}" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round"/></g>`;
  g += `<text y="-6" text-anchor="middle" font-family="Rajdhani,sans-serif" font-weight="700" font-size="30" fill="var(--${v.k})" letter-spacing="1">${esc(v.t.toUpperCase())}</text>`;
  g += `<text y="24" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-weight="700" font-size="22" fill="var(--ink)">${score ?? "–"}<tspan font-size="12" fill="var(--muted)">/100</tspan></text>`;
  g += `<text y="70" text-anchor="middle" font-family="Rajdhani,sans-serif" font-weight="700" font-size="13" fill="var(--muted)" letter-spacing="2">IDONEÏTAT</text>`;
  return `<svg viewBox="-100 -100 200 190" role="img" aria-label="Idoneïtat ${esc(v.t)}, ${score ?? "sense dades"} sobre 100">${g}</svg>`;
}

/* ---------- rosa dels vents ---------- */
function roseSvg(o){
  const R = 80, P = (a, r) => [Math.sin(a*Math.PI/180)*r, -Math.cos(a*Math.PI/180)*r];
  const wedge = (a0, a1, r0, r1, fill) => { const [x0,y0] = P(a0,r1), [x1,y1] = P(a1,r1), [x2,y2] = P(a1,r0), [x3,y3] = P(a0,r0);
    return `<path d="M${x0} ${y0} A${r1} ${r1} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 0 0 ${x3} ${y3} Z" fill="${fill}"/>`; };
  let g = `<circle r="${R}" fill="var(--surface-2)" stroke="var(--line)" stroke-width="1.5"/>`;
  g += wedge(255, 375, 62, R, "var(--no-t)") + wedge(75, 195, 62, R, "var(--ideal-t)");
  const [cx0,cy0] = P(COAST-90, R), [cx1,cy1] = P(COAST+90, R);
  g += `<line x1="${cx0}" y1="${cy0}" x2="${cx1}" y2="${cy1}" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="3 3"/>`;
  for(let a=0; a<360; a+=5){ const big = a%45===0, mid = a%15===0; const [x0,y0] = P(a, R), [x1,y1] = P(a, R-(big?10:mid?6:3));
    g += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${big?"var(--ink)":"var(--muted)"}" stroke-width="${big?2:1}"/>`; }
  WABBR.forEach((t,i) => { const [x,y] = P(i*45, R+12); g += `<text x="${x}" y="${y+4}" text-anchor="middle" font-size="11" font-weight="700" fill="${i%2?"var(--muted)":"var(--ink)"}" font-family="Rajdhani,sans-serif" letter-spacing=".5">${t}</text>`; });
  const needle = (d, fc) => { if(d==null) return "";
    const [tx,ty] = P(d, R-6), [hx,hy] = P(d, 34), [lx,ly] = P(d-8, 48), [rx,ry] = P(d+8, 48);
    return fc ? `<line x1="${tx}" y1="${ty}" x2="${hx}" y2="${hy}" stroke="var(--muted)" stroke-width="2" stroke-dasharray="4 3"/>`
      : `<g class="needle"><line x1="${tx}" y1="${ty}" x2="${hx}" y2="${hy}" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><polygon points="${hx},${hy} ${lx},${ly} ${rx},${ry}" fill="currentColor"/></g>`; };
  if(o.live && o.fcDir!=null) g += needle(o.fcDir, true);
  g += needle(o.dir, false);
  if(o.wdir!=null){ const [a,b] = P(o.wdir, R-1), [c1,d1] = P(o.wdir-5, R-12), [e,f] = P(o.wdir+5, R-12); g += `<polygon points="${a},${b} ${c1},${d1} ${e},${f}" fill="var(--sea)"/>`; }
  g += `<circle r="31" fill="var(--surface)" stroke="var(--line)" stroke-width="1.5"/>`;
  g += `<text y="4" text-anchor="middle" font-size="24" font-weight="700" fill="var(--ink)" font-family="IBM Plex Mono,monospace">${r0(o.wind)}</text>`;
  g += `<text y="18" text-anchor="middle" font-size="9" font-weight="700" fill="var(--muted)" font-family="Rajdhani,sans-serif" letter-spacing="1">NUSOS</text>`;
  return `<svg viewBox="-114 -110 228 220" role="img" aria-label="Vent de ${windName(o.dir)} a ${r0(o.wind)} nusos">${g}</svg>`;
}

/* ---------- gràfic horari ---------- */
function hourChart(date, h0, h1, wide){
  const c = crit[act], hrs = [];
  for(let h=h0; h<=h1; h++){ const p = DATA.hours[hourKey(date,h)]; if(p) hrs.push({h, p, s:scoreHour(p,c)}); }
  if(hrs.length < 2) return "";
  const W = wide ? 760 : 380, Hh = wide ? 250 : 108, L = wide ? 34 : 6, R = wide ? 40 : 6, T = wide ? 26 : 22, B = wide ? 40 : 20;
  const pw = W-L-R, ph = Hh-T-B, n = hrs.length, dx = pw/(n-1);
  const maxK = Math.max(20, Math.ceil(Math.max(...hrs.map(x=>x.p.gust||0), c.iMax)/5)*5);
  const maxW = Math.max(1.5, Math.ceil(Math.max(...hrs.map(x=>x.p.wave||0), c.wMax)*2)/2);
  const X = j => L + dx*j, yK = k => T + ph - (k/maxK)*ph, yW = w => T + ph - (w/maxW)*ph;
  const id = "g"+Math.random().toString(36).slice(2,7);
  let g = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>`;
  g += `<rect x="${L}" y="${yK(c.iMax)}" width="${pw}" height="${yK(c.iMin)-yK(c.iMax)}" fill="var(--ideal-t)" opacity=".7"/>`;
  if(wide) for(let k=0;k<=maxK;k+=5) g += `<line x1="${L}" x2="${W-R}" y1="${yK(k)}" y2="${yK(k)}" stroke="var(--grid)"/><text x="${L-6}" y="${yK(k)+4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${k}</text>`;
  else g += `<line x1="${L}" x2="${W-R}" y1="${yK(0)}" y2="${yK(0)}" stroke="var(--grid)"/>`;
  const nk = nowKey(), ni = hrs.findIndex(x => x.p.t === nk);
  if(ni >= 0) g += `<line x1="${X(ni)}" x2="${X(ni)}" y1="${T-14}" y2="${yK(0)}" stroke="var(--accent-2)" stroke-width="1.5" stroke-dasharray="3 3"/><text x="${X(ni)}" y="${T-16}" text-anchor="middle" font-size="9" font-weight="700" fill="var(--accent-2)" font-family="Rajdhani,sans-serif" letter-spacing="1">ARA</text>`;
  const pts = hrs.map((x,j) => [X(j), yK(x.p.wind||0)]), gpts = hrs.map((x,j) => [X(j), yK(x.p.gust||0)]);
  g += `<path d="M${X(0)} ${yK(0)} L${pts.map(p=>p.join(" ")).join(" L")} L${X(n-1)} ${yK(0)} Z" fill="url(#${id})"/>`;
  g += `<polyline points="${gpts.map(p=>p.join(",")).join(" ")}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  g += `<polyline points="${pts.map(p=>p.join(",")).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>`;
  if(wide){ const wp = hrs.map((x,j) => x.p.wave==null ? null : [X(j), yW(x.p.wave)]).filter(Boolean);
    if(wp.length>1) g += `<polyline points="${wp.map(p=>p.join(",")).join(" ")}" fill="none" stroke="var(--sea)" stroke-width="2" stroke-dasharray="1 0"/>`;
    for(let w=0; w<=maxW+1e-9; w+=0.5) g += `<text x="${W-R+6}" y="${yW(w)+4}" font-size="11" fill="var(--sea)" font-family="IBM Plex Mono,monospace">${w.toLocaleString("ca")}</text>`;
    g += `<text x="${L-6}" y="12" text-anchor="end" font-size="10" fill="var(--muted)" font-family="Rajdhani,sans-serif" font-weight="700">KN</text><text x="${W-R+6}" y="12" font-size="10" fill="var(--sea)" font-family="Rajdhani,sans-serif" font-weight="700">M</text>`; }
  hrs.forEach((x,j) => {
    const [px,py] = pts[j], k = verdict(x.s.score).k;
    g += `<circle cx="${px}" cy="${py}" r="${wide?4:3.5}" fill="var(--${k})" stroke="var(--surface)" stroke-width="1.5"/>`;
    const showLbl = wide || j%2===0;
    if(showLbl) g += `<text x="${px}" y="${py-9}" text-anchor="middle" font-size="${wide?11:10}" font-weight="700" fill="var(--ink)" font-family="IBM Plex Mono,monospace">${r0(x.p.wind)}</text>`;
    if(wide){ g += `<g transform="translate(${px-7} ${Hh-B+4})" style="color:var(--ink)">${arrow(x.p.dir,14)}</g>`; g += `<text x="${px}" y="${Hh-4}" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${x.h}</text>`; }
    else if(j%2===0) g += `<text x="${px}" y="${Hh-4}" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${x.h}h</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Vent per hores">${g}</svg>`;
}
const chartLegend = wide => `<div class="legend"><span><span class="sw" style="background:var(--accent)"></span>Vent mitjà (kn)</span><span><span class="sw" style="background:var(--muted)"></span>Ratxa</span>${wide?`<span><span class="sw" style="background:var(--sea)"></span>Onada (m)</span>`:""}<span><span class="sw" style="background:var(--ideal-t);height:10px"></span>Vent ideal ${esc(DEFAULTS[act].short)}</span><span><span class="vd" style="background:var(--ideal)"></span>Punt = idoneïtat</span></div>`;
function hourTable(date, h0, h1){
  const c = crit[act], nk = nowKey(); let rows = "";
  for(let h=h0; h<=h1; h++){ const p = DATA.hours[hourKey(date,h)]; if(!p) continue; const s = scoreHour(p,c), v = verdict(s.score);
    rows += `<tr class="${p.t===nk?"now-row":""}"><td class="l">${h}:00</td><td class="l"><span class="tag k-${v.k}"><span class="vd"></span>${v.t}</span></td>
      <td class="l"><span style="display:inline-flex;align-items:center;gap:4px">${arrow(p.dir,14)}${windAbbr(p.dir)}</span></td>
      <td><b>${r0(p.wind)}</b></td><td>${r0(p.gust)}</td><td>${r1(p.wave)}</td><td>${r1(p.per)}</td><td>${r0(p.temp)}°</td><td>${r1(p.sst)}°</td><td>${p.pp ?? "–"}%</td>
      <td class="warn">${s.flags.map(esc).join(" · ")}</td></tr>`; }
  return `<div class="tbl"><table><thead><tr><th class="l">Hora</th><th class="l">Estat</th><th class="l">Dir.</th><th>Vent</th><th>Ratxa</th><th>Onada</th><th>Per. s</th><th>Aire</th><th>Aigua</th><th>Pluja</th><th class="l">Avisos</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ---------- render ---------- */
function renderSeg(){ $("actSeg").innerHTML = Object.keys(DEFAULTS).map(k => `<button type="button" data-act="${k}" aria-pressed="${k===act}">${esc(DEFAULTS[k].short)}</button>`).join(""); }
function stat(ic, label, v, unit, x){ return `<div class="stat"><div class="k"><span class="chip-ic">${icon(ic)}</span><span class="lbl">${label}</span></div><div class="v">${v}${unit?`<small>${unit}</small>`:""}</div><div class="x">${x||"&nbsp;"}</div></div>`; }
function renderNow(){
  if(!DATA) return;
  const fc = DATA.now, c = crit[act], live = stFresh();
  const n = live ? Object.assign({}, fc, {wind:ST.wind, gust:ST.gust, dir:ST.dir, temp:ST.temp}) : fc;
  if(n.wind==null){ $("hero").hidden = true; return; }
  $("hero").hidden = false;
  const s = scoreHour(n, c), v = verdict(s.score);
  const mins = live ? Math.max(0, Math.round((Date.now()-ST.at)/60000)) : null;
  $("src").className = "src"+(live?" live":"");
  $("src").innerHTML = `<span class="dot"></span>${live ? `Estació · fa ${mins} min` : "Previsió del model"}`;
  $("gauge").innerHTML = gaugeSvg(s.score, v) + `<div class="cap"><span>${esc(DEFAULTS[act].name)}</span></div>`;
  const kind = isOffshore(n.dir) ? "terral" : isOnshore(n.dir) ? "de mar" : "lateral";
  $("rose").innerHTML = roseSvg({dir:n.dir, wind:n.wind, fcDir:fc.dir, wdir:fc.wdir, live}) +
    `<div class="cap"><span><b style="color:var(--ink)">${windName(n.dir)}</b> ${r0(n.dir)}° · ${kind}</span>${live?`<span>— — model ${r0(fc.wind)} kn</span>`:""}</div>`;
  $("flags").innerHTML = s.flags.map(f => `<span class="flag">${esc(f)}</span>`).join("");
  const i = DATA.daily.time.indexOf(todayDate());
  $("stats").innerHTML =
    stat("gust", "Ratxa", r0(n.gust), "kn", n.gust!=null&&n.wind!=null ? "+"+r0(n.gust-n.wind)+" sobre la mitjana" : "") +
    stat("wave", "Onada", r1(fc.wave), "m", fc.wdir!=null ? "de "+windName(fc.wdir) : "") +
    stat("per", "Període", r1(fc.per), "s", fc.per!=null ? (fc.per<5 ? "mar de vent, curta" : fc.per<8 ? "mar mixta" : "mar de fons") : "") +
    stat("air", "Aire", r0(n.temp), "°C", live ? `Hum. ${r0(ST.hum)}% · ${r0(ST.pres)} hPa` : "") +
    stat("water", "Aigua", r1(fc.sst), "°C", suit(fc.sst)) +
    stat("sun", "Posta", DATA.daily.sunset[i]?.slice(11,16) || "–", "", "Sortida "+(DATA.daily.sunrise[i]?.slice(11,16)||"–"));
  const td = todayDate();
  const slots = SLOTS.map(sl => { const a = slotAgg(td, sl, c); if(!a) return "";
    const vv = verdict(a.score);
    return `<div class="sl k-${vv.k}${a.past?" past":""}"><div class="h">${sl.label}<span class="tag"><span class="vd"></span>${vv.t}</span></div>
      <div class="w">${arrow(a.dir,13)}${r0(a.wind)}<small>/${r0(a.gust)} kn</small></div><div class="o">${windAbbr(a.dir)} · ${r1(a.wave)} m</div></div>`; }).join("");
  $("outlook").innerHTML = `<div class="card-h" style="margin-bottom:4px"><span class="lbl">Avui · vent per hores</span>${wxIcon(fc.code,18)}</div>
    <div class="chart">${hourChart(td, 7, 21, false)}</div><div class="slots" style="margin-top:6px">${slots}</div>`;
}
function renderHours(){
  const td = todayDate(); const start = Math.max(7, Math.min(21, +nowKey().slice(11,13) - 1));
  $("hoursBody").innerHTML = `<div class="chart wide">${hourChart(td, 7, 21, true)}</div>${chartLegend(true)}${hourTable(td, start, 21)}`;
  const best = SLOTS.map(sl => ({sl, a:slotAgg(td, sl, crit[act])})).filter(x=>x.a && !x.a.past).sort((a,b)=>b.a.score-a.a.score)[0];
  $("peekHours").textContent = best ? "Millor: "+best.sl.label.toLowerCase()+" · "+verdict(best.a.score).t.toLowerCase() : "";
}
function dayName(date, i){ const d = new Date(date+"T12:00:00"); return {name: i===0 ? "Avui" : i===1 ? "Demà" : DAYS_L[d.getDay()], dm: d.getDate()+" "+MONTHS[d.getMonth()]}; }
function renderWeek(){
  const c = crit[act], D = DATA.daily; let html = "", good = 0;
  D.time.forEach((date, i) => {
    const dn = dayName(date, i), aggs = SLOTS.map(sl => slotAgg(date, sl, c));
    const pills = aggs.map((a,j) => { if(!a) return `<span class="pill k-no" style="opacity:.3">–</span>`; const vv = verdict(a.score); if(!a.past && a.score>=60) good++;
      return `<span class="pill k-${vv.k}" title="${SLOTS[j].label}: ${vv.t}"${a.past?' style="opacity:.45"':""}>${SLOTS[j].ab}</span>`; }).join("");
    const ws = aggs.filter(Boolean).map(a=>a.wind), wv = aggs.filter(Boolean).map(a=>a.wave).filter(x=>x!=null);
    const domDir = aggs.filter(Boolean).sort((a,b)=>b.wind-a.wind)[0]?.dir;
    const open = openDay === date;
    html += `<button type="button" class="wrow" data-day="${date}" aria-expanded="${open}" aria-label="${dn.name} ${dn.dm}: mostra les hores">
      <span class="d"><b>${dn.name}</b><span>${dn.dm} · ${r0(D.temperature_2m_min[i])}–${r0(D.temperature_2m_max[i])}°</span></span>
      <span>${wxIcon(D.weather_code[i],20)}</span><span class="pills">${pills}</span>
      <span class="wr">${ws.length?r0(Math.min(...ws))+"–"+r0(Math.max(...ws)):"–"} kn<small>${windAbbr(domDir)} · ${wv.length?r1(Math.max(...wv)):"–"} m</small></span>
      <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>`;
    if(open) html += `<div class="wdetail"><div class="chart wide">${hourChart(date, 7, 21, true)}</div>${chartLegend(true)}</div>`;
  });
  $("week").innerHTML = html;
  $("peekWeek").textContent = good ? good+" franges bones o ideals" : "Cap franja bona";
}
function renderCrit(){
  const c = crit[act];
  $("critIntro").textContent = "Llindars per a "+DEFAULTS[act].name+". Ajusta'ls al teu nivell; es desen en aquest dispositiu.";
  $("peekCrit").textContent = DEFAULTS[act].short+" · ideal "+c.iMin+"–"+c.iMax+" kn · onada < "+r1(c.wMax)+" m";
  const F = [["min","Vent mínim (kn)",1],["iMin","Ideal des de (kn)",1],["iMax","Ideal fins a (kn)",1],["max","Vent màxim (kn)",1],["gust","Ratxa màxima (kn)",1],["wOk","Onada còmoda (m)",0.1],["wMax","Onada màxima (m)",0.1]];
  $("crit").innerHTML = F.map(([k,l,st]) => `<label for="c_${k}">${l}<input id="c_${k}" type="number" inputmode="decimal" step="${st}" min="0" value="${c[k]}" data-k="${k}"></label>`).join("");
}
function render(){
  renderSeg(); renderCrit();
  if(!DATA) return;
  renderNow(); renderHours(); renderWeek();
  $("updated").textContent = "Previsió descarregada el "+stamp(DATA.fetchedAt)+".";
}

/* ---------- tema ---------- */
const THEMES = ["auto","dark","light"];
const THEME_IC = {
  auto:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>`,
  dark:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>`,
  light:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`
};
const THEME_LBL = {auto:"automàtic (segons el mòbil)", dark:"fosc", light:"clar"};
let theme = store.get("mm_theme"); if(!THEMES.includes(theme)) theme = "auto";
function applyTheme(){
  if(theme === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
  $("themeBtn").innerHTML = THEME_IC[theme];
  $("themeBtn").setAttribute("aria-label", "Tema: "+THEME_LBL[theme]+". Canvia el tema");
  const dark = theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  $("themeColor").setAttribute("content", dark ? "#060c19" : "#e9eef5");
  window.dispatchEvent(new Event("mm-theme"));
}
$("themeBtn").addEventListener("click", () => { theme = THEMES[(THEMES.indexOf(theme)+1)%3]; store.set("mm_theme", theme); applyTheme(); });
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
applyTheme();

/* ---------- navegació ---------- */
function go(v){
  ["fc","trip","log"].forEach(k => { $("view-"+k).hidden = k !== v; });
  document.querySelectorAll(".tabs button").forEach(b => b.dataset.go === v ? b.setAttribute("aria-current","page") : b.removeAttribute("aria-current"));
  window.scrollTo({top:0});
  window.dispatchEvent(new CustomEvent("mm-view", {detail:v}));
}
document.addEventListener("click", e => { const b = e.target.closest("[data-go]"); if(b) go(b.dataset.go); });

function tick(){ const d = new Date(); $("clock").textContent = DAYS_L[d.getDay()]+" "+d.getDate()+" "+MONTHS[d.getMonth()]+" · "+pad(d.getHours())+":"+pad(d.getMinutes()); }
tick(); setInterval(tick, 20000);

/* ---------- events ---------- */
$("actSeg").addEventListener("click", e => { const b = e.target.closest("button[data-act]"); if(!b) return; act = b.dataset.act; store.set("mm_act", act); render(); });
$("week").addEventListener("click", e => { const b = e.target.closest(".wrow"); if(!b) return; openDay = openDay === b.dataset.day ? null : b.dataset.day; renderWeek(); });
$("refresh").addEventListener("click", () => { load(); loadStation(); });
$("crit").addEventListener("change", e => { const k = e.target.dataset.k; if(!k) return; const v = parseFloat(e.target.value); if(isNaN(v)) return;
  crit[act][k] = v; store.set("mm_crit", crit); renderCrit(); if(DATA){ renderNow(); renderHours(); renderWeek(); } });
$("resetCrit").addEventListener("click", () => { crit[act] = JSON.parse(JSON.stringify(DEFAULTS[act])); store.set("mm_crit", crit); render(); });

renderSeg(); renderCrit();
load(); loadStation();
setInterval(load, 30*60*1000);
setInterval(() => { if(document.visibilityState === "visible") loadStation(); }, 60*1000);
document.addEventListener("visibilitychange", () => { if(document.visibilityState !== "visible") return; loadStation(); if(DATA && Date.now()-new Date(DATA.fetchedAt) > 20*60*1000) load(); });

/* ---------- instal·lació ---------- */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; $("install").hidden = false; });
$("install").addEventListener("click", async () => { if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $("install").hidden = true; });
window.addEventListener("appinstalled", () => { $("install").hidden = true; });
if("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(()=>{});
