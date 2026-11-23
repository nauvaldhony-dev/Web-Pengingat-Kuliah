# PENJELASAN CODE — KuliahKu (Web Pengingat Kuliah)

Dokumen ini buat bahan presentasi: apa fungsi tiap file, tiap bagian code,
dan **kenapa** notifikasinya tadinya gagal di Chrome tapi jalan di Firefox.

---

## 0. Struktur Project

```
Web-Pengingat-Kuliah/
├── index.html      → kerangka halaman (struktur HTML)
├── style.css       → tampilan (warna, layout, responsive)
├── script.js       → seluruh logika aplikasi  ← perbaikan notifikasi ada di sini
├── sw.js           → Service Worker (BARU — kunci perbaikan notifikasi)
├── manifest.json   → metadata PWA (BARU — biar bisa di-install)
├── icon-192.png    → ikon notifikasi & PWA (BARU)
├── icon-512.png    → ikon PWA resolusi besar (BARU)
└── favicon.png     → ikon di tab browser (BARU)
```

Project ini **tidak butuh** npm, Node.js, atau dependency apa pun.
Cukup browser. Tapi notifikasi **wajib** dijalankan lewat server lokal.

---

## 1. AKAR MASALAH: Kenapa Firefox Muncul, Chrome Tidak?

Ini bagian paling penting untuk presentasi. Ada **3 penyebab** terpisah.

### Penyebab #1 — Chrome memblokir notifikasi di `file://` (penyebab utama)

Kalau `index.html` dibuka dengan **klik dua kali**, alamatnya jadi:

```
file:///D:/my-project/Web-Pengingat-Kuliah/index.html
```

Di mode ini Chrome **menolak izin notifikasi secara diam-diam**:

| Yang terjadi | Hasil di Chrome | Hasil di Firefox |
|---|---|---|
| `Notification.requestPermission()` | langsung `"denied"`, popup TIDAK muncul | popup muncul, bisa Allow |
| `Notification.permission` setelahnya | tetap `"default"` | jadi `"granted"` |
| Notifikasi tampil | ❌ tidak | ✅ ya |

**Kenapa?** Origin `file://` dianggap `null` (opaque origin). Chrome tidak bisa
menyimpan izin per-origin untuk sesuatu yang tidak punya origin. Firefox lebih
longgar dan tetap mengizinkan.

Ini **dibuktikan langsung** saat perbaikan, bukan asumsi:

```
[file://]        secureContext=true   permission=default
  requestPermission -> RESOLVED:denied      ← ditolak, tapi status tetap default
[http://127.0.0.1] secureContext=true  permission=default
  requestPermission -> butuh klik user, dan bisa granted  ← jalan normal
```

### Penyebab #2 — `new Notification()` dilarang di Chrome Android

Chrome mobile melempar error:

```
TypeError: Failed to construct 'Notification': Illegal constructor.
Use ServiceWorkerRegistration.showNotification() instead.
```

Jadi di HP Android, semua notifikasi gagal total. Solusi resminya:
pakai **Service Worker** → `registration.showNotification()`.

### Penyebab #3 — Status "denied" tidak ditangani

Setelah user pernah klik **Block**, Chrome tidak akan pernah menampilkan popup
izin lagi untuk situs itu. Code lama hanya bilang "izin belum diberikan",
tanpa memberi tahu cara memperbaikinya.

---

## 2. PERBAIKAN YANG DILAKUKAN

### A. Deteksi `file://` → beri peringatan jelas

```js
const isFileProtocol = location.protocol === "file:";
```

Kalau terdeteksi, aplikasi:
1. Menampilkan **banner oranye** di atas halaman berisi cara menjalankannya.
2. Menonaktifkan tombol notifikasi dengan label
   `🔔 Notifikasi nonaktif (file://)`.
3. Kalau tombol tetap diklik → muncul `alert` berisi perintah
   `python -m http.server 8000`.

**Ini yang mengubah "gagal diam-diam" jadi "gagal dengan penjelasan".**

### B. Service Worker untuk notifikasi

Urutan di `showNotification()`:

```js
// 1. Coba lewat Service Worker (jalur resmi, jalan di desktop + Android)
if (swRegistration && swRegistration.showNotification) {
    await swRegistration.showNotification(title, options);
    return true;
}

// 2. Fallback: konstruktor klasik (desktop, atau konteks tanpa SW)
const notification = new Notification(title, options);
```

