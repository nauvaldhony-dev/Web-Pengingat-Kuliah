# KuliahKu — Web Pengingat Jadwal Kuliah

Aplikasi web untuk mencatat jadwal kuliah dan mengingatkan lewat notifikasi
browser sebelum kelas dimulai.

Dibuat dengan **HTML + CSS + JavaScript murni** — tanpa framework, tanpa
build step, tanpa dependency npm.

---

## ⚠️ WAJIB: Jalankan lewat Server Lokal

**Jangan buka `index.html` dengan klik dua kali.**

Kalau dibuka langsung, alamatnya jadi `file://` dan **Chrome akan memblokir
izin notifikasi secara diam-diam** (popup Allow tidak akan pernah muncul).
Firefox lebih longgar, jadi inilah kenapa dulu notifikasi muncul di Firefox
tapi tidak di Chrome.

### Cara paling gampang

**Windows** — klik dua kali file `jalankan.bat`

**Atau lewat terminal:**

```bash
cd Web-Pengingat-Kuliah
python -m http.server 8000
```

Lalu buka: **http://localhost:8000**

**Atau dengan Node.js:**

```bash
npx serve .
```

**Atau VS Code:** install extension *Live Server* → klik kanan `index.html`
→ *Open with Live Server*.

---

## Fitur

- Tambah / edit / hapus jadwal kuliah
- **Catatan per jadwal** (mis. "bawa laptop, ada kuis")
- **Hitung mundur live** di setiap kartu — kapan notifikasi akan muncul
- **Tombol 🧪 Coba Notifikasi** untuk diagnosa cepat
- Data tersimpan permanen di browser (`localStorage`)
- Statistik: total jadwal, jadwal hari ini, pengingat aktif
- **Notifikasi otomatis** sebelum kelas dimulai (5–120 menit sebelumnya)
- Notifikasi lewat **Service Worker** → jalan di desktop **dan** Android
- Bisa dipasang sebagai aplikasi (PWA) & dibuka **offline**

---

## Struktur File

| File | Fungsi |
|---|---|
| `index.html` | Struktur halaman |
| `style.css` | Tampilan & responsive layout |
| `script.js` | Semua logika aplikasi + perbaikan notifikasi |
| `sw.js` | Service Worker — penampil notifikasi & cache offline |
| `manifest.json` | Metadata PWA (nama, ikon, warna) |
| `icon-192.png`, `icon-512.png` | Ikon aplikasi & notifikasi |
| `favicon.png` | Ikon tab browser |
| `PENJELASAN-CODE.md` | **Penjelasan lengkap tiap bagian code — bahan presentasi** |

---

## Cara Test Notifikasi

### ⚠️ Baca ini dulu — kenapa notifikasi bisa terlihat "tidak muncul"

Pengingat hanya bunyi di **jendela waktu sempit**: dari `jam kelas − pengingat`
sampai `jam kelas`. Contoh: kelas jam 10:00 dengan pengingat 5 menit →
notifikasi hanya muncul antara **09:55–10:00**. Di luar itu aplikasi diam,
dan itu **normal**, bukan rusak.

### Langkah test yang benar

**1. Buktikan sistem notifikasi hidup**

Klik tombol **🧪 Coba Notifikasi** di kanan atas → notifikasi
`"Notifikasi berfungsi ✅"` harus muncul **sekarang juga**.

Kalau ini gagal, masalahnya izin/browser — bukan jadwal.

**2. Pastikan izin aktif**

Tombol kanan atas harus `🔔 Notifikasi Aktif` (disabled).
Kalau masih `Aktifkan Notifikasi`, klik dan pilih **Allow**.

**3. Test pengingat otomatis**

Tambah jadwal:

| Field | Isi |
|---|---|
| Hari | **hari ini** |
| Jam | **3 menit lagi** |
| Pengingat | **5 menit sebelumnya** |

Notifikasi muncul dalam ≤5 detik.

**4. Cek hitung mundur di kartu**

- `⏳ Notifikasi muncul dalam X` → pengingat terjadwal, tinggal tunggu
- `🔕 Notifikasi belum diaktifkan` → izin belum aktif
- `✅ Notifikasi sudah dikirim` → sudah berhasil bunyi

### Kalau masih tidak muncul

1. Address bar harus `http://localhost:8000`, bukan `file:///D:/...`
2. Tombol harus `🔔 Notifikasi Aktif`
3. Lihat hitung mundur di kartu — mungkin belum waktunya
4. Matikan **Do Not Disturb / Focus Assist** di Windows
5. Chrome: klik ikon address bar → Site settings → Notifications → **Allow**
6. Hard reload: **Ctrl+Shift+R**

> Tab harus tetap terbuka. Pengingat berjalan di halaman, bukan di background.

---

## Batasan

- Pengingat hanya aktif selama tab terbuka (butuh Push API + server untuk
  notifikasi saat tab tertutup)
- Chrome/Edge/Firefox desktop didukung penuh; Chrome Android didukung lewat
  Service Worker; Safari iOS punya dukungan terbatas
- Service Worker hanya bisa didaftarkan via `http://` atau `https://`

---

## Bahan Presentasi

Baca **`PENJELASAN-CODE.md`** — di situ ada:
- Struktur project & fungsi tiap file
- **Akar masalah notifikasi (3 penyebab) + cara pembuktiannya**
- Penjelasan per bagian `script.js` dan `sw.js`
- Tabel hasil verifikasi
- Catatan jujur soal keterbatasan
