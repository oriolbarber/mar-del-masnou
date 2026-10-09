"use strict";
/* ============ Mar del Masnou · registre de sortides (GPS + estació) ============ */
const KN = 1.943844;          // m/s → nusos
const NM = 1852;              // metres per milla nàutica
const HOME = [41.4766, 2.3185];
const SPEED_COLORS = ["#5aaeff","#3cd0ff","#34e39a","#ffc94a","#ff6476"];
const SPEED_BINS = [2,4,6,8];  // kn
const POS = [
  {k:"cenyida", t:"Cenyida", max:60},
  {k:"traves",  t:"Través",  max:110},
  {k:"llarg",   t:"Llarg",   max:150},
  {k:"popa",    t:"Popa",    max:181}
];

/* ---------- emmagatzematge (IndexedDB, amb localStorage si falla) ---------- */
const DB = {
  _db:null,
  open(){
    if(this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      try{
        const rq = indexedDB.open("marmasnou", 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore("trips", {keyPath:"id"});
        rq.onsuccess = () => { this._db = rq.result; res(this._db); };
        rq.onerror = () => rej(rq.error);
      }catch(e){ rej(e); }
    });
  },
  async tx(mode, fn){
    try{ const db = await this.open();
      return await new Promise((res, rej) => { const t = db.transaction("trips", mode), s = t.objectStore("trips"); const r = fn(s);
        t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); });
    }catch(e){ return this.fallback(mode, fn); }
  },
  fallback(mode, fn){ // magatzem mínim sobre localStorage
    const all = store.get("mm_trips") || [];
    const s = { put:t => { const i = all.findIndex(x=>x.id===t.id); i>=0 ? all[i]=t : all.push(t); store.set("mm_trips", all); return {}; },
      getAll:() => ({result:all}), get:id => ({result:all.find(x=>x.id===id)}), delete:id => { store.set("mm_trips", all.filter(x=>x.id!==id)); return {}; } };
    const r = fn(s); return r && r.result;
  },
  put(t){ return this.tx("readwrite", s => s.put(t)); },
  all(){ return this.tx("readonly", s => s.getAll()); },
  get(id){ return this.tx("readonly", s => s.get(id)); },
  del(id){ return this.tx("readwrite", s => s.delete(id)); }
};

/* ---------- geometria ---------- */
const rad = d => d*Math.PI/180;
function hav(a, b){ const R = 6371000, dLat = rad(b.lat-a.lat), dLon = rad(b.lon-a.lon);
  const x = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(x)); }
function bearing(a, b){ const y = Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat)), x = Math.cos(rad(a.lat))*Math.sin(rad(b.lat)) - Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon));
  return norm(Math.atan2(y,x)*180/Math.PI); }
const twaOf = (course, windFrom) => Math.abs(((course - windFrom + 540) % 360) - 180);
const posOf = twa => POS.find(p => twa < p.max);
const fmtDur = ms => { const s = Math.max(0, Math.round(ms/1000)); return pad(Math.floor(s/3600))+":"+pad(Math.floor(s/60)%60)+":"+pad(s%60); };
const fmtDurShort = ms => { const m = Math.round(ms/60000); return m >= 60 ? Math.floor(m/60)+" h "+pad(m%60)+" min" : m+" min"; };
const COMPASS16 = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
const cogName = d => d==null ? "–" : COMPASS16[Math.round(norm(d)/22.5)%16];

/* ---------- estat de la sortida ---------- */
let ecoTimer = null, ecoVisible = false;
let LIVE = null, watchId = null, wakeLock = null, tTimer = null, tWind = null, tSave = null, liveMap = null, liveLine = null, liveDot = null;

function windNear(trip, t){
  let best = null, bd = Infinity;
  for(const w of trip.wind){ const d = Math.abs(w.t - t); if(d < bd){ bd = d; best = w; } }
  if(best && bd < 20*60*1000) return best;
  const f = forecastAt(t); return f ? {t, wind:f.wind, gust:f.gust, dir:f.dir, temp:f.temp, src:"model"} : null;
}

function saveLive(){ if(LIVE && !store.set("mm_live", LIVE)) $("liveGps").textContent = "Memòria plena: no es pot desar la ruta"; }

