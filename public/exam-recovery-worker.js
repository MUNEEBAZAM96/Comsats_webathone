/* Cache the offline recovery shell. Authenticated exam responses always go to the network. */
const CACHE = "exam-recovery-v1";
const SHELL = "/exam-recovery.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([SHELL, "/exam-recovery.js"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("exam-recovery-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== "GET") return;
  if (url.pathname === "/exam-recovery.js") {
    event.respondWith(
      caches
        .open(CACHE)
        .then((cache) => cache.match(url.pathname))
        .then((cached) => cached ?? fetch(request)),
    );
    return;
  }
  if (
    request.mode === "navigate" &&
    /^\/student\/exams\/[^/]+\/?$/.test(url.pathname)
  ) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match(SHELL)) ?? Response.error();
      }),
    );
  }
});
