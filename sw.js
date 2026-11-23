/* =====================================================================
   SERVICE WORKER - KuliahKu
   ---------------------------------------------------------------------
   Kenapa file ini ada?
   Chrome (terutama di Android) TIDAK mengizinkan `new Notification()`
   dari halaman biasa. Error yang muncul:
       TypeError: Failed to construct 'Notification': Illegal constructor.
       Use ServiceWorkerRegistration.showNotification() instead.

   Solusinya: daftarkan Service Worker, lalu tampilkan notifikasi lewat
   `registration.showNotification()`. Di desktop Chrome/Firefox/Edge,
   cara ini juga jalan, jadi kita pakai satu jalur untuk semua.

   File ini HARUS berada satu folder dengan index.html dan hanya aktif
   kalau halaman dibuka lewat http:// atau https:// (bukan file://).
   ===================================================================== */

// Versi cache. Naikkan angka ini setiap kali aset berubah,
// supaya browser membuang cache lama.
const CACHE_NAME = "kuliahku-v2";

// Daftar file yang disimpan ke cache saat instalasi.
// Ini yang membuat aplikasi tetap terbuka walau internet mati (offline).
const ASSETS = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json",
    "./icon-192.png",
    "./icon-512.png",
    "./favicon.png"
];

/* ---------------------------------------------------------------------
   EVENT: install
   Dipanggil sekali saat Service Worker pertama kali dipasang.
   Kita simpan semua aset ke cache (precache) supaya bisa offline.
   --------------------------------------------------------------------- */
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting()) // langsung aktif tanpa tunggu tab ditutup
    );
});

/* ---------------------------------------------------------------------
   EVENT: activate
   Dipanggil saat Service Worker versi baru mulai aktif.
   Tugas: hapus cache versi lama supaya tidak menumpuk memori.
   --------------------------------------------------------------------- */
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim()) // langsung kendalikan tab yang terbuka
    );
});

/* ---------------------------------------------------------------------
   EVENT: fetch
   Dipanggil setiap halaman meminta file.
   Strategi "cache first, lalu jaringan":
   1. Cek cache dulu -> cepat & bisa offline.
   2. Kalau tidak ada di cache, ambil dari internet.
   --------------------------------------------------------------------- */
self.addEventListener("fetch", (event) => {
    // Hanya tangani permintaan GET. POST/PUT diteruskan apa adanya.
    if (event.request.method !== "GET") return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;

            return fetch(event.request).then((response) => {
                // Simpan salinan respons yang valid ke cache.
                if (response && response.status === 200 && response.type === "basic") {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, copy);
                    });
                }
                return response;
            }).catch(() => {
                // Offline dan file tidak ada di cache:
                // untuk navigasi halaman, kembalikan index.html.
                if (event.request.mode === "navigate") {
                    return caches.match("./index.html");
                }
                return new Response("", { status: 504, statusText: "Offline" });
            });
        })
    );
});

/* ---------------------------------------------------------------------
   EVENT: notificationclick
   Dipanggil saat user MENGKLIK notifikasi.
   Tugas: fokuskan tab aplikasi kalau sudah terbuka,
   atau buka tab baru kalau belum ada.
   --------------------------------------------------------------------- */
self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true })
            .then((clientList) => {
                // Kalau sudah ada tab aplikasi, fokuskan tab itu.
                for (const client of clientList) {
                    if ("focus" in client) return client.focus();
                }
                // Kalau belum ada, buka tab baru.
                if (self.clients.openWindow) {
                    return self.clients.openWindow("./index.html");
                }
            })
    );
});
