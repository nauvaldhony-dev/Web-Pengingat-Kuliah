/* =====================================================================
   APLIKASI PENGINGAT JADWAL KULIAH - "KuliahKu"
   file: script.js
   ---------------------------------------------------------------------
   CATATAN PERBAIKAN NOTIFIKASI (baca ini untuk presentasi):
   Masalah: di Firefox notifikasi muncul, di Chrome tidak muncul.
   Ada 3 penyebab, dan ketiganya sudah ditangani di file ini:

   1) CHROME MEMBLOKIR NOTIFIKASI DI file://
      Kalau index.html dibuka dengan klik dua kali (alamat jadi
      "file:///D:/..."), Chrome SILENTLY menolak izin notifikasi.
      Notification.requestPermission() mengembalikan "denied"
      tanpa pernah menampilkan popup, dan Notification.permission
      tetap "default". Firefox lebih longgar, jadi di Firefox muncul.
      -> Solusi: jalankan lewat server lokal (http://localhost).
         Kode sekarang MENDETEKSI file:// dan menampilkan peringatan
         jelas, bukan gagal diam-diam.

   2) KONSTRUKTOR new Notification() DILARANG DI CHROME ANDROID
      Chrome mobile melempar:
        TypeError: Failed to construct 'Notification':
        Illegal constructor. Use ServiceWorkerRegistration.showNotification()
      -> Solusi: daftarkan Service Worker, lalu tampilkan notifikasi
         lewat registration.showNotification(). Ini jalur resmi yang
         didukung desktop DAN mobile.

   3) TIDAK ADA PENANGANAN PERMISSION "denied"
      Setelah user pernah klik "Block", permintaan izin tidak akan
      pernah muncul lagi. Kode lama hanya bilang "belum diberikan".
      -> Solusi: deteksi status "denied" dan beri instruksi cara
         mengaktifkannya lagi lewat ikon gembok di address bar.
   ===================================================================== */


/* ---------------------------------------------------------------------
   BAGIAN 1: AMBIL ELEMEN HTML
   Simpan referensi elemen ke variabel supaya tidak perlu
   document.getElementById berulang kali.
   --------------------------------------------------------------------- */
const form = document.getElementById("scheduleForm");
const scheduleList = document.getElementById("scheduleList");
const notificationBtn = document.getElementById("notificationBtn");

// Nama hari, index 0 = Minggu ... 6 = Sabtu (sesuai Date.getDay()).
const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/*
   getReminderTime(schedule)
   Menghitung KAPAN notifikasi akan bunyi untuk jadwal ini.
   Rumusnya: waktu kelas berikutnya dikurangi reminderMinutes.

   Contoh: jadwal "Senin 10:00", reminder 5 menit
   -> notifikasi bunyi Senin 09:55.

   Fungsi ini dipakai di 3 tempat:
   1. checkReminders() -> menentukan kapan harus kirim.
   2. Hitung mundur di kartu jadwal -> "notif dalam 12 menit".
   3. Pesan setelah simpan -> "notif akan muncul jam 09:55".
*/
function getReminderTime(schedule) {
    const classTime = getNextClass(schedule);
    const reminderMinutes = Number(schedule.reminderMinutes ?? 15);
    return new Date(classTime.getTime() - reminderMinutes * 60 * 1000);
}

/*
   formatDurasi(ms)
   Mengubah selisih milidetik jadi teks yang enak dibaca.
   Dipakai untuk hitung mundur & pesan status.
   90000    -> "1 menit 30 detik"
   3600000  -> "1 jam 0 menit"
   45000    -> "45 detik"
*/
function formatDurasi(ms) {
    const totalDetik = Math.max(0, Math.round(ms / 1000));

    if (totalDetik < 60) return totalDetik + " detik";

    const totalMenit = Math.floor(totalDetik / 60);
    const sisaDetik = totalDetik % 60;

    if (totalMenit < 60) {
        // Selalu tampilkan detik supaya hitung mundur terlihat bergerak
        // (dan tidak terasa "loncat" saat sisa detiknya pas 0).
        return totalMenit + " menit " + sisaDetik + " detik";
    }

    const jam = Math.floor(totalMenit / 60);
    const menit = totalMenit % 60;
    return jam + " jam" + (menit ? " " + menit + " menit" : "");
}

/*
   jamLokal(date)
   Format jam jadi "HH:MM" sesuai zona waktu setempat.
   Dipakai di pesan supaya user tahu persis jam berapa notif bunyi.
*/
function jamLokal(date) {
    return String(date.getHours()).padStart(2, "0") + ":" +
           String(date.getMinutes()).padStart(2, "0");
}


