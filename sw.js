// NOTA DE DADOS: este worker gerencia SOMENTE assets estáticos (cache-first).
// Dados do usuário (localStorage: epifania:notes / epifania:enc:v1 / backups / epifania:theme)
// nunca são lidos, escritos ou apagados aqui — atualização do PWA não toca neles.
// epifania:theme é chave isolada só para preferência de tema (light/dark).
const CACHE_NAME = "epifania-vintage-v5";
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
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(()=>{});
          return res;
        })
        .catch(() => {
          if (req.headers.get("accept")?.includes("text/html")) return caches.match("./index.html");
        });
    })
  );
});