Satu fungsi untuk semua kondisi — tidak ada lagi `TypeError` di Android.

### C. Tangani 3 status izin dengan pesan berbeda

```js
if (permission === "granted")      → aktifkan, kirim notifikasi uji
else if (permission === "denied")  → beri instruksi buka ikon gembok → Site settings
else                              → "klik lagi dan pilih Allow"
```

### D. Sinkronisasi status tombol saat halaman dibuka

`syncNotificationButton()` mengecek 4 kondisi: `file://`, browser tidak
didukung, `granted` (tombol jadi disabled), `denied` ("Notifikasi Diblokir"),
dan `default` (tombol normal).

---

## 3. PENJELASAN TIAP BAGIAN `script.js`

| Bagian | Fungsi | Penjelasan singkat |
|---|---|---|
| **1. Ambil elemen** | `getElementById` | Simpan referensi DOM sekali, biar tidak berulang. Juga deteksi `file://` dan dukungan API. |
| **2. localStorage** | `saveData()` | Simpan jadwal ke browser sebagai JSON string. Permanen, tidak hilang walau tab ditutup. |
| **3. Waktu** | `getNextClass()`, `getReminderTime()`, `formatDurasi()`, `jamLokal()` | Hitung kapan jadwal berikutnya, kapan notif bunyi, dan format teks hitung mundur. |
| **4. Tampilan** | `displaySchedules()`, `buildReminderStatusText()`, `updateCountdown()` | Gambar ulang daftar jadwal + statistik. Tiap kartu punya baris status hitung mundur yang diperbarui tiap detik. Pakai `createElement` + `textContent` (bukan `innerHTML`) supaya aman dari XSS. |
| **5. Submit form** | `form.addEventListener("submit")`, `buildSaveMessage()` | `preventDefault()` cegah reload. Validasi reminder 0–10080 menit. Setelah simpan, muncul pesan yang menyebut **jam berapa notif akan bunyi** — bukan sekadar "berhasil". |
| **6. Edit/Hapus/Reset** | `editSchedule`, `deleteSchedule`, `resetForm` | Isi form dengan data lama untuk edit (termasuk catatan); `filter()` untuk hapus; kembalikan form ke mode tambah. |
| **7. Service Worker** | `registerServiceWorker()` | Daftarkan `sw.js`, tunggu `navigator.serviceWorker.ready`. Gagal di `file://` = wajar. |
| **8. Tampilkan notif** | `showNotification()`, `buildNotificationOptions()` | Satu pintu: SW dulu, `new Notification()` sebagai cadangan. Opsi: icon, badge, tag, vibrate. |
| **9. Tombol notif** | `notificationBtn.addEventListener("click")` | Cek dukungan → cek `file://` → minta izin → tangani granted/denied/default. |
| **9b. Tombol test** | `testNotifBtn.addEventListener("click")` | Kirim notifikasi **sekarang** tanpa menunggu jadwal. Alat diagnosa: kalau ini muncul, sistem sehat dan masalahnya cuma soal waktu. |
| **10. Pengingat** | `checkReminders()`, `pruneSentReminders()` | Jalan tiap 5 detik. Kalau `now` masuk jendela `[classTime - reminder, classTime)` dan belum pernah dikirim → kirim notifikasi (termasuk catatan). Tandai dulu sebelum `await` supaya tidak dobel. |
| **11. Banner** | `showFileProtocolBanner()` | Tampilkan peringatan oranye khusus mode `file://`. |
| **12. Inisialisasi** | `init()` | Urutan startup: bersihkan riwayat lama → daftarkan SW → sinkron tombol → cek pengingat. |

---

## 4. PENJELASAN `sw.js` (Service Worker)

Service Worker = skrip yang jalan **terpisah** dari halaman, di background.
Karena "punya kehidupan sendiri", browser mengizinkannya menampilkan
notifikasi — termasuk di Android yang menolak `new Notification()`.

| Event | Fungsi |
|---|---|
| `install` | Simpan semua aset ke cache (**precache**) supaya bisa offline. `skipWaiting()` = langsung aktif. |
| `activate` | Hapus cache versi lama. `clients.claim()` = langsung kendalikan tab yang terbuka. |
| `fetch` | Strategi **cache-first**: cek cache, kalau tidak ada ambil dari internet. Kalau offline & tidak ada di cache → kembalikan `index.html`. |
| `notificationclick` | Saat notifikasi diklik: fokuskan tab aplikasi kalau sudah terbuka, kalau belum buka tab baru. |