// Apakah halaman dibuka langsung dari file (klik dua kali)?
// Di mode ini Chrome tidak akan pernah memberi izin notifikasi.
const isFileProtocol = location.protocol === "file:";

// Apakah browser mendukung Notification API sama sekali?
const hasNotificationApi = "Notification" in window;


/* ---------------------------------------------------------------------
   BAGIAN 2: PENYIMPANAN DATA (localStorage)
   localStorage = tempat simpan data di browser, sifatnya permanen
   (tidak hilang walau tab ditutup), disimpan per-origin.
   --------------------------------------------------------------------- */

// Ambil daftar jadwal dari localStorage. Kalau kosong / rusak, pakai [].
let schedules = JSON.parse(localStorage.getItem("jadwalKuliah")) || [];

// Simpan daftar jadwal ke localStorage (harus diubah jadi string dulu).
function saveData() {
    localStorage.setItem("jadwalKuliah", JSON.stringify(schedules));
}


/* ---------------------------------------------------------------------
   BAGIAN 3: PERHITUNGAN WAKTU
   --------------------------------------------------------------------- */

/*
   getNextClass(schedule)
   Menghitung kapan jadwal ini akan terjadi BERIKUTNYA (tanggal + jam).
   Contoh: sekarang Rabu 10:00, jadwal "Senin 08:00"
   -> hasilnya Senin depan, 08:00.

   Langkah:
   1. difference = jarak hari dari hari ini ke hari jadwal (0-6).
   2. set tanggal hari ini + difference.
   3. pasang jam & menitnya.
   4. kalau hasilnya sudah lewat (misal hari sama tapi jamnya sudah
      berlalu), tambah 7 hari -> minggu depan.
*/
function getNextClass(schedule) {
    const now = new Date();
    const target = new Date();

    const difference = (Number(schedule.day) - now.getDay() + 7) % 7;
    target.setDate(now.getDate() + difference);

    const [hour, minute] = schedule.time.split(":");
    target.setHours(Number(hour), Number(minute), 0, 0);

    if (target <= now) {
        target.setDate(target.getDate() + 7);
    }

    return target;
}


/* ---------------------------------------------------------------------
   BAGIAN 4: TAMPILAN DAFTAR JADWAL
   --------------------------------------------------------------------- */

/*
   displaySchedules()
   Menggambar ulang seluruh daftar jadwal ke layar, sekaligus
   memperbarui angka statistik di atas.

   Kenapa pakai createElement, bukan innerHTML?
   Karena data (nama mata kuliah, dosen) berasal dari input user.
   createElement + textContent aman dari serangan XSS, karena teks
   diperlakukan sebagai teks biasa, bukan kode HTML.
*/
function displaySchedules() {
    scheduleList.innerHTML = "";

    // Urutkan jadwal dari yang paling cepat dimulai.
    const sortedSchedules = [...schedules].sort(
        (a, b) => getNextClass(a) - getNextClass(b)
    );

    // --- Perbarui kartu statistik ---
    document.getElementById("totalSchedules").textContent = schedules.length;

    const today = new Date().getDay();
    document.getElementById("todaySchedules").textContent =
        schedules.filter((item) => Number(item.day) === today).length;

    document.getElementById("activeReminders").textContent = schedules.length;
    document.getElementById("scheduleCount").textContent =
        schedules.length + " Jadwal";

    // --- Kalau belum ada jadwal, tampilkan empty state ---
    if (sortedSchedules.length === 0) {
        scheduleList.innerHTML = `
            <div class="empty-state">
                <div>📚</div>
                <h3>Belum ada jadwal</h3>
                <p>Silakan tambahkan jadwal kuliahmu.</p>
            </div>
        `;
        return;
    }

    // --- Buat satu kartu untuk setiap jadwal ---
    sortedSchedules.forEach((schedule) => {
        const card = document.createElement("div");
        card.className = "schedule-card";

        // Baris atas: judul mata kuliah + jam
        const top = document.createElement("div");
        top.className = "schedule-top";

        const titleWrapper = document.createElement("div");
        const title = document.createElement("h3");
        title.textContent = schedule.subject;
        titleWrapper.appendChild(title);

        const time = document.createElement("span");
        time.className = "schedule-time";
        time.textContent = schedule.time;

        top.append(titleWrapper, time);

        // Detail: dosen + ruangan
        const details = document.createElement("div");
        details.className = "schedule-details";
        details.textContent =
            "Dosen: " + schedule.lecturer + " | Ruangan: " + schedule.room;

        // Catatan (kalau diisi) — ditampilkan sebagai baris terpisah.
        let noteEl = null;
        if (schedule.note && schedule.note.trim()) {
            noteEl = document.createElement("div");
            noteEl.className = "schedule-note";
            noteEl.textContent = "📝 " + schedule.note;
        }

        // Badge hari
        const day = document.createElement("span");
        day.className = "schedule-day";
        day.textContent = days[Number(schedule.day)];

        /*
           Baris status pengingat.
           Menjawab pertanyaan "kenapa notifikasinya belum muncul?".
           Teksnya diperbarui otomatis tiap detik oleh updateCountdown().
        */
        const reminderStatus = document.createElement("div");
        reminderStatus.className = "reminder-status";
        reminderStatus.dataset.scheduleId = schedule.id;
        reminderStatus.textContent = buildReminderStatusText(schedule);

        // Tombol aksi: Edit & Hapus
        const actions = document.createElement("div");
        actions.className = "action-buttons";

        const editButton = document.createElement("button");
        editButton.className = "edit-btn";
        editButton.textContent = "✏️ Edit";
        editButton.addEventListener("click", () => editSchedule(schedule.id));

        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-btn";
        deleteButton.textContent = "🗑 Hapus";
        deleteButton.addEventListener("click", () => deleteSchedule(schedule.id));

        actions.append(editButton, deleteButton);

        // Urutan elemen di kartu. noteEl hanya ditambahkan kalau ada isinya.
        card.append(top, details);
        if (noteEl) card.append(noteEl);
        card.append(day, reminderStatus, actions);

        scheduleList.appendChild(card);
    });
}

