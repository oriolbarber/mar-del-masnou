"use strict";
/* ============ Mar del Masnou · mapes en directe ============ */
const RV_API = "https://api.rainviewer.com/public/weather-maps.json";
const WINDY_PRODUCT = {wind:"ecmwf", gust:"ecmwf", waves:"ecmwfWaves", rain:"ecmwf", clouds:"ecmwf"};
const MB_URL = "https://www.meteoblue.com/ca/weather/maps/widget/41.476N2.318E?windAnimation=1&gust=1&satellite=1&cloudsAndPrecipitation=1&temperature=1&sunshine=0&extremeForecastIndex=0&geoloc=fixed&tempunit=C&windunit=kn&lengthunit=metric&zoom=8&autowidth=auto";

let mapKind = "mb", rvMap = null, rvFrames = [], rvLayers = [], rvIdx = 0, rvTimer = null, rvKind = null, rvLoadedAt = 0, windyOv = "wind";

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
  if(k === "radar" || k === "sat"){ setTimeout(() => { rvMap && rvMap.invalidateSize(); rvLoad(k); }, 0); }
  else rvPlay(false);
  if(k === "windy" && !$("windyFrame").src) $("windyFrame").src = windyUrl(windyOv);
  if(k === "mb" && !$("mbFrame").src) $("mbFrame").src = MB_URL;
}

$("mapSeg").addEventListener("click", e => { const b = e.target.closest("button[data-map]"); if(b) showMapKind(b.dataset.map); });
$("windySeg").addEventListener("click", e => { const b = e.target.closest("button[data-ov]"); if(!b) return; windyOv = b.dataset.ov;
  document.querySelectorAll("#windySeg button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); $("windyFrame").src = windyUrl(windyOv); });
$("radarPlay").addEventListener("click", () => rvPlay(!rvTimer));
$("radarSlider").addEventListener("input", e => { rvPlay(false); rvShow(+e.target.value); });
$("radarPlay").innerHTML = PLAY_IC;
window.addEventListener("mm-view", e => { if(e.detail === "map") showMapKind(mapKind); else rvPlay(false); });
document.addEventListener("visibilitychange", () => { if(document.visibilityState !== "visible") rvPlay(false); });
