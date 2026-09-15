// NOTA DE DADOS: este worker gerencia SOMENTE assets estáticos.
// Dados do usuário (localStorage: epifania:notes / epifania:enc:v1 / backups / epifania:theme)
// nunca são lidos, escritos ou apagados aqui — atualização do PWA não toca neles.
// epifania:theme é chave isolada só para preferência de tema (light/dark).
//
// Estratégia:
// - install: pré-cache + skipWaiting
// - activate: apaga caches antigos + claim + avisa clientes (SW_UPDATED)
// - fetch:
//   - navegações / index.html -> network-first (garante versão nova), fallback cache
//   - demais assets -> stale-while-revalidate (responde rápido, atualiza em fundo)
// - query strings (?v=...) são ignoradas no match para não duplicar cache
const CACHE_NAME = "epifania-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/storage.js",
  "./js/app.js",
  "./js/theme.js",
  "./js/markdown.js",
  "./js/validate.js",
  "./js/crypto.js",
  "./manifest.json",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then((clients) => {
        for (const c of clients) c.postMessage({ type: "SW_UPDATED", cache: CACHE_NAME });
      })
      .catch(() => {})
  );
});

// Permite que o app peça ativação imediata da nova versão
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function cacheKey(request) {
  // normaliza: remove query string para assets versionados (?v=...)
  const url = new URL(request.url);
  url.search = "";
  return url.toString();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // só gerencia mesma origem
  if (url.origin !== self.location.origin) return;

  const isNavigation =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html") ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html");

  if (isNavigation) {
    // network-first: dispositivos antigos sempre tentam a rede primeiro
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match("./index.html").then((cached) => cached || caches.match("./"))
        )
    );
    return;
  }

  // assets: stale-while-revalidate (com match ignorando query string)
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey(req), copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