/*
   buildReminderStatusText(schedule)
   Menghasilkan kalimat status pengingat untuk satu jadwal, misalnya:

   "⏳ Notifikasi muncul dalam 12 menit (jam 09:55)"  -> belum waktunya
   "🔔 Notifikasi sudah dikirim"                      -> sudah lewat jendela
   "⏰ Jendela pengingat terlewat, kelas mulai 10:00" -> terlewat
   "🔕 Notifikasi belum diaktifkan"                   -> izin belum granted

   Ini bagian yang bikin aplikasi tidak lagi "gagal senyap".
*/
function buildReminderStatusText(schedule) {
    const now = new Date();
    const classTime = getNextClass(schedule);
    const reminderTime = getReminderTime(schedule);
    const reminderKey = schedule.id + "_" + classTime.getTime();

    // Izin notifikasi belum aktif -> beri tahu, jangan diam.
    if (hasNotificationApi && Notification.permission !== "granted") {
        return "🔕 Notifikasi belum diaktifkan — klik 'Aktifkan Notifikasi' di atas";
    }

    // Notifikasi untuk kelas ini sudah pernah terkirim.
    if (sentReminders[reminderKey]) {
        return "✅ Notifikasi untuk kelas ini sudah dikirim (jam " + jamLokal(reminderTime) + ")";
    }

    // Belum masuk jendela pengingat -> tampilkan hitung mundur.
    if (now < reminderTime) {
        return "⏳ Notifikasi muncul dalam " + formatDurasi(reminderTime - now) +
               " (jam " + jamLokal(reminderTime) + ")";
    }

    // Sudah lewat jendela tapi kelas belum mulai -> seharusnya baru saja dikirim.
    if (now < classTime) {
        return "🔔 Jendela pengingat sedang aktif — notifikasi dikirim dalam ≤5 detik";
    }

    // Kelas sudah lewat (seharusnya tidak terjadi karena getNextClass selalu ke depan).
    return "⏰ Kelas dimulai jam " + jamLokal(classTime);
}

/*
   updateCountdown()
   Dipanggil tiap detik untuk memperbarui baris "Notifikasi muncul dalam X".
   Hanya mengubah textContent elemen yang sudah ada — tidak menggambar
   ulang seluruh daftar, jadi murah dan tidak bikin kedip.
*/
function updateCountdown() {
    document.querySelectorAll(".reminder-status").forEach((el) => {
        const id = el.dataset.scheduleId;
        const schedule = schedules.find((item) => item.id === id);
        if (!schedule) return;

        const text = buildReminderStatusText(schedule);
        // Cegah penulisan DOM kalau teksnya sama (hemat & tidak flicker).
        if (el.textContent !== text) el.textContent = text;
    });
}

setInterval(updateCountdown, 1000);



/* ---------------------------------------------------------------------
   BAGIAN 5: TAMBAH & EDIT JADWAL (submit form)
   --------------------------------------------------------------------- */
