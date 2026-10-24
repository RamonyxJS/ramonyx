# Showcase / Studi Kasus — Playbook Internal

- Status: 0 studi kasus terpublikasi (2026-10-24). Target backlog: 3–5 aplikasi nyata.
- Publik: `docs/public/showcase.md`, `docs/public/machine/case-studies.json`.
- Submission: `.github/ISSUE_TEMPLATE/case_study.yml`.

## Alur

1. Kumpulkan kandidat (pengguna aktif, issue/discussion, kontak komunitas). Jangan menambah logo
   atau kutipan tanpa izin.
2. Kirim undangan singkat: tujuan, bentuk publikasi, data yang diminta, dan tautan issue template.
3. Verifikasi aplikasi: URL/repo/konfirmasi pemilik; cek deploy Ramonyx (header, artefak, atau
   wawancara teknis).
4. Kumpulkan metrik: nama metrik, nilai, tanggal, lingkungan, metode, artefak mentah/perintah.
   Tolak angka tanpa sumber.
5. Wawancara 30–45 menit: masalah, arsitektur, migrasi, hasil, batasan, saran.
6. Draf studi kasus + review fakta + persetujuan tertulis (nama/URL/kutipan/screenshot).
7. Publikasikan halaman `docs/public/showcase/<slug>.md`, tambahkan entri machine JSON, tautkan dari
   nav/landing, dan catat tanggal verifikasi.
8. Perbarui `case-studies.json` (`published`, `status`) setelah minimal 3 entri terverifikasi.

## Kriteria penolakan

- Hanya logo/testimoni tanpa bukti atau izin.
- Metrik karangan, benchmark lintas mesin tanpa label, atau klaim "lebih cepat" tanpa skenario.
- Data pelanggan, secret, URL privat, atau detail insiden yang belum disetujui.
- Aplikasi yang tidak dapat diverifikasi sebagai pengguna Ramonyx.

## Format minimum

`id`, `title`, `appUrl`, `summary`, `stack`, `architecture`, `metrics[]`, `limitations[]`,
`permission`, `verification`, `docs` — sesuai schema `case-studies.schema.json`.