async function sampleWind(){
  if(!LIVE) return;
  await loadStation();
  const last = LIVE.wind[LIVE.wind.length-1];
  if(stFresh()){ if(!last || last.t !== ST.at) LIVE.wind.push({t:ST.at, wind:ST.wind, gust:ST.gust, dir:ST.dir, temp:ST.temp, src:"estació"}); }
  else { const f = forecastAt(Date.now()); if(f && (!last || Date.now()-last.t > 10*60*1000)) LIVE.wind.push({t:Date.now(), wind:f.wind, gust:f.gust, dir:f.dir, temp:f.temp, src:"model"}); }
  saveLive(); renderLive();
}

function onPos(pos){
  if(!LIVE) return;
  const c = pos.coords;
  const gps = $("liveGps");
  if(c.accuracy > 60){ gps.textContent = "GPS amb poca precisió (±"+Math.round(c.accuracy)+" m)"; return; }
  gps.textContent = "GPS ±"+Math.round(c.accuracy)+" m";
  const p = {t:pos.timestamp || Date.now(), lat:+c.latitude.toFixed(6), lon:+c.longitude.toFixed(6), acc:Math.round(c.accuracy),
    sog: (c.speed!=null && !isNaN(c.speed)) ? +(c.speed*KN).toFixed(2) : null, cog: (c.heading!=null && !isNaN(c.heading)) ? Math.round(c.heading) : null};
  const last = LIVE.pts[LIVE.pts.length-1];
  if(last){
    const dt = (p.t - last.t)/1000; if(dt < 3) return;
    const d = hav(last, p), calc = d/dt*KN;
    if(calc > 30) return;                 // salt de GPS impossible per a un veler lleuger
    if(p.sog == null) p.sog = +calc.toFixed(2);
    if(p.cog == null && d > 4) p.cog = Math.round(bearing(last, p));
  }
  LIVE.pts.push(p);
  if(LIVE.pts.length % 6 === 0) saveLive();
  renderLive();
}
function onPosErr(err){
  const msg = err.code === 1 ? "Has denegat l'accés a la ubicació. Activa-la per a aquesta app a la configuració del navegador." :
    err.code === 2 ? "No es troba senyal GPS. Prova a l'aire lliure." : "El GPS tarda a respondre…";
  $("liveGps").textContent = msg;
  if(err.code === 1 && LIVE && !LIVE.pts.length){ $("tripErr").textContent = msg; $("tripErr").hidden = false; }
}
async function keepAwake(){
  try{ if("wakeLock" in navigator && document.visibilityState === "visible"){ wakeLock = await navigator.wakeLock.request("screen"); } }catch(e){}
}
function startWatch(){
  if(!("geolocation" in navigator)){ $("tripErr").textContent = "Aquest navegador no té accés al GPS."; $("tripErr").hidden = false; return false; }
  keepAwake();
  clearInterval(tTimer); clearInterval(ecoTimer);
  if(LIVE.eco){
    // Estalvi: una lectura de GPS cada 20 s (el xip pot reposar entre lectures) i res més en marxa
    const fix = () => navigator.geolocation.getCurrentPosition(onPos, onPosErr, {enableHighAccuracy:true, maximumAge:5000, timeout:15000});
    fix(); ecoTimer = setInterval(fix, 20000);
    tTimer = setInterval(() => { if(LIVE){ $("liveTimer").textContent = fmtDur(Date.now()-LIVE.start); renderEco(); } }, 20000);
    setEco(true);
  } else {
    watchId = navigator.geolocation.watchPosition(onPos, onPosErr, {enableHighAccuracy:true, maximumAge:0, timeout:30000});
    tTimer = setInterval(() => { if(LIVE) $("liveTimer").textContent = fmtDur(Date.now()-LIVE.start); }, 1000);
  }
  clearInterval(tWind); tWind = setInterval(sampleWind, (LIVE.eco ? 5 : 1)*60*1000); sampleWind();
  clearInterval(tSave); tSave = setInterval(saveLive, 15000);
  return true;
}
function stopWatch(){
  if(watchId != null) navigator.geolocation.clearWatch(watchId); watchId = null;
  clearInterval(ecoTimer); ecoTimer = null; setEco(false);
  clearInterval(tTimer); clearInterval(tWind); clearInterval(tSave);
  try{ wakeLock && wakeLock.release(); }catch(e){} wakeLock = null;
}
function setRecUI(){
  const on = !!LIVE;
  $("recDot").hidden = !on;
  $("tripIdle").hidden = on; $("tripLive").hidden = !on;
  $("ctaLabel").textContent = on ? "Sortida en curs · " + fmtDurShort(Date.now()-LIVE.start) : "Inicia una sortida";
  if(on) $("liveAct").textContent = DEFAULTS[LIVE.act]?.name || "";
}