/*
   Event "submit" terjadi saat tombol "Simpan Jadwal" ditekan
   atau user menekan Enter di dalam form.
   event.preventDefault() mencegah halaman reload (perilaku default
   form HTML), supaya data diproses oleh JavaScript.
*/
form.addEventListener("submit", function (event) {
    event.preventDefault();

    // editId terisi = mode edit. Kosong = mode tambah baru.
    const editId = document.getElementById("editId").value;

    const reminderInput = document.getElementById("reminderMinutes");
    const reminderMinutes = reminderInput ? Number(reminderInput.value) : 15;

    // Validasi: pengingat harus angka 0 - 10080 menit (7 hari).
    if (
        !Number.isFinite(reminderMinutes) ||
        reminderMinutes < 0 ||
        reminderMinutes > 10080
    ) {
        alert("Waktu pengingat harus antara 0 sampai 10080 menit.");
        return;
    }

    // Susun objek jadwal dari isi form.
    // .trim() membuang spasi di awal/akhir supaya tidak ada spasi liar.
    const schedule = {
        id: editId || Date.now().toString(), // id unik dari timestamp
        subject: document.getElementById("subject").value.trim(),
        lecturer: document.getElementById("lecturer").value.trim(),
        room: document.getElementById("room").value.trim(),
        day: document.getElementById("day").value,
        time: document.getElementById("time").value,
        reminderMinutes: reminderMinutes,
        note: (document.getElementById("note")?.value || "").trim(),
    };

    if (editId) {
        // Mode edit: ganti item lama yang id-nya sama.
        schedules = schedules.map((item) => (item.id === editId ? schedule : item));
    } else {
        // Mode tambah: masukkan ke akhir array.
        schedules.push(schedule);
    }

    saveData();
    displaySchedules();
    resetForm();
    checkReminders(); // cek langsung, siapa tahu jadwalnya kurang dari X menit lagi

    /*
       Pesan setelah simpan.
       Dulu cuma "Jadwal berhasil ditambahkan!" — user jadi bingung
       karena tidak tahu KAPAN notifikasinya akan muncul.
       Sekarang pesannya menyebut jam & hitung mundurnya.
    */
    alert(buildSaveMessage(schedule, Boolean(editId)));
});

/*
   buildSaveMessage(schedule, isEdit)
   Menyusun pesan konfirmasi setelah user menyimpan jadwal.
   Isinya menjelaskan kapan notifikasi akan muncul, dan kalau
   ada yang menghalangi (izin belum aktif), disebutkan juga.
*/
function buildSaveMessage(schedule, isEdit) {
    const judul = isEdit ? "Jadwal berhasil diperbarui!" : "Jadwal berhasil ditambahkan!";
    const reminderTime = getReminderTime(schedule);
    const classTime = getNextClass(schedule);
    const selisih = reminderTime - new Date();

    let barisNotif;

    // Kasus 1: izin notifikasi belum aktif.
    if (hasNotificationApi && Notification.permission !== "granted") {
        barisNotif =
            "⚠️ Notifikasi BELUM AKTIF, jadi pengingat tidak akan muncul.\n" +
            "Klik tombol '🔔 Aktifkan Notifikasi' di kanan atas.";
    }
    // Kasus 2: jendela pengingat sudah terbuka -> notif dikirim sebentar lagi.
    else if (selisih <= 0) {
        barisNotif =
            "🔔 Notifikasi akan muncul SEKARANG (dalam ≤5 detik)\n" +
            "karena waktu pengingat (" + jamLokal(reminderTime) + ") sudah lewat.";
    }
    // Kasus 3: normal -> sebut jam & hitung mundurnya.
    else {
        barisNotif =
            "🔔 Notifikasi akan muncul jam " + jamLokal(reminderTime) +
            "\n(sekitar " + formatDurasi(selisih) + " lagi).";
    }

    return judul + "\n\n" +
        schedule.subject + " — " + days[Number(schedule.day)] + ", " + schedule.time + "\n" +
        "Pengingat: " + schedule.reminderMinutes + " menit sebelumnya\n\n" +
        barisNotif + "\n\n" +
        "❗ Tab ini harus tetap terbuka supaya pengingat bisa berjalan.";
}


/* ---------------------------------------------------------------------
   BAGIAN 6: EDIT, HAPUS, RESET FORM
   --------------------------------------------------------------------- */

