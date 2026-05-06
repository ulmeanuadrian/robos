// Hardware fingerprint validation pe Worker side.
// Side-ul local (license-check.js) genereaza un sha256 hex din OS-specific identifiers.
// Worker-ul doar valideaza format si lungime — nu re-calculeaza.

const HEX64 = /^[a-f0-9]{64}$/;

export function isValidHardwareHash(hash) {
  return typeof hash === 'string' && HEX64.test(hash);
}

export function generateRandomToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateShortId(bytes = 8) {
  // pentru download tokens — mai scurte, vizibile in URL
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateLicenseId() {
  // UUID v4
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  arr[6] = (arr[6] & 0x0f) | 0x40;
  arr[8] = (arr[8] & 0x3f) | 0x80;
  const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