function startTrip(){
  $("tripErr").hidden = true;
  const eco = $("ecoMode").checked; store.set("mm_eco", eco);
  LIVE = {id: Date.now(), name: $("tripName").value.trim(), act, start: Date.now(), pts: [], wind: [], eco};
  if(!startWatch()){ LIVE = null; return; }
  saveLive(); setRecUI(); renderLive();
}
let confirmStop = 0, confirmDiscard = 0;
async function stopTrip(){
  if(!LIVE) return;
  if(Date.now() - confirmStop > 4000){ confirmStop = Date.now(); $("stopTrip").textContent = "Toca de nou per desar"; setTimeout(() => $("stopTrip").textContent = "Atura i desa", 4000); return; }
  stopWatch();
  const trip = Object.assign({}, LIVE, {end: Date.now()});
  if(trip.wind.length < 2) await fillModelWind(trip);
  trip.summary = summarize(trip);
  try{ await DB.put(trip); }catch(e){}
  LIVE = null; store.del("mm_live"); $("tripName").value = "";
  destroyLiveMap(); setRecUI();
  go("log"); showTrip(trip.id);
}
function discardTrip(){
  if(Date.now() - confirmDiscard > 4000){ confirmDiscard = Date.now(); $("discardTrip").textContent = "Toca de nou: s'esborrarà la ruta"; setTimeout(() => $("discardTrip").textContent = "Descarta la sortida", 4000); return; }
  stopWatch(); LIVE = null; store.del("mm_live"); destroyLiveMap(); setRecUI();
}

/* ---------- càlculs ---------- */
function segments(trip){
  const out = [], P = trip.pts;
  for(let i=1; i<P.length; i++){
    const a = P[i-1], b = P[i], dt = (b.t-a.t)/1000; if(dt <= 0) continue;
    const d = hav(a,b); out.push({a, b, d, dt, kn: d/dt*KN, course: bearing(a,b), t:b.t});
  }
  // velocitat suavitzada (mitjana de 3 trams) per evitar pics del GPS
  out.forEach((s,i) => { const w = out.slice(Math.max(0,i-1), i+2); const D = w.reduce((x,y)=>x+y.d,0), T = w.reduce((x,y)=>x+y.dt,0); s.smooth = T ? D/T*KN : 0; });
  return out;
}
function summarize(trip){
  const seg = segments(trip);
  let dist = 0, moving = 0, maxKn = 0, maxOff = 0;
  const pos = Object.fromEntries(POS.map(p => [p.k, {t:0, d:0}]));
  seg.forEach(s => {
    dist += s.d;
    if(s.dt <= 120 && s.kn > 0.8){ moving += s.dt; maxKn = Math.max(maxKn, s.smooth);
      const w = windNear(trip, s.t);
      if(w && w.dir!=null && s.kn > 1 && s.d > 3){ const p = posOf(twaOf(s.course, w.dir)); pos[p.k].t += s.dt; pos[p.k].d += s.d; } }
  });
  if(trip.pts.length) trip.pts.forEach(p => { maxOff = Math.max(maxOff, hav(trip.pts[0], p)); });
  const W = trip.wind.length ? trip.wind : [windNear(trip, (trip.start+(trip.end||Date.now()))/2)].filter(Boolean);
  const wv = W.map(w=>w.wind).filter(x=>x!=null), gv = W.map(w=>w.gust).filter(x=>x!=null), tv = W.map(w=>w.temp).filter(x=>x!=null);
  let sx=0, sy=0; W.forEach(w => { if(w.dir!=null && w.wind!=null){ sx += Math.sin(rad(w.dir))*w.wind; sy += Math.cos(rad(w.dir))*w.wind; } });
  return {
    dur: (trip.end||Date.now()) - trip.start, distNm: dist/NM, movingS: moving,
    avgKn: moving ? (dist/NM)/(moving/3600) : 0, maxKn, maxOffM: maxOff, points: trip.pts.length,
    wind: {avg: wv.length ? wv.reduce((a,b)=>a+b,0)/wv.length : null, min: wv.length?Math.min(...wv):null, max: wv.length?Math.max(...wv):null,
      gust: gv.length ? Math.max(...gv) : null, dir: (sx||sy) ? norm(Math.atan2(sx,sy)*180/Math.PI) : null, temp: tv.length ? tv.reduce((a,b)=>a+b,0)/tv.length : null,
      src: W.some(w=>w.src==="estació") ? "estació "+(STATIONS[stKey]?.name||"") : "previsió del model", n: W.length},
    pos
  };
}

