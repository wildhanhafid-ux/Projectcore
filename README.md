# ProjectCore 0.1.0 — Fondasi pengembangan

Express melayani frontend React dan REST API versi 1. MySQL menyimpan pengguna, sesi, proyek, penugasan, dan favorit.

## Menjalankan di lingkungan pengembangan

1. Gunakan Node.js 24 dan database MySQL khusus pengembangan.
2. Salin `.env.example` ke `.env`. Atur `NODE_ENV=development`, `APP_URL` sesuai origin browser, dan `DATABASE_URL`.
3. Jalankan `npm ci`, `npm run build`, lalu `npm run db:migrate`.
4. Atur `INITIAL_ADMIN_USERNAME` dan `INITIAL_ADMIN_PASSWORD` sementara. Jalankan `npm run db:seed`, lalu hapus kedua nilai bootstrap tersebut.
5. Jalankan `npm start`. Buka URL yang dikonfigurasi dan ganti password awal pada login pertama.

## Lingkup versi ini

Dashboard, daftar dan grid proyek, pencarian berdasarkan nama atau kategori, favorit per akun, ringkasan dan formulir proyek, pengaturan tema per akun, serta drawer ponsel. Akun yang ditugaskan ke proyek dapat membaca proyek dan mengelola favorit. Pengelolaan penugasan lewat antarmuka dan role granular belum tersedia.

Progress memiliki nilai awal nol. Perhitungan berbobot dari milestone akan tersedia bersama modul pipeline. Poster berbentuk kartu teks sampai penyimpanan file persisten dan unggah poster tersedia.

Fase mendatang mencakup RBAC granular, unit bisnis dan kategori terkelola, manajemen akun dan proyek lengkap, pipeline, tugas, Gantt, kalender, pengingat, keuangan, galeri, dokumen, PDF, portal klien, notifikasi, audit, pencarian lintas entitas, serta QA staging. Paket ini merupakan fondasi pengembangan. Rilis domain produksi menunggu implementasi dan verifikasi tersebut.
