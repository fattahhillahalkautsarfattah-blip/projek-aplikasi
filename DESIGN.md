# Dokumentasi UI & Komponen Hexo Theme Reimu (Anime Blog Style)

Dokumen ini berisi spesifikasi sistem desain dan kode komponen HTML/Tailwind CSS yang dibuat berdasarkan antarmuka blog bertema anime (Hakurei Reimu / Touhou Project aesthetic).

---

## 1. Dokumentasi Desain (DESIGN.md)

### A. Konsep & Filosofi Visual
* **Tema Utama:** Anime Minimalist Blog (*Red & White Dual-Tone*).
* **Skema Warna Utama:**
  * **Primary Accent:** Red (`#ef4444` / Tailwind `red-500`) – Terinspirasi dari warna khas pita dan busana Reimu.
  * **Secondary Accent:** Light Pink/Red Background Tint (`#fef2f2` / Tailwind `red-50`).
  * **Background Surface:** Clean Light Off-White (`#f7f8fa`).
  * **Card Surface:** Pure White (`#ffffff`) dengan *border* tipis berwarna kontras rendah (`border-red-50`).
  * **Text:** Dark Gray (`#1f2937`) untuk keterbacaan tinggi.
* **Tipografi:** Sans-serif modern (*Inter* / *Noto Sans*) dengan hierarki yang jelas antara judul artikel, deskripsi, dan metadata.

### B. Struktur Komponen UI
Layout utama menggunakan grid dua kolom responsif yang fleksibel (*Desktop*: 3-column Left Sidebar + 9-column Content).

1. **Top Navigation Bar (`<nav>`)**
   * Fixed Top Navigation dengan efek *Glassmorphism* (`backdrop-filter: blur`).
   * Mengandung elemen identity, menu utama (Beranda, Kategori, Tag, Arsip, Teman), dan tombol utilitas (Pencarian, Dark Mode, Bahasa).

2. **Hero Banner Header**
   * Menampilkan ilustrasi header skala besar dengan judul blog berukuran besar (`拔剑 Sketon`).
   * *Linear Gradient Overlay* hitam-ke-merah untuk meningkatkan legibilitas teks judul, serta efek pemotong halus (*fade-bottom*) di bagian bawah banner.

3. **Sidebar Kiri (`<aside>`)**
   * **Music Player Widget:** Mini player ringkas yang menyajikan pemutar musik independen lengkap dengan gambar album art dan progress bar.
   * **Profile Card:** Avatar melingkar, statistik blog (Artikel, Kategori, Tag), tautan media sosial, serta tombol navigasi (*Solid Red* & *Red Outline*).

4. **Area Konten Utama (`<section>`)**
   * **Featured Category Cards Grid:** Grid kartu banner 2-kolom bersudut rounded tinggi (`rounded-2xl`) dengan gradien hitam di bagian bawah.
   * **Main Blog Post Cards:** Post card fleksibel dengan gambar miniatur/banner visual, metadata header (tanggal, views, komentar), serta tagar.

---

## 2. Kode Komponen HTML / Tailwind CSS

Berikut adalah kode sumber lengkap untuk antarmuka blog:

```html
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>拔剑 Sketon - Anime Blog UI</title>
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Font Awesome Icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <!-- Google Font (Inter) -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Inter', sans-serif;
            background-color: #f7f8fa;
        }
        .hero-banner {
            background-image: linear-gradient(to bottom, rgba(15, 12, 29, 0.4), rgba(220, 38, 38, 0.15)), url('https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1600&auto=format&fit=crop');
            background-size: cover;
            background-position: center top;
        }
        .nav-blur {
            backdrop-filter: blur(8px);
            background-color: rgba(255, 255, 255, 0.85);
        }
        .card-hover {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .card-hover:hover {
            transform: translateY(-4px);
            box-shadow: 0 12px 24px -10px rgba(220, 38, 38, 0.25);
        }
        .red-outline-btn {
            border: 1px solid #ef4444;
            color: #ef4444;
            transition: all 0.2s ease;
        }
        .red-outline-btn:hover {
            background-color: #ef4444;
            color: #ffffff;
        }
    </style>
</head>
<body class="text-gray-800 min-h-screen pb-12">

    <!-- Top Navigation Bar -->
    <nav class="fixed top-0 left-0 right-0 z-50 nav-blur border-b border-red-100 shadow-sm transition-all duration-300">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex items-center justify-between h-14">
                <div class="flex items-center space-x-2">
                    <span class="w-3 h-3 rounded-full bg-red-500 inline-block animate-pulse"></span>
                    <span class="font-bold text-gray-800 text-lg tracking-wide">Sketon's Blog</span>
                </div>
                
                <!-- Desktop Navigation Links -->
                <div class="hidden md:flex items-center space-x-6 text-sm font-medium text-gray-600">
                    <a href="#" class="flex items-center space-x-1.5 text-red-500 hover:text-red-600">
                        <i class="fa-solid fa-house"></i>
                        <span>Beranda</span>
                    </a>
                    <a href="#" class="flex items-center space-x-1.5 hover:text-red-500">
                        <i class="fa-solid fa-folder-open"></i>
                        <span>Kategori</span>
                    </a>
                    <a href="#" class="flex items-center space-x-1.5 hover:text-red-500">
                        <i class="fa-solid fa-tags"></i>
                        <span>Tag</span>
                    </a>
                    <a href="#" class="flex items-center space-x-1.5 hover:text-red-500">
                        <i class="fa-solid fa-archive"></i>
                        <span>Arsip</span>
                    </a>
                    <a href="#" class="flex items-center space-x-1.5 hover:text-red-500">
                        <i class="fa-solid fa-paper-plane"></i>
                        <span>Teman</span>
                    </a>
                </div>

                <!-- Action Controls -->
                <div class="flex items-center space-x-4 text-gray-500">
                    <button class="p-2 hover:text-red-500 transition-colors" title="Cari">
                        <i class="fa-solid fa-magnifying-glass"></i>
                    </button>
                    <button class="p-2 hover:text-red-500 transition-colors" title="Ubah Mode Tampilan">
                        <i class="fa-solid fa-moon"></i>
                    </button>
                    <button class="p-2 hover:text-red-500 transition-colors" title="Bahasa">
                        <i class="fa-solid fa-language text-lg"></i>
                    </button>
                </div>
            </div>
        </div>
    </nav>

    <!-- Hero Banner Area -->
    <div class="hero-banner h-80 sm:h-96 w-full flex flex-col justify-center items-center text-white text-center relative px-4">
        <div class="relative z-10 space-y-2 mt-8">
            <h1 class="text-3xl sm:text-5xl font-extrabold tracking-wide drop-shadow-md">拔剑 Sketon</h1>
            <p class="text-sm sm:text-base font-light text-red-100 tracking-wider">东方人的日常 · Personal Anime & Tech Journal</p>
        </div>
        <div class="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#f7f8fa] to-transparent"></div>
    </div>

    <!-- Main Content Grid -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-16 relative z-20">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">

            <!-- LEFT SIDEBAR -->
            <aside class="lg:col-span-3 space-y-6">
                
                <!-- Music Player Mini Widget -->
                <div class="bg-white rounded-2xl p-4 shadow-sm border border-red-50 flex items-center space-x-3 card-hover">
                    <img src="https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=200&auto=format&fit=crop" alt="Album Art" class="w-12 h-12 rounded-xl object-cover flex-shrink-0 border-2 border-red-100">
                    <div class="flex-1 min-w-0">
                        <h4 class="text-xs font-semibold text-gray-800 truncate">Sora no Kiseki - Main Theme</h4>
                        <p class="text-xs text-gray-400 truncate">Falcom Sound Team</p>
                        <div class="w-full bg-gray-100 rounded-full h-1 mt-2">
                            <div class="bg-red-500 h-1 rounded-full w-2/5"></div>
                        </div>
                    </div>
                    <button class="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors">
                        <i class="fa-solid fa-play text-xs ml-0.5"></i>
                    </button>
                </div>

                <!-- Profile Card -->
                <div class="bg-white rounded-2xl p-6 shadow-sm border border-red-50 text-center space-y-5 card-hover">
                    <div class="relative inline-block">
                        <img src="https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=300&auto=format&fit=crop" alt="Avatar" class="w-24 h-24 rounded-full mx-auto border-4 border-red-100 shadow-md object-cover">
                        <span class="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full"></span>
                    </div>

                    <div>
                        <h2 class="text-lg font-bold text-gray-800">D-Sketon</h2>
                        <p class="text-xs text-gray-400 mt-1">D-Sketon's personal blog</p>
                    </div>

                    <div class="grid grid-cols-3 gap-2 py-3 border-y border-gray-100 text-center">
                        <div>
                            <span class="block text-xs text-gray-400">Artikel</span>
                            <span class="font-bold text-gray-700 text-base">75</span>
                        </div>
                        <div>
                            <span class="block text-xs text-gray-400">Kategori</span>
                            <span class="font-bold text-gray-700 text-base">10</span>
                        </div>
                        <div>
                            <span class="block text-xs text-gray-400">Tag</span>
                            <span class="font-bold text-gray-700 text-base">19</span>
                        </div>
                    </div>

                    <div class="flex justify-center space-x-4 text-gray-500 text-lg">
                        <a href="#" class="hover:text-red-500 transition-colors"><i class="fa-brands fa-github"></i></a>
                        <a href="#" class="hover:text-red-500 transition-colors"><i class="fa-brands fa-bilibili"></i></a>
                        <a href="#" class="hover:text-red-500 transition-colors"><i class="fa-solid fa-rss"></i></a>
                    </div>

                    <div class="space-y-2 pt-2">
                        <button class="w-full py-2 px-4 rounded-xl bg-red-500 text-white font-medium text-sm hover:bg-red-600 transition-colors flex items-center justify-center space-x-2 shadow-sm shadow-red-200">
                            <i class="fa-solid fa-house text-xs"></i>
                            <span>Beranda</span>
                        </button>
                        <button class="w-full py-2 px-4 rounded-xl red-outline-btn font-medium text-sm flex items-center justify-center space-x-2">
                            <i class="fa-solid fa-archive text-xs"></i>
                            <span>Arsip</span>
                        </button>
                        <button class="w-full py-2 px-4 rounded-xl red-outline-btn font-medium text-sm flex items-center justify-center space-x-2">
                            <i class="fa-solid fa-user text-xs"></i>
                            <span>Tentang</span>
                        </button>
                        <button class="w-full py-2 px-4 rounded-xl red-outline-btn font-medium text-sm flex items-center justify-center space-x-2">
                            <i class="fa-solid fa-link text-xs"></i>
                            <span>Tautan</span>
                        </button>
                    </div>
                </div>

            </aside>

            <!-- RIGHT CONTENT AREA -->
            <section class="lg:col-span-9 space-y-6">

                <!-- Featured Highlight Categories Grid -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="relative h-44 rounded-2xl overflow-hidden shadow-sm card-hover cursor-pointer group">
                        <img src="https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=800&auto=format&fit=crop" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-5 text-white">
                            <h3 class="text-xl font-bold tracking-wide">hexo</h3>
                            <p class="text-xs text-red-200 font-light mt-0.5">21 Artikel</p>
                        </div>
                    </div>

                    <div class="relative h-44 rounded-2xl overflow-hidden shadow-sm card-hover cursor-pointer group">
                        <img src="https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=800&auto=format&fit=crop" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-5 text-white">
                            <h3 class="text-xl font-bold tracking-wide">学习笔记 (Catatan Belajar)</h3>
                            <p class="text-xs text-red-200 font-light mt-0.5">9 Artikel</p>
                        </div>
                    </div>
                </div>

                <div class="flex items-center space-x-2 pt-2 text-red-500 font-semibold text-sm">
                    <i class="fa-solid fa-thumbtack"></i>
                    <span>Pin & Postingan Terbaru</span>
                </div>

                <!-- BLOG POST CARD 1 -->
                <article class="bg-white rounded-2xl shadow-sm border border-red-50 overflow-hidden card-hover flex flex-col md:flex-row h-auto md:h-56">
                    <div class="md:w-5/12 relative overflow-hidden h-48 md:h-full">
                        <img src="https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop" alt="Cover" class="w-full h-full object-cover">
                    </div>
                    <div class="md:w-7/12 p-6 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center space-x-4 text-xs text-gray-400 mb-2">
                                <span class="flex items-center space-x-1">
                                    <i class="fa-regular fa-calendar"></i>
                                    <span>2022-01-07</span>
                                </span>
                                <span class="flex items-center space-x-1">
                                    <i class="fa-regular fa-eye"></i>
                                    <span>7.5k</span>
                                </span>
                                <span class="flex items-center space-x-1">
                                    <i class="fa-regular fa-comment"></i>
                                    <span>22.1k</span>
                                </span>
                            </div>
                            <h2 class="text-lg font-bold text-red-500 hover:text-red-600 transition-colors cursor-pointer line-clamp-1 mb-2">
                                hexo-theme-reimu 食用指南
                            </h2>
                            <p class="text-xs text-gray-500 line-clamp-3 leading-relaxed">
                                Fitur utama dari tema ini adalah tampilan modern ala Reimu Touhou Project. Memiliki dukungan komprehensif untuk berbagai fitur blog modern, interaktivitas yang mulus, dan opsi kustomisasi tata letak yang fleksibel.
                            </p>
                        </div>
                        <div class="pt-4 flex items-center justify-between border-t border-gray-50 text-xs">
                            <span class="text-red-400 hover:underline cursor-pointer"># Hexo # Reimu</span>
                            <span class="text-gray-400 hover:text-red-500 cursor-pointer flex items-center space-x-1">
                                <span>Selengkapnya</span>
                                <i class="fa-solid fa-angle-right text-xs"></i>
                            </span>
                        </div>
                    </div>
                </article>

                <!-- BLOG POST CARD 2 -->
                <article class="bg-white rounded-2xl shadow-sm border border-red-50 overflow-hidden card-hover flex flex-col md:flex-row h-auto md:h-56">
                    <div class="md:w-7/12 p-6 flex flex-col justify-between order-2 md:order-1">
                        <div>
                            <div class="flex items-center space-x-4 text-xs text-gray-400 mb-2">
                                <span class="flex items-center space-x-1">
                                    <i class="fa-regular fa-calendar"></i>
                                    <span>2025-11-01</span>
                                </span>
                                <span class="flex items-center space-x-1">
                                    <i class="fa-regular fa-eye"></i>
                                    <span>2.4k</span>
                                </span>
                                <span class="flex items-center space-x-1">
                                    <i class="fa-regular fa-comment"></i>
                                    <span>12.5k</span>
                                </span>
                            </div>
                            <h2 class="text-lg font-bold text-red-500 hover:text-red-600 transition-colors cursor-pointer line-clamp-1 mb-2">
                                2025年 JavaScript Promise 性能对比
                            </h2>
                            <p class="text-xs text-gray-500 line-clamp-3 leading-relaxed">
                                Evaluasi mendalam mengenai performa eksekusi JavaScript Promise di berbagai runtime modern seperti Node.js, V8, dan Bun engine. Menyediakan wawasan praktis untuk arsitektur asynchronous berskala besar.
                            </p>
                        </div>
                        <div class="pt-4 flex items-center justify-between border-t border-gray-50 text-xs">
                            <span class="text-red-400 hover:underline cursor-pointer"># JavaScript # Performance</span>
                            <span class="text-gray-400 hover:text-red-500 cursor-pointer flex items-center space-x-1">
                                <span>Selengkapnya</span>
                                <i class="fa-solid fa-angle-right text-xs"></i>
                            </span>
                        </div>
                    </div>
                    <div class="md:w-5/12 bg-amber-400 flex items-center justify-center p-6 order-1 md:order-2">
                        <div class="text-center">
                            <span class="bg-black text-amber-400 font-black text-xl px-3 py-1 rounded-md inline-block mr-1">JS</span>
                            <span class="text-black font-extrabold text-2xl tracking-tight">Promises</span>
                        </div>
                    </div>
                </article>

            </section>
        </div>
    </main>

    <!-- Footer -->
    <footer class="mt-16 text-center text-xs text-gray-400 space-y-2">
        <p>© 2026 D-Sketon. Powered by Hexo & Theme Reimu inspired layout.</p>
        <p class="flex items-center justify-center space-x-1">
            <span>Made with</span>
            <i class="fa-solid fa-heart text-red-500"></i>
            <span>and Tailwind CSS</span>
        </p>
    </footer>

</body>
</html>
```