/** Header yang membawa nonce per-request (diisi middleware `cspNonce`, dibaca ssr untuk atribut script). */
export const NONCE_HEADER = "x-ramonyx-nonce";

/**
 * Header alamat klien yang diisi **adapter** (bukan dari jaringan) — dipakai middleware `rateLimit`.
 * Nilai dari klien akan ditimpa adapter, sehingga tidak bisa dipalsukan.
 */
export const REMOTE_ADDRESS_HEADER = "x-ramonyx-remote-address";