/* ---------- mapes ---------- */
function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#3cd0ff"; }
function baseMap(el){
  if(!window.L) return null;
  el.innerHTML = "";
  const m = L.map(el, {zoomControl:true, attributionControl:true}).setView(HOME, 14);
  m.attributionControl.setPrefix(false);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:18, className:"base-tiles", attribution:"© OpenStreetMap"}).addTo(m);
  L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", {maxZoom:18, attribution:"© OpenSeaMap"}).addTo(m);
  return m;
}
function svgTrack(el, pts, colored){
  if(pts.length < 2){ el.innerHTML = `<div class="empty">La ruta apareixerà aquí quan hi hagi senyal GPS.</div>`; return; }
  const lats = pts.map(p=>p.lat), lons = pts.map(p=>p.lon), k = Math.cos(rad(lats[0]));
  const x0 = Math.min(...lons), x1 = Math.max(...lons), y0 = Math.min(...lats), y1 = Math.max(...lats);
  const w = Math.max((x1-x0)*k, 1e-5), h = Math.max(y1-y0, 1e-5), S = 280/Math.max(w,h);
  const X = p => 20 + ((p.lon-x0)*k)*S, Y = p => 20 + (y1-p.lat)*S;
  const line = pts.map(p => X(p).toFixed(1)+","+Y(p).toFixed(1)).join(" ");
  el.innerHTML = `<svg viewBox="0 0 320 ${Math.max(80, h*S+40)}" role="img" aria-label="Traçat de la ruta"><polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="${X(pts[0])}" cy="${Y(pts[0])}" r="5" fill="var(--ideal)"/><circle cx="${X(pts[pts.length-1])}" cy="${Y(pts[pts.length-1])}" r="5" fill="var(--no)"/></svg>`;
}
function destroyLiveMap(){ if(liveMap){ liveMap.remove(); liveMap = null; liveLine = null; liveDot = null; } }
function updateLiveMap(){
  const el = $("liveMap"), P = LIVE.pts;
  if(!window.L){ svgTrack(el, P); return; }
  if(!liveMap){ liveMap = baseMap(el); liveLine = L.polyline([], {color: cssVar("--accent"), weight:4}).addTo(liveMap); }
  if(!P.length) return;
  const ll = P.map(p => [p.lat, p.lon]); liveLine.setLatLngs(ll);
  const cur = ll[ll.length-1];
  if(!liveDot) liveDot = L.circleMarker(cur, {radius:8, color:"#fff", weight:3, fillColor: cssVar("--no"), fillOpacity:1}).addTo(liveMap); else liveDot.setLatLng(cur);
  if(P.length === 1) liveMap.setView(cur, 15); else if(!liveMap.getBounds().pad(-0.15).contains(cur)) liveMap.panTo(cur);
}
function tripMap(el, trip){
  const P = trip.pts;
  if(!window.L){ svgTrack(el, P); return null; }
  const m = baseMap(el);
  if(P.length < 2){ if(P.length) L.circleMarker([P[0].lat,P[0].lon], {radius:6}).addTo(m); return m; }
  const seg = segments(trip), groups = SPEED_COLORS.map(() => []);
  seg.forEach(s => { const i = SPEED_BINS.findIndex(b => s.smooth < b); groups[i < 0 ? 4 : i].push([[s.a.lat,s.a.lon],[s.b.lat,s.b.lon]]); });
  groups.forEach((g,i) => { if(g.length) L.polyline(g, {color: SPEED_COLORS[i], weight:5, opacity:.95}).addTo(m); });
  L.circleMarker([P[0].lat,P[0].lon], {radius:7, color:"#fff", weight:2, fillColor:"#34e39a", fillOpacity:1}).bindTooltip("Sortida").addTo(m);
  const e = P[P.length-1]; L.circleMarker([e.lat,e.lon], {radius:7, color:"#fff", weight:2, fillColor:"#ff6476", fillOpacity:1}).bindTooltip("Arribada").addTo(m);
  m.fitBounds(L.latLngBounds(P.map(p=>[p.lat,p.lon])).pad(0.15));
  return m;
}

