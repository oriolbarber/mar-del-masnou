// Mar del Masnou: guarda l'app per obrir-la sense connexió. Les dades meteo sempre van a la xarxa.
const CACHE = "mar-masnou-v13";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./app.css?v=13", "./app.js?v=13", "./trip.js?v=13", "./maps.js?v=13",
  "./icons/logo.svg?v=2", "./icons/icon-192.png?v=2", "./icons/icon-512.png?v=2", "./icons/apple-touch-icon.png?v=2"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, {cache:"reload"})))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // API, estacions i mapes: directe a la xarxa
  // Xarxa primer, sense la memòria cau HTTP del navegador (així les actualitzacions arriben senceres); si no hi ha connexió, la còpia desada
  e.respondWith(
    fetch(e.request.url, {cache:"no-cache", credentials:"same-origin"})
      .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match(e.request, {ignoreSearch:true})).then(r => r || caches.match("./index.html")))
  );
});