/*
   editSchedule(id)
   Mengisi form dengan data jadwal yang mau diedit, lalu mengubah
   judul form dan menampilkan tombol "Batal Edit".
*/
function editSchedule(id) {
    const schedule = schedules.find((item) => item.id === id);
    if (!schedule) return;

    document.getElementById("editId").value = schedule.id;
    document.getElementById("subject").value = schedule.subject;
    document.getElementById("lecturer").value = schedule.lecturer;
    document.getElementById("room").value = schedule.room;
    document.getElementById("day").value = schedule.day;
    document.getElementById("time").value = schedule.time;

    const reminderInput = document.getElementById("reminderMinutes");
    if (reminderInput) {
        reminderInput.value = schedule.reminderMinutes ?? 15;
    }

    // Isi juga catatan (kalau jadwal lama belum punya note, biarkan kosong).
    const noteInput = document.getElementById("note");
    if (noteInput) noteInput.value = schedule.note || "";

    document.getElementById("formTitle").textContent = "Edit Jadwal";
    document.getElementById("submitBtn").textContent = "Simpan Perubahan";
    document.getElementById("cancelBtn").hidden = false;

    // Gulir ke form supaya user langsung lihat.
    document.querySelector(".form-section").scrollIntoView({ behavior: "smooth" });
}

/*
   deleteSchedule(id)
   Menghapus jadwal setelah user konfirmasi.
   filter() menyisakan semua item KECUALI yang id-nya sama.
*/
function deleteSchedule(id) {
    if (!confirm("Yakin ingin menghapus jadwal ini?")) return;

    schedules = schedules.filter((item) => item.id !== id);
    saveData();
    displaySchedules();
}

/*
   resetForm()
   Mengembalikan form ke kondisi awal (mode tambah).
*/
function resetForm() {
    form.reset();
    document.getElementById("editId").value = "";
    document.getElementById("formTitle").textContent = "Tambah Jadwal";
    document.getElementById("submitBtn").textContent = "+ Simpan Jadwal";
    document.getElementById("cancelBtn").hidden = true;

    const reminderInput = document.getElementById("reminderMinutes");
    if (reminderInput) reminderInput.value = 15;

    const noteInput = document.getElementById("note");
    if (noteInput) noteInput.value = "";
}

document.getElementById("cancelBtn").addEventListener("click", resetForm);


/* ---------------------------------------------------------------------
   BAGIAN 7: SERVICE WORKER (KUNCI PERBAIKAN NOTIFIKASI)
   ---------------------------------------------------------------------

   Apa itu Service Worker?
   Skrip yang berjalan TERPISAH dari halaman, di background.
   Karena punya "kehidupan sendiri", browser mengizinkannya
   menampilkan notifikasi - termasuk di Chrome Android yang
   menolak new Notification() dari halaman biasa.

   Catatan penting:
   - Service Worker HANYA bisa didaftarkan lewat http/https.
   - Di file:// pendaftaran gagal (origin-nya "null").
   - Jadi variabel swRegistration hanya berisi registration
     kalau aplikasi dijalankan lewat server.
   --------------------------------------------------------------------- */

let swRegistration = null;

/*
   registerServiceWorker()
   Mendaftarkan sw.js lalu menyimpan registration-nya.
   Kalau gagal (misal dibuka via file://), cukup dicatat di console
   dan aplikasi tetap jalan dengan fallback new Notification().
*/
async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return null;
    if (isFileProtocol) return null; // tidak mungkin di file://

    try {
        // Manifest PWA hanya disuntik lewat http/https, karena di
        // file:// browser memblokirnya dengan error CORS.
        if (!document.querySelector('link[rel="manifest"]')) {
            const link = document.createElement("link");
            link.rel = "manifest";
            link.href = "manifest.json";
            document.head.appendChild(link);
        }

        const reg = await navigator.serviceWorker.register("./sw.js");
        // Tunggu sampai SW benar-benar aktif & siap menerima perintah.
        swRegistration = await navigator.serviceWorker.ready;
        return swRegistration;
    } catch (error) {
        console.warn("[SW] Gagal mendaftarkan service worker:", error);
        return null;
    }
}


/* ---------------------------------------------------------------------
   BAGIAN 8: MENAMPILKAN NOTIFIKASI (satu pintu untuk semua browser)
   --------------------------------------------------------------------- */

/*
   showNotification(title, options)
   Fungsi tunggal yang dipakai seluruh aplikasi untuk memunculkan
   notifikasi. Urutan percobaannya:

   1. Lewat Service Worker  -> jalur resmi, jalan di desktop & Android.
   2. new Notification()    -> fallback untuk browser/konteks yang
                               tidak punya Service Worker (misal file://).

   Mengembalikan true kalau berhasil, false kalau gagal.
*/
async function showNotification(title, options = {}) {
    // Prioritas 1: Service Worker.
    if (swRegistration && swRegistration.showNotification) {
        try {
            await swRegistration.showNotification(title, options);
            return true;
        } catch (error) {
            console.warn("[Notif] showNotification() gagal, coba fallback:", error);
        }
    }

    // Prioritas 2: konstruktor klasik (desktop).
    try {
        const notification = new Notification(title, options);

        // Fokuskan tab saat notifikasi diklik.
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
        return true;
    } catch (error) {
        // Di Chrome Android ini akan melempar TypeError.
        console.error("[Notif] Gagal menampilkan notifikasi:", error);
        return false;
    }
}

