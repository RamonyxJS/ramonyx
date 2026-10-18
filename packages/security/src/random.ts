/** Token acak hex memakai Web Crypto (tanpa `node:*` → runtime-agnostic). */
export function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  let token = "";
  for (const byte of buffer) {
    token += byte.toString(16).padStart(2, "0");
  }
  return token;
}

/** Perbandingan waktu-konstan sederhana (panjang sama → XOR akumulatif). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}
