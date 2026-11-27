# Validasi staging Hostinger

Target produksi yang ditampilkan hPanel adalah `projectcore.papicilolaundry.com`. Gunakan URL staging tersendiri dengan database terpisah untuk memvalidasi rilis.

- ZIP sumber berisi package.json dan lockfile di akar arsip. Pilih Express, Node.js 24, perintah build `npm run build`, serta `backend/src/server.mjs` sebagai entry file bila hPanel memintanya. Perintah start lokal adalah `npm start`.
- Atur APP_URL ke origin HTTPS yang tepat, NODE_ENV ke production, dan DATABASE_URL lewat pengaturan environment hPanel. PORT mengikuti nilai hosting.
- Buktikan jalur eksekusi migrasi dan seed pada paket tujuan sebelum konfigurasi produksi ditetapkan. Jalankan migrasi incremental di database staging. Cabut variabel bootstrap setelah akun pertama berhasil dibuat.
- Verifikasi `/health`, login dan rotasi password awal, akses lintas proyek, favorit, tampilan responsif, dan persistensi sesi serta data proyek saat redeploy.
- Untuk modul file, uji tulis, baca, redeploy, backup, dan restore pada lokasi privat di luar direktori build. Untuk pengingat, uji cron UTC dengan konversi Asia/Jakarta.
- Sebelum rilis produksi, backup database dan storage, arsipkan ZIP rilis sebelumnya, dan verifikasi restore serta kecocokan skema dengan versi rollback.

## Modul sumber daya

Terapkan seluruh migrasi Prisma yang tertunda, termasuk project_tasks, task_assignment, dan project_resources, sebelum mengaktifkan rilis 0.1.7. Setel PROJECTCORE_STORAGE_PATH ke direktori absolut yang privat dan persisten di luar direktori deploy serta document root. Pastikan akun proses Node.js bisa membaca dan menulis ke direktori tersebut. Verifikasi dengan unggah, redeploy, dan unduh ulang di staging, serta masukkan direktori itu dalam prosedur cadangan. ZIP aplikasi tidak menyertakan berkas pengguna.

Cakupan awal: dokumen PDF, foto JPEG/PNG, pencatatan pemasukan/pengeluaran dalam rupiah, dan laporan PDF ringkasan proyek. Unggahan maksimal 10 MB per berkas.