/* ---------- vista en directe ---------- */
function renderLive(){
  if(!LIVE) return;
  const P = LIVE.pts, s = summarize(LIVE), last = P[P.length-1];
  const sogNow = last ? (P.slice(-3).reduce((a,p)=>a+(p.sog||0),0) / Math.min(3,P.length)) : null;
  const cog = last ? (last.cog ?? (P.length>1 ? bearing(P[P.length-2], last) : null)) : null;
  const w = stFresh() ? {wind:ST.wind, gust:ST.gust, dir:ST.dir, src:"estació"} : LIVE.wind[LIVE.wind.length-1] || null;
  const twa = (cog!=null && w && w.dir!=null && sogNow > 1) ? twaOf(cog, w.dir) : null;
  $("liveStats").innerHTML =
    stat("speed", "Velocitat", r1(sogNow), "kn", "Màxima "+r1(s.maxKn)+" kn") +
    stat("dist", "Distància", (s.distNm).toFixed(2).replace(".",","), "nm", "Mitjana "+r1(s.avgKn)+" kn") +
    stat("course", "Rumb", cog!=null ? r0(cog)+"°" : "–", "", cogName(cog)) +
    stat("gust", "Vent", w ? r0(w.wind) : "–", "kn", w ? windName(w.dir)+" · ratxa "+r0(w.gust)+" · "+w.src : "Sense dades") +
    stat("course", "Angle al vent", twa!=null ? r0(twa)+"°" : "–", "", twa!=null ? posOf(twa).t : "Navega per calcular-lo") +
    stat("clock", "En moviment", fmtDurShort(s.movingS*1000), "", P.length+" punts GPS");
  $("ctaLabel").textContent = "Sortida en curs · " + fmtDurShort(Date.now()-LIVE.start);
  if(LIVE.eco){ $("ecoOn").hidden = ecoVisible; renderEco(sogNow, s, w, cog); if(ecoVisible) return; }
  if(!$("view-trip").hidden) updateLiveMap();
}

/* ---------- pantalla d'estalvi ---------- */
function setEco(on){ ecoVisible = !!on && !!LIVE && LIVE.eco; $("ecoScreen").hidden = !ecoVisible; if(LIVE && LIVE.eco) $("ecoOn").hidden = ecoVisible; if(ecoVisible){ destroyLiveMap(); renderEco(); } }
function renderEco(sog, s, w, cog){
  if(!ecoVisible || !LIVE) return;
  const P = LIVE.pts, last = P[P.length-1];
  if(s === undefined){ s = summarize(LIVE); sog = last ? last.sog : null; cog = last ? last.cog : null; w = stFresh() ? {wind:ST.wind, dir:ST.dir} : LIVE.wind[LIVE.wind.length-1]; }
  const m = Math.floor((Date.now()-LIVE.start)/60000);
  $("ecoAct").textContent = DEFAULTS[LIVE.act]?.name || "";
  $("ecoGps").textContent = last ? "GPS fa "+Math.max(0, Math.round((Date.now()-last.t)/1000))+" s" : "Esperant GPS…";
  $("ecoSog").textContent = r1(sog);
  $("ecoDist").textContent = s.distNm.toFixed(2).replace(".",",");
  $("ecoTime").textContent = Math.floor(m/60)+":"+pad(m%60);
  $("ecoWind").textContent = w ? r0(w.wind) : "–"; $("ecoWindU").textContent = w ? "kn · "+windAbbr(w.dir) : "kn";
  $("ecoCog").textContent = cog!=null ? r0(cog)+"°" : "–"; $("ecoCogU").textContent = cog!=null ? cogName(cog) : "\u00a0";
}