// Opsi tambahan yang dipakai semua notifikasi (ikon, getar, dll).
function buildNotificationOptions(body, tag) {
    const options = {
        body: body,
        icon: "icon-192.png",
        badge: "icon-192.png",
        tag: tag, // tag sama = notifikasi lama diganti, tidak menumpuk
        renotify: true,
        requireInteraction: false,
    };

    // vibrate hanya dikenal di Android, aman diabaikan browser lain.
    if (navigator.vibrate) {
        options.vibrate = [200, 100, 200];
    }

    return options;
}


/* ---------------------------------------------------------------------
   BAGIAN 9: TOMBOL "AKTIFKAN NOTIFIKASI"
   --------------------------------------------------------------------- */

/*
   Alur saat tombol diklik:
   1. Cek dukungan API.
   2. Cek apakah sedang di file:// (Chrome tidak akan memberi izin).
   3. Minta izin ke user.
   4. Tangani 3 kemungkinan hasil: granted / denied / default.
*/
notificationBtn.addEventListener("click", async function () {
    // --- 1. Browser tidak punya Notification API ---
    if (!hasNotificationApi) {
        alert(
            "Browser ini tidak mendukung notifikasi.\n" +
            "Gunakan Chrome, Edge, atau Firefox versi terbaru."
        );
        return;
    }

    // --- 2. Dibuka lewat file:// ---
    // Chrome tidak akan pernah menampilkan popup izin di mode ini.
    if (isFileProtocol) {
        alert(
            "Notifikasi tidak bisa diaktifkan karena file dibuka langsung (file://).\n\n" +
            "Chrome memblokir izin notifikasi untuk file lokal.\n\n" +
            "Solusi: jalankan lewat server lokal, misalnya buka terminal di folder ini lalu:\n\n" +
            "    python -m http.server 8000\n\n" +
            "Lalu buka: http://localhost:8000"
        );
        return;
    }

    try {
        // --- 3. Minta izin ---
        // requestPermission() HARUS dipanggil dari aksi user (klik),
        // kalau tidak, Chrome mengabaikannya.
        const permission = await Notification.requestPermission();

        if (permission === "granted") {
            notificationBtn.textContent = "🔔 Notifikasi Aktif";
            notificationBtn.disabled = true;

            // Pastikan Service Worker siap sebelum kirim notifikasi uji.
            if (!swRegistration) await registerServiceWorker();

            // Kirim notifikasi percobaan supaya user yakin sudah aktif.
            await showNotification(
                "Notifikasi berhasil diaktifkan 🎓",
                buildNotificationOptions(
                    "KuliahKu akan mengingatkanmu sebelum kelas dimulai.",
                    "kuliahku-welcome"
                )
            );

            checkReminders();
        } else if (permission === "denied") {
            // --- 4a. User memilih Block ---
            // Setelah ini popup tidak akan muncul lagi sampai direset manual.
            alert(
                "Izin notifikasi DIBLOKIR untuk situs ini.\n\n" +
                "Cara mengaktifkan kembali di Chrome:\n" +
                "1. Klik ikon gembok / pengaturan di kiri address bar.\n" +
                "2. Pilih 'Site settings' (Setelan situs).\n" +
                "3. Ubah 'Notifications' menjadi 'Allow'.\n" +
                "4. Refresh halaman ini."
            );
        } else {
            // --- 4b. User menutup popup tanpa memilih ("default") ---
            alert(
                "Izin notifikasi belum diberikan.\n" +
                "Klik tombol 'Aktifkan Notifikasi' lagi dan pilih 'Allow'."
            );
        }
    } catch (error) {
        alert("Terjadi kesalahan saat mengaktifkan notifikasi.");
        console.error(error);
    }
});


/* ---------------------------------------------------------------------
   BAGIAN 9b: TOMBOL "COBA NOTIFIKASI"
   ---------------------------------------------------------------------
   Tombol ini mengirim notifikasi percobaan SEKARANG, tanpa menunggu
   jadwal. Gunanya untuk memisahkan dua kemungkinan saat user bingung
   "kenapa notifikasi tidak muncul?":

   - Kalau tombol ini memunculkan notifikasi -> sistem notifikasi SEHAT,
     berarti masalahnya cuma soal WAKTU (pengingat belum sampai jendelanya).
   - Kalau tombol ini gagal -> masalahnya di IZIN atau browser.

   Ini alat diagnosa untuk user, bukan fitur utama.
   --------------------------------------------------------------------- */