**Batasan penting:** Service Worker **hanya bisa didaftarkan lewat http/https**.
Di `file://` pendaftarannya gagal karena origin-nya `null` — inilah alasan
aplikasi ini wajib dijalankan lewat server lokal.

---

## 5. CARA MENJALANKAN

### Cara 1 — Python (paling gampang, Python sudah ter-install)

Buka terminal di folder project:

```bash
cd D:\my-project\Web-Pengingat-Kuliah
python -m http.server 8000
```

Lalu buka di browser: **http://localhost:8000**

### Cara 2 — Node.js

```bash
npx serve .
```

### Cara 3 — VS Code Live Server

Install extension **Live Server** → klik kanan `index.html` →
"Open with Live Server".

### ❌ JANGAN cara ini

Klik dua kali `index.html` → alamat jadi `file://` → **Chrome akan
memblokir notifikasi**. Firefox mungkin masih jalan, tapi Chrome tidak.

---

## 6. CARA TEST NOTIFIKASI

### Kenapa dulu notifikasi "tidak muncul" padahal code-nya benar?

Ini penyebab paling sering, dan **bukan bug**:

Pengingat hanya bunyi di jendela waktu yang sempit:

```
[jam kelas − reminderMinutes]  ←→  [jam kelas]
```

Contoh nyata: lu set **kelas jam 10:00, reminder 5 menit**.
Notifikasi hanya akan muncul antara **09:55 – 10:00**. Kalau sekarang jam
09:00, aplikasi akan diam saja selama 55 menit. Bukan rusak — memang
belum waktunya.

Hasil uji pembuktian:

| Skenario | Masuk jendela? | Notif |
|---|---|---|
| kelas 30 menit lagi, reminder 5 menit | ❌ tidak | 0 |
| kelas 10 menit lagi, reminder 5 menit | ❌ tidak | 0 |
| kelas 6 menit lagi, reminder 5 menit | ❌ tidak | 0 |
| kelas 3 menit lagi, reminder 5 menit | ✅ ya | **1** |

Penyebab kedua: kalau izin notifikasi belum `granted`, `checkReminders()`
langsung `return` — gagal **tanpa pesan apa pun**.

### Perbaikan: aplikasi sekarang memberi tahu

Tiga hal baru supaya tidak ada lagi "gagal senyap":

1. **Hitung mundur di setiap kartu jadwal** — berdetak tiap detik:
   `⏳ Notifikasi muncul dalam 24 menit 58 detik (jam 09:55)`
2. **Pesan setelah simpan menyebut jam & sisa waktu:**
   `🔔 Notifikasi akan muncul jam 09:55 (sekitar 55 menit lagi)`
3. **Tombol `🧪 Coba Notifikasi`** — kirim notifikasi SEKARANG tanpa
   menunggu jadwal. Ini alat diagnosa:
   - muncul → sistem notifikasi sehat, masalahnya cuma soal waktu
   - gagal → masalahnya izin atau browser

### Langkah test yang benar

**Langkah 1 — buktikan sistem notifikasi hidup**

Klik **🧪 Coba Notifikasi** di kanan atas.
Notifikasi `"Notifikasi berfungsi ✅"` akan muncul **sekarang juga**.

Kalau ini gagal, jangan lanjut — cek izin (lihat bagian 7).

**Langkah 2 — pastikan izin aktif**

Kalau tombol kirinya masih `🔔 Aktifkan Notifikasi`, klik dan pilih **Allow**.

**Langkah 3 — test pengingat otomatis**

Tambah jadwal dengan aturan ini:

| Field | Isi |
|---|---|
| Hari | **hari ini** |
| Jam | **3 menit lagi** |
| Pengingat | **5 menit sebelumnya** |

Karena `jam kelas − 5 menit` sudah lewat, jendela pengingatnya **sudah
terbuka** → notifikasi muncul dalam ≤5 detik.

**Langkah 4 — cek hitung mundurnya**

Lihat baris di kartu jadwal. Kalau tertulis
`⏳ Notifikasi muncul dalam X` → pengingat terjadwal dengan benar.
Kalau tertulis `🔕 Notifikasi belum diaktifkan` → izinnya belum aktif.

