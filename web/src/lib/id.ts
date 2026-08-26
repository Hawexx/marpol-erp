/**
 * UUID v4 uretir.
 *
 * `crypto.randomUUID` yalnizca guvenli baglamlarda (HTTPS veya localhost)
 * tanimlidir. Sistem fabrika ic aginda duz HTTP uzerinden (ornegin
 * http://192.168.1.20) sunuldugunda bu fonksiyon yoktur ve cagrildiginda
 * TypeError firlatir. Sunucu dugum id'lerini istemciden bekledigi icin
 * (bkz. server/src/routes/workflows.ts) burada yedek uretim sart.
 */
export function newId(): string {
  const c = globalThis.crypto;

  if (typeof c?.randomUUID === 'function') return c.randomUUID();

  if (typeof c?.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // surum 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // varyant 10
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Son care: kriptografik degil, yalnizca cakismayi onlemeye yonelik.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