const testNotifBtn = document.getElementById("testNotifBtn");

testNotifBtn.addEventListener("click", async function () {
    if (!hasNotificationApi) {
        alert("Browser ini tidak mendukung notifikasi.");
        return;
    }

    if (isFileProtocol) {
        alert(
            "Tidak bisa: file dibuka langsung (file://).\n\n" +
            "Jalankan lewat server lokal:\n" +
            "  python -m http.server 8000\n" +
            "lalu buka http://localhost:8000"
        );
        return;
    }

    // Kalau izin belum ada, minta dulu.
    if (Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
            alert(
                "Izin notifikasi belum diberikan (status: " + permission + ").\n\n" +
                (permission === "denied"
                    ? "Izin DIBLOKIR. Klik ikon gembok di address bar -> Site settings -> " +
                      "Notifications -> Allow, lalu refresh."
                    : "Klik tombol ini lagi dan pilih 'Allow'.")
            );
            return;
        }
        await registerServiceWorker();
        syncNotificationButton();
    }

    const berhasil = await showNotification(
        "Notifikasi berfungsi ✅",
        buildNotificationOptions(
            "Kalau kamu melihat ini, sistem notifikasi sudah benar.\n" +
            "Pengingat jadwal akan muncul otomatis sesuai waktu yang di-set.",
            "tes-manual"
        )
    );

    if (!berhasil) {
        alert(
            "Notifikasi gagal ditampilkan.\n\n" +
            "Kemungkinan penyebab:\n" +
            "1. Izin notifikasi diblokir Chrome\n" +
            "2. Mode Jangan Ganggu (Do Not Disturb) aktif di Windows\n" +
            "3. Fokus Assist / Quiet Hours aktif\n\n" +
            "Coba matikan mode senyap OS, lalu ulangi."
        );
        return;
    }

    // Beri tahu juga status hitung mundur jadwal yang paling dekat.
    const berikutnya = [...schedules].sort(
        (a, b) => getReminderTime(a) - getReminderTime(b)
    )[0];

    if (berikutnya) {
        const reminderTime = getReminderTime(berikutnya);
        const selisih = reminderTime - new Date();
        alert(
            "Notifikasi percobaan terkirim.\n\n" +
            "Pengingat berikutnya: " + berikutnya.subject + "\n" +
            (selisih > 0
                ? "Akan muncul jam " + jamLokal(reminderTime) +
                  " (sekitar " + formatDurasi(selisih) + " lagi)."
                : "Jendela pengingat sudah aktif, akan dikirim dalam ≤5 detik.")
        );
    } else {
        alert("Notifikasi percobaan terkirim.\n\nBelum ada jadwal tersimpan.");
    }
});


/* ---------------------------------------------------------------------
   BAGIAN 10: PENGINGAT OTOMATIS
   --------------------------------------------------------------------- */

// Daftar notifikasi yang sudah pernah dikirim, supaya tidak dobel.
// Bentuk: { "idJadwal_timestampKelas": true }
let sentReminders = JSON.parse(localStorage.getItem("pengingatTerkirim")) || {};

/*
   pruneSentReminders()
   Membersihkan catatan notifikasi lama (> 7 hari) supaya
   localStorage tidak penuh seiring waktu.
   Key-nya berformat "id_timestamp", jadi timestamp bisa dibaca.
*/
function pruneSentReminders() {
    const batas = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 hari lalu
    let berubah = false;

    Object.keys(sentReminders).forEach((key) => {
        const timestamp = Number(key.split("_").pop());
        if (!Number.isFinite(timestamp) || timestamp < batas) {
            delete sentReminders[key];
            berubah = true;
        }
    });

    if (berubah) {
        localStorage.setItem("pengingatTerkirim", JSON.stringify(sentReminders));
    }
}

