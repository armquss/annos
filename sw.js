/* Annos – service worker: sovellus ja suomalaiset tuotteet toimivat ilman verkkoa */
const VERSION = 'annos-2.1.0-d1ff9473da';
const FONTS = 'annos-fonts';
const OCR = 'annos-ocr-1'; // tekstintunnistuksen tiedostot säilyvät päivitysten yli
const SHELL = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'tuotteet-fi.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== FONTS && k !== OCR) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // Iso tuotepaketti tallennetaan sovelluksen omaan tietokantaan, ei välimuistiin
    if (url.pathname.includes('tuotteet-muut-')) return;
    // Tekstintunnistus (n. 8 Mt) ladataan vasta ensimmäisellä käytöllä ja säilytetään omassa välimuistissaan
    if (/\/(ocr-[\w.-]+\.js|fin\.traineddata\.gz)$/.test(url.pathname)) {
      e.respondWith((async () => {
        const c = await caches.open(OCR);
        const hit = await c.match(url.href);
        if (hit) return hit;
        const r = await fetch(req);
        if (r && r.ok) await c.put(url.href, r.clone());
        return r;
      })());
      return;
    }
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') { const idx = await c.match('index.html'); if (idx) return idx; }
      try { return await fetch(req); }
      catch (err) {
        if (req.mode === 'navigate') { const idx = await c.match('index.html'); if (idx) return idx; }
        return Response.error();
      }
    })());
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const c = await caches.open(FONTS);
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
});
