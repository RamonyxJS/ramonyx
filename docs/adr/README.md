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
| [0004](0004-schema.md) | Kontrak schema validasi (Standard Schema) | Accepted |
| [0005](0005-bundler.md) | Bundler awal | Accepted |
| [0006](0006-jsx-loader.md) | Loader JSX dev/test (esbuild, bukan tsx) | Accepted |
| [0007](0007-hydration.md) | Hydration: payload inline + satu bundle client | Accepted |
| [0008](0008-client-navigation.md) | Client navigation: soft navigation (fetch → swap → re-hydrate) | Accepted |
| [0009](0009-dev-server.md) | Dev server: Vite front + proxy manual + ssrLoadModule | Accepted |
| [0010](0010-browser-e2e.md) | Browser E2E Playwright + baseline Web Vitals | Accepted |
| [0011](0011-resource-limits.md) | Resource limits secure-by-default (body 1 MiB, timeout 10s) | Accepted |
