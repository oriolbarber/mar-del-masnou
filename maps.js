"use strict";
/* ============ Mar del Masnou · mapes en directe ============ */
const RV_API = "https://api.rainviewer.com/public/weather-maps.json";
const WINDY_PRODUCT = {wind:"ecmwf", gust:"ecmwf", waves:"ecmwfWaves", rain:"ecmwf", clouds:"ecmwf"};
const CAM_URL = "https://plataforma.streamingbarcelona.com/masnou/es/embed/";
const MB_URL = "https://www.meteoblue.com/ca/weather/maps/widget/41.476N2.318E?windAnimation=1&gust=1&satellite=1&cloudsAndPrecipitation=1&temperature=1&sunshine=0&extremeForecastIndex=0&geoloc=fixed&tempunit=C&windunit=kn&lengthunit=metric&zoom=8&autowidth=auto";

let mapKind = "mb", rvMap = null, rvFrames = [], rvLayers = [], rvIdx = 0, rvTimer = null, rvKind = null, rvLoadedAt = 0, windyOv = "waves";

const PLAY_IC = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>`;
const PAUSE_IC = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;

function rvShow(i){
  if(!rvLayers.length) return;
  rvIdx = (i + rvLayers.length) % rvLayers.length;
  rvLayers.forEach((l, j) => l.setOpacity(j === rvIdx ? (rvKind === "sat" ? 0.85 : 0.8) : 0));
  const d = new Date(rvFrames[rvIdx].time*1000), ago = Math.round((Date.now() - d)/60000);
  $("radarTime").textContent = pad(d.getHours())+":"+pad(d.getMinutes()) + (ago > 0 ? " · fa "+ago+" min" : "");
  $("radarSlider").value = rvIdx;
}
function rvPlay(on){
  clearInterval(rvTimer); rvTimer = null;
  if(on && rvLayers.length){ rvTimer = setInterval(() => { rvShow(rvIdx+1); }, rvIdx === rvLayers.length-1 ? 1500 : 650); }
  $("radarPlay").innerHTML = rvTimer ? PAUSE_IC : PLAY_IC;
  $("radarPlay").setAttribute("aria-label", rvTimer ? "Atura l'animació" : "Reprodueix l'animació");
}
async function rvLoad(kind){
  if(!window.L){ $("radarMap").innerHTML = `<div class="empty">No s'ha pogut carregar el mapa. Comprova la connexió.</div>`; return; }
  if(!rvMap){ rvMap = baseMap($("radarMap")); rvMap.setView([41.6, 2.2], 8); L.circleMarker(HOME, {radius:6, color:"#fff", weight:2, fillColor:"#ff6476", fillOpacity:1}).bindTooltip("El Masnou").addTo(rvMap); }
  if(kind === rvKind && Date.now() - rvLoadedAt < 5*60*1000) { rvPlay(true); return; }
  rvPlay(false);
  $("radarTime").textContent = "Carregant…";
  try{
    const j = await (await fetch(RV_API, {cache:"no-store"})).json();
    rvLayers.forEach(l => rvMap.removeLayer(l));
    rvFrames = kind === "sat" ? (j.satellite?.infrared || []) : [...(j.radar?.past || []), ...(j.radar?.nowcast || [])];
    const tile = kind === "sat" ? "/256/{z}/{x}/{y}/0/0_0.png" : "/256/{z}/{x}/{y}/2/1_1.png";
    rvLayers = rvFrames.map(f => L.tileLayer(j.host + f.path + tile, {opacity:0, zIndex:10, maxNativeZoom:7, maxZoom:12, attribution:'RainViewer'}).addTo(rvMap));
    rvKind = kind; rvLoadedAt = Date.now();
    $("radarSlider").max = Math.max(0, rvFrames.length-1);
    $("radarTitle").textContent = kind === "sat" ? "Satèl·lit infraroig · núvols" : "Radar de pluja · últimes 2 h";
    $("radarNote").innerHTML = kind === "sat"
      ? `Núvols vistos pel satèl·lit en infraroig: com més blancs, més alts i freds (tempestes). Font: RainViewer.`
      : `Pluja detectada pels radars meteorològics, cada 10 minuts. Font: RainViewer.`;
    if(!rvFrames.length){ $("radarTime").textContent = "Sense imatges"; return; }
    rvShow(rvFrames.length-1); rvPlay(true);
  }catch(e){ $("radarTime").textContent = "Sense connexió"; }
}
function windyUrl(ov){
  return "https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=kt"+
    `&zoom=9&overlay=${ov}&product=${WINDY_PRODUCT[ov]}&level=surface&lat=41.38&lon=2.35&detailLat=41.476&detailLon=2.318&marker=true&message=true`;
}
function showMapKind(k){
  mapKind = k;
  document.querySelectorAll("#mapSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.map === k)));
  $("mapRadar").hidden = k !== "radar";
  $("mapWindy").hidden = k !== "windy";
  $("mapMb").hidden = k !== "mb";
  $("mapCam").hidden = k !== "cam";
  if(k === "cam" && !$("camFrame").src){ $("camFrame").src = CAM_URL; setTimeout(camLoad, 50); }
  if(k !== "cam" && $("camFrame").src){ $("camFrame").removeAttribute("src"); } // atura el vídeo (dades) quan no es mira
  if(k === "radar" || k === "sat"){ setTimeout(() => { rvMap && rvMap.invalidateSize(); rvLoad(k); }, 0); }
  else rvPlay(false);
  if(k === "windy" && !$("windyFrame").src) $("windyFrame").src = windyUrl(windyOv);
  if(k === "mb" && !$("mbFrame").src) $("mbFrame").src = MB_URL;
}

$("mapSeg").addEventListener("click", e => { const b = e.target.closest("button[data-map]"); if(b) showMapKind(b.dataset.map); });
$("windySeg").addEventListener("click", e => { const b = e.target.closest("button[data-ov]"); if(!b) return; windyOv = b.dataset.ov;
  document.querySelectorAll("#windySeg button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); $("windyFrame").src = windyUrl(windyOv);
  const t = {waves:"Onades", wind:"Vent", gust:"Ratxes", rain:"Pluja", clouds:"Núvols"}[windyOv]; document.querySelector("#mapWindy .lbl").textContent = t + " · Windy"; });
$("radarPlay").addEventListener("click", () => rvPlay(!rvTimer));
$("radarSlider").addEventListener("input", e => { rvPlay(false); rvShow(+e.target.value); });
$("radarPlay").innerHTML = PLAY_IC;
window.addEventListener("mm-view", e => { if(e.detail === "map") showMapKind(mapKind); else { rvPlay(false); camClose(); $("camFrame").removeAttribute("src"); } });
document.addEventListener("visibilitychange", () => { if(document.visibilityState !== "visible") rvPlay(false); });

/* ---------- webcam a pantalla completa, girada i amb zoom ---------- */
// L'iframe de la webcam és d'un altre web: no podem tocar el vídeo, però sí fer gran i ampliar el marc sencer.
// Una capa transparent a sobre recull els gestos (pessigar, arrossegar, doble toc) quan és a pantalla completa.
const CAM = {on:false, s:1, tx:0, ty:0, pts:new Map(), pinch:null, lastTap:0};
// Enquadrament per defecte (zoom i desplaçament com a fracció de la mida del vídeo): es recorda el darrer que tria l'usuari
// i s'aplica tant al vídeo petit com a pantalla completa. Sense cap de desat, un zoom suau que retalla el marc i el cel.
const CAM_DEF = {s:1.35, fx:0, fy:0};
function camView(){ const v = store.get("mm_cam_view"); return v && v.s ? v : CAM_DEF; }
function camLoad(){ const v = camView(), f = $("camFrame"); CAM.s = v.s; CAM.tx = v.fx * f.offsetWidth; CAM.ty = v.fy * f.offsetHeight; camApply(); }
function camSave(){ const f = $("camFrame"), w = f.offsetWidth || 1, h = f.offsetHeight || 1; store.set("mm_cam_view", {s: +CAM.s.toFixed(3), fx: +(CAM.tx / w).toFixed(4), fy: +(CAM.ty / h).toFixed(4)}); }
function camApply(){
  const f = $("camFrame"), w = f.offsetWidth, h = f.offsetHeight;
  CAM.s = Math.min(5, Math.max(1, CAM.s));
  const mx = (CAM.s - 1) * w / 2, my = (CAM.s - 1) * h / 2;
  CAM.tx = Math.min(mx, Math.max(-mx, CAM.tx)); CAM.ty = Math.min(my, Math.max(-my, CAM.ty));
  f.style.transform = CAM.s === 1 ? "" : `translate(${CAM.tx}px, ${CAM.ty}px) scale(${CAM.s})`;
}
// zoom mantenint quiet el punt (px, py) relatiu al centre de l'iframe
function camZoomAt(s2, px, py){ const k = s2 / CAM.s; CAM.tx = px - (px - CAM.tx) * k; CAM.ty = py - (py - CAM.ty) * k; CAM.s = s2; camApply(); }
function camRel(e){ const r = $("camFrame").getBoundingClientRect(); return [e.clientX - (r.left + r.width/2) + CAM.tx, e.clientY - (r.top + r.height/2) + CAM.ty]; }
async function camOpen(){
  CAM.on = true; const box = $("camBox");
  box.classList.add("cam-max"); document.body.classList.add("cam-open"); $("camHint").hidden = false; setTimeout(() => { $("camHint").hidden = true; }, 4000);
  try{ if(box.requestFullscreen) await box.requestFullscreen({navigationUI:"hide"}); else if(box.webkitRequestFullscreen) box.webkitRequestFullscreen(); }catch(e){}
  try{ await screen.orientation.lock("landscape"); }catch(e){}   // Android: gira sol; on no es pot, n'hi ha prou de girar el mòbil
  setTimeout(camLoad, 300);
}
function camClose(){
  if(!CAM.on) return; CAM.on = false; camSave();
  $("camBox").classList.remove("cam-max"); document.body.classList.remove("cam-open");
  try{ screen.orientation.unlock(); }catch(e){}
  try{ if(document.fullscreenElement) document.exitFullscreen(); }catch(e){}
  setTimeout(camLoad, 300);   // el vídeo petit queda amb el mateix enquadrament
}
$("camMax").addEventListener("click", camOpen);
$("camClose").addEventListener("click", camClose);
$("camZoomIn").addEventListener("click", () => camZoomAt(CAM.s * 1.5, CAM.tx, CAM.ty));
$("camZoomOut").addEventListener("click", () => camZoomAt(CAM.s / 1.5, CAM.tx, CAM.ty));
document.addEventListener("fullscreenchange", () => { if(!document.fullscreenElement && CAM.on) camClose(); });
document.addEventListener("keydown", e => { if(e.key === "Escape" && CAM.on) camClose(); });
addEventListener("resize", () => { if(CAM.on) camApply(); else if(!$("mapCam").hidden) camLoad(); });
const ct = $("camTouch");
ct.addEventListener("pointerdown", e => {
  ct.setPointerCapture(e.pointerId); CAM.pts.set(e.pointerId, [e.clientX, e.clientY]);
  if(CAM.pts.size === 2){ const [a, b] = [...CAM.pts.values()]; CAM.pinch = {d: Math.hypot(a[0]-b[0], a[1]-b[1]), s: CAM.s, mid: [(a[0]+b[0])/2, (a[1]+b[1])/2], tx: CAM.tx, ty: CAM.ty}; }
  if(CAM.pts.size === 1){ const now = Date.now();
    if(now - CAM.lastTap < 300){ const [px, py] = camRel(e); camZoomAt(CAM.s > 1.2 ? 1 : 2.5, CAM.s > 1.2 ? 0 : px, CAM.s > 1.2 ? 0 : py); if(CAM.s === 1){ CAM.tx = CAM.ty = 0; camApply(); } CAM.lastTap = 0; }
    else CAM.lastTap = now; }
});
ct.addEventListener("pointermove", e => {
  const prev = CAM.pts.get(e.pointerId); if(!prev) return; CAM.pts.set(e.pointerId, [e.clientX, e.clientY]);
  if(CAM.pts.size >= 2 && CAM.pinch){ const [a, b] = [...CAM.pts.values()], d = Math.hypot(a[0]-b[0], a[1]-b[1]), mid = [(a[0]+b[0])/2, (a[1]+b[1])/2];
    const r = $("camFrame").getBoundingClientRect(), p0 = CAM.pinch, s2 = Math.min(5, Math.max(1, p0.s * d / p0.d)), k = s2 / p0.s;
    const cx = r.left + r.width/2 - CAM.tx, cy = r.top + r.height/2 - CAM.ty;   // centre sense transformar
    const px = p0.mid[0] - cx, py = p0.mid[1] - cy;
    CAM.s = s2; CAM.tx = px - (px - p0.tx) * k + (mid[0] - p0.mid[0]); CAM.ty = py - (py - p0.ty) * k + (mid[1] - p0.mid[1]); camApply(); }
  else if(CAM.pts.size === 1 && CAM.s > 1){ CAM.tx += e.clientX - prev[0]; CAM.ty += e.clientY - prev[1]; camApply(); }
});
const ctUp = e => { CAM.pts.delete(e.pointerId); if(CAM.pts.size < 2) CAM.pinch = null; };
ct.addEventListener("pointerup", ctUp); ct.addEventListener("pointercancel", ctUp);
ct.addEventListener("wheel", e => { e.preventDefault(); const [px, py] = camRel(e); camZoomAt(CAM.s * (e.deltaY < 0 ? 1.2 : 1/1.2), px, py); }, {passive:false});