> **Kenapa harus hari ini?** Karena `getNextClass()` menghitung jadwal
> **berikutnya**. Kalau lu pilih hari kemarin, sistem akan menganggapnya
> minggu depan, jadi jendela pengingatnya belum terbuka.

> **Tab harus tetap terbuka.** Pengingat berjalan di halaman (setInterval),
> jadi kalau tab ditutup, pengingat berhenti. Untuk pengingat saat tab
> tertutup butuh Push API + server — di luar cakupan project ini.

---

## 7. TROUBLESHOOTING NOTIFIKASI

Kalau semua sudah di-set tapi tetap tidak muncul, cek berurutan:

| # | Cek | Cara |
|---|---|---|
| 1 | Dibuka lewat server? | Address bar harus `http://localhost:8000`, **bukan** `file:///D:/...` |
| 2 | Izin aktif? | Tombol kanan atas harus `🔔 Notifikasi Aktif` (disabled) |
| 3 | Jam belum waktunya? | Lihat baris `⏳ Notifikasi muncul dalam X` di kartu |
| 4 | Mode senyap Windows? | Settings → System → Notifications → matikan Do Not Disturb / Focus Assist |
| 5 | Chrome diblokir diam-diam? | Klik ikon di kiri address bar → Site settings → Notifications → **Allow** → refresh |
| 6 | Service Worker basi? | Ctrl+Shift+R (hard reload), atau DevTools → Application → Service Workers → Unregister |

Diagnosa cepat: **klik `🧪 Coba Notifikasi`**. Kalau tombol ini memunculkan
notifikasi, berarti sistemnya sehat dan masalahnya nomor 3 (waktu).

---

## 8. HASIL VERIFIKASI (sudah diuji nyata di Chrome)

| Test | Hasil |
|---|---|
| Service Worker terdaftar di `http://` | ✅ `scope: http://127.0.0.1:8123/` |
| Notifikasi via SW + klik tombol asli | ✅ 1 notif, judul "Notifikasi berhasil diaktifkan 🎓" |
| Klik notifikasi → `notificationclick` | ✅ tab difokuskan |
| Status tombol setelah reload | ✅ tetap "Notifikasi Aktif", disabled |
| `file://` → banner peringatan muncul | ✅ banner oranye tampil |
| `file://` → tombol disabled + label jelas | ✅ "Notifikasi nonaktif (file://)" |
| Console error di `file://` | ✅ bersih (0 error) |
| Tambah jadwal via form | ✅ 1 jadwal, kartu muncul, alert muncul |
| Edit jadwal | ✅ judul form berubah, data tersimpan |
| Hapus jadwal | ✅ kembali ke empty state |
| Persistensi localStorage | ✅ data bertahan setelah reload |
| **Pengingat otomatis E2E** | ✅ kelas 10 menit lagi + reminder 15 menit → notif terkirim, body `"Basis Data dimulai dalam 10 menit. Dosen: Bu Sari. Ruangan: Ruang 301"` |
| Anti-dobel (3x check) | ✅ tetap 1 notifikasi |
| Offline mode (network dimatikan) | ✅ halaman tetap terbuka dari cache |
| Tombol `🧪 Coba Notifikasi` | ✅ notif "Notifikasi berfungsi ✅" muncul langsung |
| Hitung mundur berdetak tiap detik | ✅ `24 menit 2 dtk` → `24 menit 0 dtk` → `23 menit 58 dtk` |
| Pesan simpan sebut jam & sisa waktu | ✅ `Notifikasi akan muncul jam 04:39 (sekitar 24 menit 26 detik lagi)` |
| Field catatan tampil di kartu | ✅ `📝 Bawa laptop dan modul praktikum` |
| Catatan masuk body notifikasi | ✅ `...Ruangan: R301\nCatatan: Ada kuis` |

---

## 8. CATATAN JUJUR (untuk presentasi yang kredibel)

- **Firefox tidak diuji ulang** di mesin ini (tidak ter-install). Tapi
  API yang dipakai (`ServiceWorkerRegistration.showNotification`) adalah
  standar W3C yang didukung Firefox, jadi tidak ada regresi.
- **Pengingat hanya jalan saat tab terbuka.** Untuk notifikasi saat tab
  tertutup butuh Push API + server backend.
- **Batas 5 detik** respons pengingat karena `setInterval(checkReminders, 5000)`.
