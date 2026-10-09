"use strict";
/* ============ Ocata Vent · mapa del vent amb taula d'hores lliscant (estil Windy) ============ */
const WM_SEA = [41.462, 2.332];          // punt de mar davant d'Ocata on es dibuixa la fletxa
const WM_BEACH = [41.4795, 2.3265];      // platja d'Ocata
const WM_H0 = 6, WM_H1 = 22;             // hores que es mostren cada dia
const KCOL = [[0,"#6d8fd8"],[4,"#3fa9d0"],[8,"#35c49a"],[12,"#7fd13b"],[16,"#e3d23a"],[20,"#f29a2e"],[25,"#e5483b"],[30,"#b33fc0"]];
const kcol = k => { let c = KCOL[0][1]; for(const [v, col] of KCOL) if(k != null && k >= v) c = col; return c; };
let wmMap = null, wmWind = null, wmWave = null, wmSel = null, wmDrag = false;

function wmKeys(){
  const out = [];
  (DATA?.daily?.time || []).forEach(date => { for(let h = WM_H0; h <= WM_H1; h++){ const k = hourKey(date, h); if(DATA.hours[k]) out.push({k, date, h}); } });
  return out;
}
function wmArrow(deg, size, color){
  if(deg == null) return "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true" style="flex:none"><g transform="rotate(${norm(deg + 180)} 10 10)"><path d="M10 1.5 L16 17 L10 13 L4 17 Z" fill="${color || "currentColor"}"/></g></svg>`;
}
function wmBadge(p){
  const c = kcol(p.wind);
  return L.divIcon({className: "wm-icon", iconSize: [0, 0], html:
    `<div class="wm-badge" style="--c:${c}">${wmArrow(p.dir, 22, "#0b1220")}<span><b>${r1(p.wind)}</b> kn<small>ratxa ${r0(p.gust)}</small></span></div>`});
}
function wmWaveBadge(p){
  return L.divIcon({className: "wm-icon", iconSize: [0, 0], html:
    `<div class="wm-badge wave">${wmArrow(p.wdir, 18, "#ffffff")}<span><b>${r1(p.wave)}</b> m<small>${r1(p.per)} s</small></span></div>`});
}
function wmEnsureMap(){
  const el = $("wmMap"); if(!el) return false;
  if(!window.L){ el.innerHTML = `<div class="empty">No s'ha pogut carregar el mapa.</div>`; return false; }
  if(wmMap) return true;
  wmMap = L.map(el, {zoomControl:false, attributionControl:true, scrollWheelZoom:false}).setView([41.468, 2.318], 12);
  wmMap.attributionControl.setPrefix(false);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:16, className:"base-tiles", attribution:"© OpenStreetMap"}).addTo(wmMap);
  L.circleMarker(WM_BEACH, {radius:5, color:"#fff", weight:2, fillColor:"#dc3427", fillOpacity:1}).bindTooltip("Ocata").addTo(wmMap);
  return true;
}
function wmSelect(k, scroll){
  if(!DATA || !DATA.hours[k]) return;
  wmSel = k;
  const [date, hh] = [k.slice(0, 10), +k.slice(11, 13)];
  const p = hourAt(date, hh) || DATA.hours[k];
  document.querySelectorAll("#wmTable [data-k]").forEach(td => td.classList.toggle("sel", td.dataset.k === k));
  const d = new Date(date + "T12:00:00");
  const src = p.obs ? `Mesurat a l'estació ${STATIONS[stKey].name}` : `Previsió ${MODELS[p.src === "auto" ? "auto" : model].label}`;
  $("wmCap").innerHTML = `<b>${DAYS_L[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad(hh)}:00</b><span class="${p.obs ? "obs" : ""}">${esc(src)}</span>`;
  $("wmNow").innerHTML = `<span class="wm-big" style="--c:${kcol(p.wind)}">${wmArrow(p.dir, 26, "currentColor")}<b>${r1(p.wind)}</b><small>kn</small></span>
    <span>${windName(p.dir)} ${r0(p.dir)}° · ratxa <b>${r0(p.gust)} kn</b></span><span>Onada <b>${r1(p.wave)} m</b> · ${r1(p.per)} s</span>`;
  if(wmEnsureMap()){
    if(wmWind) wmWind.setIcon(wmBadge(p)); else wmWind = L.marker(WM_SEA, {icon: wmBadge(p), interactive:false}).addTo(wmMap);
    if(p.wave != null){ const wp = [WM_SEA[0] - 0.012, WM_SEA[1] + 0.03]; if(wmWave) wmWave.setIcon(wmWaveBadge(p)); else wmWave = L.marker(wp, {icon: wmWaveBadge(p), interactive:false}).addTo(wmMap); }
  }
  if(scroll){ const td = document.querySelector(`#wmTable th[data-k="${k}"]`); const box = $("wmScroll");
    if(td && box) box.scrollLeft = Math.max(0, td.offsetLeft - box.clientWidth / 2 + td.offsetWidth / 2); }
}
function renderWindMap(){
  const host = $("windMap"); if(!host || !DATA) return;
  const keys = wmKeys(); if(!keys.length){ host.hidden = true; return; }
  host.hidden = false;
  const c = crit[act];
  // capçalera de dies
  const days = []; keys.forEach(x => { const last = days[days.length - 1]; if(last && last.date === x.date) last.n++; else days.push({date: x.date, n: 1}); });
  const dayRow = days.map((d, i) => { const dd = new Date(d.date + "T12:00:00"); return `<th colspan="${d.n}" class="wm-day">${i === 0 ? "Avui" : DAYS_L[dd.getDay()]} ${dd.getDate()}</th>`; }).join("");
  const cols = keys.map(x => ({...x, p: hourAt(x.date, x.h) || DATA.hours[x.k]}));
  const cell = (x, inner, style, cls) => `<td data-k="${x.k}"${style ? ` style="${style}"` : ""} class="${(x.p.obs ? "obs " : "") + (cls || "")}">${inner}</td>`;
  const row = (label, fn) => `<tr><th class="wm-lbl">${label}</th>${cols.map(fn).join("")}</tr>`;
  const html = `<table id="wmTable"><thead><tr><th class="wm-lbl"></th>${dayRow}</tr>
    <tr><th class="wm-lbl">h</th>${cols.map(x => `<th data-k="${x.k}" class="wm-h${x.p.obs ? " obs" : ""}">${x.h}</th>`).join("")}</tr></thead><tbody>
    ${row("Dir.", x => cell(x, wmArrow(x.p.dir, 16)))}
    ${row("Vent kn", x => cell(x, r0(x.p.wind), `--c:${kcol(x.p.wind)}`, "wm-col"))}
    ${row("Ratxa", x => cell(x, r0(x.p.gust), `--c:${kcol(x.p.gust)}`, "wm-col soft"))}
    ${row("Estat", x => { const v = verdict(scoreHour(x.p, c)); return cell(x, `<span class="vd" style="background:var(--${v.k})" title="${v.t}"></span>`); })}
    ${row("Onada m", x => cell(x, r1(x.p.wave)))}
    ${row("Per. s", x => cell(x, r0(x.p.per)))}
    ${row("°C", x => cell(x, r0(x.p.temp)))}
    ${row("Pluja", x => cell(x, x.p.pp != null ? x.p.pp + "%" : "–"))}
    </tbody></table>`;
  $("wmScroll").innerHTML = html;
  const nk = nowKey(), def = keys.find(x => x.k === nk)?.k || keys.find(x => x.k > nk)?.k || keys[0].k;
  const keep = wmSel && DATA.hours[wmSel] ? wmSel : def;
  wmSelect(keep, true);
  setTimeout(() => { wmMap && wmMap.invalidateSize(); }, 0);
}
// Tocar o lliscar el dit per la taula canvia l'hora del mapa
function wmPick(e, center){ const t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-k]"); if(t && (t.dataset.k !== wmSel || center)) wmSelect(t.dataset.k, !!center); }
// Un toc porta l'hora triada al centre de la franja (com a Windy); arrossegar amb el ratolí la va canviant
document.addEventListener("click", e => { if(e.target.closest && e.target.closest("#wmTable")) wmPick(e, true); });
document.addEventListener("pointerdown", e => { if(e.pointerType === "mouse" && e.target.closest("#wmTable")) wmDrag = true; });
document.addEventListener("pointermove", e => { if(wmDrag && e.pointerType === "mouse") wmPick(e); });
document.addEventListener("pointerup", () => { wmDrag = false; });
// Al mòbil el dit fa lliscar la taula: l'hora seleccionada és la del centre de la franja
let wmScrollT = null;
document.addEventListener("scroll", e => { if(e.target && e.target.id === "wmScroll"){ clearTimeout(wmScrollT); wmScrollT = setTimeout(() => {
  const box = $("wmScroll"), r = box.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + 40;
  const t = document.elementFromPoint(x, y)?.closest?.("[data-k]"); if(t && t.dataset.k !== wmSel) wmSelect(t.dataset.k, false); }, 60); } }, true);
document.addEventListener("keydown", e => { if(!e.target.closest || !e.target.closest("#wmScroll")) return;
  const keys = wmKeys().map(x => x.k), i = keys.indexOf(wmSel);
  if(e.key === "ArrowRight" && i < keys.length - 1){ e.preventDefault(); wmSelect(keys[i + 1], true); }
  if(e.key === "ArrowLeft" && i > 0){ e.preventDefault(); wmSelect(keys[i - 1], true); } });
window.addEventListener("mm-theme", () => wmSel && wmSelect(wmSel, false));
window.renderWindMap = renderWindMap;
if(DATA) renderWindMap();
