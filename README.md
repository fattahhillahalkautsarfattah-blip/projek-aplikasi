# 拔剑 Sketon - Aplikasi Alarm Web (Anime Reimu Style)

Aplikasi alarm web modern yang berjalan sepenuhnya di browser tanpa backend atau server eksternal. Dibuat sesuai spesifikasi **PRD.md** (Aplikasi Alarm Web) dengan desain visual memukau terinspirasi dari estetika **DESIGN.md** (Hexo Theme Reimu / Touhou Project Red & White Dual-Tone).

---

## 🌟 Fitur Utama & Kepatuhan PRD

| ID PRD | Fitur | Keterangan & Implementasi |
| --- | --- | --- |
| **FR-01** | **Daftar Alarm** | Menampilkan seluruh alarm terurut berdasarkan jam (HH:MM 24 jam). Menyajikan label, hari berulang, nama file MP3, serta saklar toggle aktif/nonaktif instan. |
| **FR-02** | **Tambah Alarm** | Form dialog interaktif dengan picker jam, label nama, tombol hari pengulangan (Sen–Min atau sekali saja), dan preset tunda. |
| **FR-03** | **Ubah & Hapus** | Ubah alarm kapan saja dan hapus dengan konfirmasi aman. Otomatis membersihkan file MP3 (*orphan cleanup*) bila tidak digunakan lagi oleh alarm lain. |
| **FR-04** | **Unggah File MP3** | Mendukung drag-and-drop file audio MP3 hingga 10 MB per file. Disimpan secara lokal dan permanen sebagai `Blob` di **IndexedDB**. |
| **FR-05** | **Pratinjau Nada** | Tombol tes nada untuk mendengarkan lagu/chime sebelum disimpan di form maupun langsung di kartu alarm. |
| **FR-06** | **Layar Bunyi (Overlay Penuh)** | Layar alarm visual dengan animasi lonceng anime, jam digital besar, label alarm, tombol Matikan dan Tunda (Snooze). |
| **FR-07** | **Auto-Stop 30 Menit** | Timer otomatis 30 menit berbasis selisih waktu (`Date.now() - startedAt`) yang tahan terhadap penangguhan tab di latar belakang. Dilengkapi hitung mundur langsung (*live countdown*). |
| **FR-08** | **Matikan Manual** | Tombol besar "MATIKAN ALARM" yang langsung mematikan audio, membatalkan timer 30 menit, dan mencatat riwayat `dismissed`. |
| **FR-09** | **Tunda (Snooze)** | Tombol "TUNDA" yang menjadwalkan bunyi ulang (default 5 menit). Setiap bunyi baru mengulang timer auto-stop 30 menit dari awal. |
| **FR-10** | **Aturan Pengulangan** | Alarm sekali pakai otomatis dinonaktifkan setelah berbunyi; alarm mingguan tetap aktif untuk jadwal berikutnya. |
| **FR-11** | **Alarm Bersamaan (Queue)** | Jika ada 2+ alarm pada menit yang sama, layar menampilkan antrean, memutar 1 audio, dan memutar alarm berikutnya saat yang pertama dimatikan. |
| **FR-12** | **Persistensi IndexedDB** | Database `alarm-app` versi 1 dengan store `alarms`, `sounds`, dan `history`. Data tetap ada saat browser ditutup atau dimuat ulang. |
| **FR-13** | **Alarm Terlewat** | Deteksi otomatis saat aplikasi dibuka: alarm yang terjadwal saat browser tertutup ditandai sebagai *terlewat* di riwayat tanpa membunyikan audio terlambat. |
| **FR-14** | **Notifikasi Desktop** | Integrasi Browser Notification API agar notifikasi tetap muncul saat tab berada di latar belakang. |

---

## 🎨 Desain & Estetika (DESIGN.md)

- **Gaya Visual:** Anime Touhou Reimu Minimalist (*Red & White Dual-Tone*).
- **Aksen Warna:** Merah Reimu (`#ef4444`), Soft Pink Tint (`#fef2f2`), Card White (`#ffffff`), Text Dark Gray (`#1f2937`).
- **Komponen Utama:**
  - **Top Navigation Bar:** Efek *Glassmorphism* dengan indikator status kesiapan audio dan tombol dark mode.
  - **Hero Banner:** Jam digital raksasa, tanggal interaktif, dan penghitung mundur (*countdown*) alarm berikutnya.
  - **Sidebar Kiri:** Mini Music Player widget, profil anime D-Sketon, statistik total/aktif/riwayat alarm.
  - **Daftar Alarm:** Kartu alarm modern dengan efek *hover elevate*, saklar aktif cepat, dan indikator hari.
  - **Layar Alarm Berbunyi:** Tampilan modal penuh bergradien merah dengan animasi detak lingkaran gelombang (*pulsing rings*) dan lonceng bergoyang.

---

## 📁 Struktur Berkas

```
c:\projek aplikasi\
├── index.html          # Halaman utama aplikasi alarm
├── css/
│   └── style.css       # Animasi gelombang, lonceng, pulsa, dan tema Reimu
├── js/
│   ├── app.js          # Titik masuk utama, bootstrapping, data demo
│   ├── db.js           # Lapisan IndexedDB (alarms, sounds, history)
│   ├── scheduler.js    # Pemeriksa jadwal tiap detik, antrean, tab sync
│   ├── player.js       # Pemutar audio MP3, synth chimes, auto-stop 30m
│   ├── ui.js           # Kontrol antarmuka DOM, modal, render kartu alarm
│   ├── worker.js       # Web Worker timer agar tidak di-throttle di tab background
│   └── bundle.js       # Paket standalone untuk pembukaan langsung via file://
├── server.ps1          # Server statis lokal ringan PowerShell
├── start-server.bat    # Pintasan 1-klik untuk menjalankan server di Windows
├── DESIGN.md           # Dokumentasi spesifikasi desain
├── PRD.md              # Spesifikasi kebutuhan produk
└── README.md           # Petunjuk penggunaan aplikasi
```

---

## 🚀 Cara Menjalankan

Aplikasi dapat dijalankan melalui **salah satu dari 2 cara mudah**:

### Cara 1: Menggunakan Server Lokal (Direkomendasikan)
1. Cukup klik ganda berkas **`start-server.bat`** di folder ini.
2. Server lokal otomatis berjalan di port 8080 dan membuka browser ke `http://localhost:8080/`.

### Cara 2: Buka Langsung Berkas HTML
1. Buka Windows Explorer ke `c:\projek aplikasi`.
2. Klik ganda pada berkas **`index.html`** untuk langsung membukanya di Google Chrome, Microsoft Edge, atau Firefox.
3. Berkat `js/bundle.js`, aplikasi otomatis berjalan tanpa kendala kebijakan CORS lokal!

---

## 💡 Tips Penggunaan
1. **Mengaktifkan Audio:** Pada pembukaan pertama, klik tombol **"Aktifkan Audio"** di navigasi atas agar browser mengizinkan audio berdering saat jam alarm tiba.
2. **Izin Notifikasi:** Klik ikon lonceng di pojok kanan atas untuk mengaktifkan notifikasi desktop.
3. **Menguji Alarm:** Klik ikon lonceng kuning pada salah satu kartu alarm untuk langsung mencoba simulasi bunyi dan melihat layar auto-stop 30 menit!

