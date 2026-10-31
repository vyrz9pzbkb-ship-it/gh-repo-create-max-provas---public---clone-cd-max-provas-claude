// Service worker do Max Provas.
// Ao alterar ficheiros da app (HTML/CSS/JS/ícones), incremente CACHE_VERSION — e use o mesmo valor
// em MAX_PROVAS_BUILD e no ?v= dos scripts/CSS (index.html) e em MAX_PROVAS_APP_BUILD (js/app.js).
//
// HTML, JS e CSS vêm sempre da rede quando há ligação (a cache só serve offline): assim o
// index.html e os scripts são sempre da mesma versão. Servir o app.js antigo da cache com o
// index.html novo fazia o coach.js falhar e a aba Coach voltar para Provas.
const CACHE_VERSION = 'v9';
const CACHE = `max-provas-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/config.js',
  'js/app.js',
  'js/coach.js',
  'js/chat.js',
  'data/countries.json',
  'data/races/pt.json',
  'manifest.json',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  // cache: 'reload' ignora a cache HTTP do browser, para a versão nova não herdar ficheiros antigos.
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Dados (countries.json e races/*.json): rede primeiro, para ver logo as edições;
  // cada país consultado fica guardado e continua disponível offline.
  if (url.pathname.includes('/data/')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Navegação: devolve sempre o index.html (offline incluído).
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, 'index.html'));
    return;
  }

  // Código da app (JS/CSS): rede primeiro, para nunca misturar versões.
  if (/\.(js|css)$/.test(url.pathname)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Restantes ficheiros (ícones, manifest): cache primeiro, atualiza em segundo plano.
  event.respondWith(staleWhileRevalidate(event, req));
});

async function networkFirst(req, fallbackPath) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res.ok) cache.put(fallbackPath || req, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(fallbackPath || req, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  const update = fetch(req)
    .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(update);
    return cached;
  }
  return (await update) || Response.error();
}