/* ---------- vent del model per a sortides sense estació (o importades) ---------- */
async function fillModelWind(trip){
  try{
    const ymd = ms => { const d = new Date(ms); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); };
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${LOC.lat}&longitude=${LOC.lon}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m&wind_speed_unit=kn&timezone=Europe%2FMadrid&start_date=${ymd(trip.start)}&end_date=${ymd(trip.end||trip.start)}`;
    const H = (await getJSON(u)).hourly; const t0 = trip.start - 3600e3, t1 = (trip.end||trip.start) + 3600e3;
    const add = H.time.map((t,i) => ({t: new Date(t).getTime(), wind:H.wind_speed_10m[i], gust:H.wind_gusts_10m[i], dir:H.wind_direction_10m[i], temp:H.temperature_2m[i], src:"model"}))
      .filter(w => w.t >= t0 && w.t <= t1 && w.wind != null);
    trip.wind = [...trip.wind, ...add].sort((a,b) => a.t-b.t);
  }catch(e){}
}

/* ---------- importar GPX (ruta gravada amb una altra app o un rellotge) ---------- */
async function importGpx(file){
  const msg = t => { $("importMsg").textContent = t; $("importMsg").hidden = !t; };
  msg("Llegint "+file.name+"…");
  try{
    const xml = new DOMParser().parseFromString(await file.text(), "application/xml");
    const nodes = [...xml.getElementsByTagName("trkpt"), ...xml.getElementsByTagName("rtept")];
    const pts = [];
    for(const n of nodes){ const tm = n.getElementsByTagName("time")[0]; if(!tm) continue;
      const p = {t: Date.parse(tm.textContent.trim()), lat: +(+n.getAttribute("lat")).toFixed(6), lon: +(+n.getAttribute("lon")).toFixed(6), acc:null, sog:null, cog:null};
      if(isNaN(p.t) || isNaN(p.lat) || isNaN(p.lon)) continue;
      const last = pts[pts.length-1];
      if(last){ const dt = (p.t-last.t)/1000; if(dt < 1) continue; const d = hav(last,p); if(d/dt*KN > 30) continue; p.sog = +(d/dt*KN).toFixed(2); if(d > 4) p.cog = Math.round(bearing(last,p)); }
      pts.push(p);
    }
    if(pts.length < 2){ msg("Aquest fitxer no té una ruta amb hores. Cal un GPX gravat (track), no una ruta planificada."); return; }
    const nm = xml.getElementsByTagName("name")[0]?.textContent?.trim();
    const trip = {id: Date.now(), name: nm || file.name.replace(/\.gpx$/i,""), act, start: pts[0].t, end: pts[pts.length-1].t, pts, wind: [], imported: true};
    await fillModelWind(trip);
    trip.summary = summarize(trip);
    await DB.put(trip); msg(""); showTrip(trip.id);
  }catch(e){ msg("No s'ha pogut llegir el fitxer GPX."); }
}

/* ---------- historial ---------- */
let detailMap = null;
async function renderList(){
  $("logDetail").hidden = true; $("logList").hidden = false;
  if(detailMap){ detailMap.remove(); detailMap = null; }
  let trips = []; try{ trips = (await DB.all()) || []; }catch(e){}
  trips.sort((a,b) => b.start - a.start);
  const imp = `<article class="card"><div class="import-row"><label class="btn" for="gpxIn" style="display:inline-flex;align-items:center">Importa un GPX</label>
    <span class="note">Ruta gravada amb una altra app o un rellotge (funcionen amb la pantalla apagada). S'hi afegeix el vent del model.</span></div>
    <input type="file" id="gpxIn" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden><div class="msg" id="importMsg" hidden style="margin-top:8px"></div></article>`;
  if(!trips.length){ $("logList").innerHTML = `<article class="card empty">Encara no hi ha cap sortida desada.<br>Prem «Sortida» per gravar la primera.</article>` + imp; return; }
  $("logList").innerHTML = imp + `<div class="card-h" style="margin:0"><h2 style="font-size:1.3rem;text-transform:uppercase">Sortides</h2><span class="lbl">${trips.length}</span></div><div class="trips">` + trips.map(t => {
    const d = new Date(t.start), s = t.summary || summarize(t);
    return `<button type="button" class="trip" data-trip="${t.id}"><b>${esc(t.name || (DAYS_L[d.getDay()]+" "+d.getDate()+" "+MONTHS[d.getMonth()]))}</b><span class="m">${s.distNm.toFixed(1).replace(".",",")} nm</span>
      <span>${d.toLocaleDateString("ca",{day:"numeric",month:"short",year:"numeric"})} · ${pad(d.getHours())}:${pad(d.getMinutes())} · ${esc(DEFAULTS[t.act]?.short||"")}</span><span class="m" style="font-weight:600;color:var(--muted)">${fmtDurShort(s.dur)} · màx ${r1(s.maxKn)} kn</span></button>`; }).join("") + `</div>`;
}
function seriesChart(trip){
  const seg = segments(trip); if(seg.length < 3) return "";
  const t0 = trip.start, t1 = trip.end || Date.now(), W = 760, H = 220, L = 34, R = 12, T = 14, B = 28, pw = W-L-R, ph = H-T-B;
  const winds = trip.wind.filter(w => w.wind!=null);
  const maxV = Math.max(10, Math.ceil(Math.max(...seg.map(s=>s.smooth), ...winds.map(w=>w.gust||w.wind))/5)*5);
  const X = t => L + (t-t0)/(t1-t0||1)*pw, Y = v => T + ph - v/maxV*ph;
  let g = "";
  for(let v=0; v<=maxV; v+=5) g += `<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${L-6}" y="${Y(v)+4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${v}</text>`;
  const step = Math.max(1, Math.round(seg.length/300));
  g += `<polyline points="${seg.filter((_,i)=>i%step===0).map(s => X(s.t).toFixed(1)+","+Y(Math.min(s.smooth,maxV)).toFixed(1)).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
  if(winds.length > 1){
    g += `<polyline points="${winds.map(w => X(w.t)+","+Y(w.wind)).join(" ")}" fill="none" stroke="var(--accent-2)" stroke-width="2.5"/>`;
    g += `<polyline points="${winds.filter(w=>w.gust!=null).map(w => X(w.t)+","+Y(w.gust)).join(" ")}" fill="none" stroke="var(--accent-2)" stroke-width="1.5" stroke-dasharray="4 3" opacity=".8"/>`;
  }
  const mins = (t1-t0)/60000, tick = mins > 180 ? 60 : mins > 60 ? 30 : mins > 20 ? 10 : 5;
  for(let m=0; m<=mins; m+=tick){ const x = X(t0+m*60000), d = new Date(t0+m*60000); g += `<text x="${x}" y="${H-6}" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${pad(d.getHours())}:${pad(d.getMinutes())}</text>`; }
  return `<div class="chart wide"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Velocitat del vaixell i vent durant la sortida">${g}</svg></div>
    <div class="legend"><span><span class="sw" style="background:var(--accent)"></span>Velocitat vaixell (kn)</span><span><span class="sw" style="background:var(--accent-2)"></span>Vent ${winds.some(w=>w.src==="estació")?"estació":"model"} (kn)</span><span><span class="sw" style="background:var(--accent-2);opacity:.6"></span>Ratxa</span></div>`;
}
async function showTrip(id){
  const t = await DB.get(id); if(!t){ renderList(); return; }
  const s = t.summary || summarize(t), d = new Date(t.start);
  $("logList").hidden = true; $("logDetail").hidden = false;
  const posTot = POS.reduce((a,p)=>a+s.pos[p.k].t,0);
  const posRows = POS.map(p => { const v = s.pos[p.k], pc = posTot ? v.t/posTot*100 : 0, kn = v.t ? (v.d/NM)/(v.t/3600) : 0;
    return `<div class="pos"><b>${p.t}</b><span class="bar"><i style="width:${pc.toFixed(1)}%"></i></span><span>${Math.round(pc)}% · ${r1(kn)} kn</span></div>`; }).join("");
  const W = s.wind;
  $("logDetail").innerHTML = `
    <div style="display:flex;gap:8px;align-items:center"><button class="btn" type="button" id="backList">← Sortides</button></div>
    <article class="card"><span class="lbl">${esc(DEFAULTS[t.act]?.name||"")} · ${d.toLocaleDateString("ca",{weekday:"long",day:"numeric",month:"long"})}</span>
      <h2 style="font-size:1.6rem;text-transform:uppercase;margin-top:2px">${esc(t.name || "Sortida de les "+pad(d.getHours())+":"+pad(d.getMinutes()))}</h2>
      <div class="muted" style="font-weight:600;font-size:.85rem">${pad(d.getHours())}:${pad(d.getMinutes())} – ${t.end?new Date(t.end).toTimeString().slice(0,5):"–"} · ${s.points} punts GPS</div></article>
    <div class="big-stats">
      ${stat("dist","Distància", s.distNm.toFixed(2).replace(".",","), "nm", Math.round(s.distNm*NM)+" m")}
      ${stat("clock","Durada", fmtDurShort(s.dur), "", "En moviment "+fmtDurShort(s.movingS*1000))}
      ${stat("speed","Vel. mitjana", r1(s.avgKn), "kn", "Només temps en moviment")}
      ${stat("speed","Vel. màxima", r1(s.maxKn), "kn", "Mitjana de 3 trams GPS")}
      ${stat("course","Allunyament", s.maxOffM >= 1000 ? (s.maxOffM/NM).toFixed(2).replace(".",",") : r0(s.maxOffM), s.maxOffM >= 1000 ? "nm" : "m", "Màxim des del punt de sortida")}
      ${stat("gust","Vent", r0(W.avg), "kn", W.avg!=null ? windName(W.dir)+" · "+r0(W.min)+"–"+r0(W.max)+" kn" : "Sense dades")}
      ${stat("gust","Ratxa màx.", r0(W.gust), "kn", W.src)}
      ${stat("air","Aire", r0(W.temp), "°C", W.n+" lectures de vent")}
    </div>
    <article class="card"><div class="card-h"><span class="lbl">Ruta · color segons velocitat</span></div><div class="map short" id="tripMap"></div>
      <div class="legend">${SPEED_COLORS.map((c,i) => `<span><span class="sw" style="background:${c};height:6px"></span>${i===0?"< 2":i===4?"> 8":SPEED_BINS[i-1]+"–"+SPEED_BINS[i]} kn</span>`).join("")}</div></article>
    <article class="card"><div class="card-h"><span class="lbl">Velocitat i vent</span></div>${seriesChart(t) || `<p class="note">No hi ha prou punts per dibuixar el gràfic.</p>`}</article>
    <article class="card"><div class="card-h"><span class="lbl">Rumbs respecte al vent</span><span class="lbl">temps · vel. mitjana</span></div>
      ${posTot ? `<div class="pos-bars">${posRows}</div>` : `<p class="note">Cal navegar una estona amb dades de vent per calcular-ho.</p>`}
      <p class="note" style="margin-top:8px">Angle entre el rumb sobre el fons (GPS) i la direcció del vent: cenyida &lt; 60°, través 60–110°, llarg 110–150°, popa &gt; 150°. No té en compte el corrent ni l'abatiment.</p></article>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" type="button" id="expGpx">Exporta GPX</button><button class="btn" type="button" id="expCsv">Exporta CSV</button>
      <button class="btn danger" type="button" id="delTrip" style="margin-left:auto">Esborra</button></div>`;
  $("backList").onclick = renderList;
  $("expGpx").onclick = () => download(t, "gpx");
  $("expCsv").onclick = () => download(t, "csv");
  let delAt = 0;
  $("delTrip").onclick = async () => { if(Date.now()-delAt > 4000){ delAt = Date.now(); $("delTrip").textContent = "Toca de nou per esborrar"; setTimeout(()=>{ const b=$("delTrip"); if(b) b.textContent="Esborra"; }, 4000); return; }
    await DB.del(t.id); renderList(); };
  if(detailMap){ detailMap.remove(); detailMap = null; }
  setTimeout(() => { detailMap = tripMap($("tripMap"), t); }, 0);
  window.scrollTo({top:0});
}
function download(t, kind){
  const d = new Date(t.start), base = `sortida_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  let body, type;
  if(kind === "gpx"){
    type = "application/gpx+xml";
    body = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Mar del Masnou" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>${esc(t.name||base)}</name><trkseg>\n` +
      t.pts.map(p => `<trkpt lat="${p.lat}" lon="${p.lon}"><time>${new Date(p.t).toISOString()}</time></trkpt>`).join("\n") + `\n</trkseg></trk>\n</gpx>\n`;
  } else {
    type = "text/csv";
    body = "hora,lat,lon,precisio_m,velocitat_kn,rumb,vent_kn,ratxa_kn,dir_vent\n" + t.pts.map(p => { const w = windNear(t, p.t) || {};
      return [new Date(p.t).toISOString(), p.lat, p.lon, p.acc, p.sog ?? "", p.cog ?? "", w.wind!=null?w.wind.toFixed(1):"", w.gust!=null?w.gust.toFixed(1):"", w.dir ?? ""].join(","); }).join("\n");
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], {type})); a.download = base+"."+kind;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- connexions ---------- */
$("startTrip").addEventListener("click", startTrip);
$("ecoMode").checked = !!store.get("mm_eco");
$("ecoOff").addEventListener("click", () => { setEco(false); go("trip"); renderLive(); });
$("ecoOn").addEventListener("click", () => setEco(true));
$("logList").addEventListener("change", e => { if(e.target.id === "gpxIn" && e.target.files[0]) importGpx(e.target.files[0]); });
$("stopTrip").addEventListener("click", stopTrip);
$("discardTrip").addEventListener("click", discardTrip);
$("logList").addEventListener("click", e => { const b = e.target.closest("[data-trip]"); if(b) showTrip(+b.dataset.trip); });
window.addEventListener("mm-view", e => {
  if(e.detail === "trip" && LIVE) setTimeout(() => { updateLiveMap(); liveMap && liveMap.invalidateSize(); }, 0);
  if(e.detail === "log") renderList();
});
document.addEventListener("visibilitychange", () => { if(!LIVE) return; if(document.visibilityState === "visible"){ keepAwake(); sampleWind(); } else saveLive(); });
window.addEventListener("pagehide", saveLive);

// Recupera una sortida que estava en curs (app tancada o recarregada)
(function resume(){
  const saved = store.get("mm_live");
  if(saved && saved.start && Date.now() - saved.start < 18*3600*1000){ LIVE = saved; startWatch(); }
  else if(saved) store.del("mm_live");
  setRecUI();
})();