/*
   checkReminders()
   Jantung fitur pengingat. Dipanggil tiap 5 detik.
   Untuk setiap jadwal:
   1. Hitung kapan kelas berikutnya.
   2. Hitung kapan pengingatnya (waktu kelas - reminderMinutes).
   3. Kalau SEKARANG sudah masuk jendela pengingat DAN belum
      pernah dikirim -> kirim notifikasi, tandai terkirim.
*/
async function checkReminders() {
    if (!hasNotificationApi) return;
    if (Notification.permission !== "granted") return;

    const now = new Date();

    for (const schedule of schedules) {
        const classTime = getNextClass(schedule);
        const reminderMinutes = Number(schedule.reminderMinutes ?? 15);

        // Waktu pengingat = waktu kelas dikurangi X menit.
        const reminderTime = new Date(classTime.getTime() - reminderMinutes * 60 * 1000);

        // Kunci unik: satu jadwal + satu waktu kelas = satu notifikasi.
        const reminderKey = schedule.id + "_" + classTime.getTime();

        // Kondisi kirim:
        // - sekarang sudah melewati/tepat di waktu pengingat
        // - tapi kelasnya belum mulai
        // - dan notifikasi ini belum pernah dikirim
        if (now >= reminderTime && now < classTime && !sentReminders[reminderKey]) {
            // Tandai DULU sebelum await, supaya tidak terkirim dobel
            // kalau checkReminders jalan lagi sebelum notifikasi selesai.
            sentReminders[reminderKey] = true;
            localStorage.setItem("pengingatTerkirim", JSON.stringify(sentReminders));

            const sisaMenit = Math.round((classTime - now) / 60000);

            // Susun isi notifikasi. Catatan ikut ditampilkan kalau ada.
            let body =
                schedule.subject +
                " dimulai " +
                (sisaMenit > 0 ? "dalam " + sisaMenit + " menit" : "sebentar lagi") +
                ".\nDosen: " + schedule.lecturer +
                "\nRuangan: " + schedule.room;

            if (schedule.note && schedule.note.trim()) {
                body += "\nCatatan: " + schedule.note;
            }

            await showNotification(
                "Pengingat Kuliah 🎓",
                buildNotificationOptions(body, reminderKey)
            );
        }
    }
}

// Jalankan pengecekan tiap 5 detik.
// Catatan: tab harus tetap terbuka agar pengingat bisa muncul.
setInterval(checkReminders, 5000);

// Cek ulang saat tab kembali dibuka/difokuskan.
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkReminders();
});


/* ---------------------------------------------------------------------
   BAGIAN 11: BANNER PERINGATAN file://
   Kalau aplikasi dibuka lewat klik dua kali, tampilkan banner
   di atas halaman supaya user tahu kenapa notifikasi tidak jalan.
   --------------------------------------------------------------------- */
function showFileProtocolBanner() {
    if (!isFileProtocol) return;

    const banner = document.createElement("div");
    banner.className = "file-warning";
    banner.innerHTML = `
        <strong>⚠️ Notifikasi tidak aktif karena file dibuka langsung (file://)</strong>
        <p>
            Chrome memblokir izin notifikasi untuk file lokal. Jalankan lewat server lokal:
            buka terminal di folder ini, lalu jalankan
            <code>python -m http.server 8000</code>
            dan buka <code>http://localhost:8000</code>
        </p>
    `;
    document.querySelector(".container").prepend(banner);
}


/* ---------------------------------------------------------------------
   BAGIAN 12: INISIALISASI SAAT APLIKASI DIBUKA
   --------------------------------------------------------------------- */

// Tampilkan jadwal yang tersimpan.
displaySchedules();
showFileProtocolBanner();

/*
   Sinkronisasi status tombol dengan izin yang tersimpan.
   Ada 4 kemungkinan saat halaman dibuka:
   - "granted": notifikasi sudah aktif -> tombol dinonaktifkan.
   - "denied" : diblokir -> tombol jadi "Notifikasi Diblokir".
   - "default": belum pernah diminta -> tombol normal.
   - file://   : tidak bisa -> tombol dinonaktifkan.
*/
function syncNotificationButton() {
    if (isFileProtocol) {
        notificationBtn.textContent = "🔔 Notifikasi nonaktif (file://)";
        notificationBtn.disabled = true;
        return;
    }

    if (!hasNotificationApi) {
        notificationBtn.textContent = "🔔 Notifikasi tidak didukung";
        notificationBtn.disabled = true;
        return;
    }

    if (Notification.permission === "granted") {
        notificationBtn.textContent = "🔔 Notifikasi Aktif";
        notificationBtn.disabled = true;
    } else if (Notification.permission === "denied") {
        notificationBtn.textContent = "🔕 Notifikasi Diblokir";
    } else {
        notificationBtn.textContent = "🔔 Aktifkan Notifikasi";
    }
}

// Jalankan alur startup secara berurutan (async).
(async function init() {
    pruneSentReminders();

    // Daftarkan Service Worker lebih dulu, baru cek pengingat.
    await registerServiceWorker();

    syncNotificationButton();
    checkReminders();
})();
