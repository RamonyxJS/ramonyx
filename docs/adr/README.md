# ADR (Architecture Decision Records)

Satu keputusan = satu file `NNNN-judul-singkat.md` (nomor berurutan; jangan mengganti nomor lama).

- Status: `Proposed` (menunggu keputusan pemilik) · `Accepted` · `Rejected` · `Superseded by NNNN`
- Format minimum: Judul · Status · Tanggal · Konteks · Keputusan · Alternatif yang ditolak · Konsekuensi · Cara membuktikan.
- Keputusan baru yang mengubah keputusan lama → ADR baru dengan status `Superseded by`, jangan edit retroaktif.

| ADR | Judul | Status |
| --- | --- | --- |
| [0001](0001-runtime-strategy.md) | Strategi runtime: Node.js baseline + Rust/V8 eksperimental | Accepted |
| [0002](0002-baseline-tooling.md) | Baseline tooling, bahasa, dan CI | Accepted |
| [0003](0003-ui-adapter-react.md) | Adapter UI pertama: React | Accepted |
| [0004](0004-schema.md) | Kontrak schema validasi (Standard Schema) | Proposed |
| [0005](0005-bundler.md) | Bundler awal | Proposed |
