import 'dotenv/config';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Ornek dosyalarda ve eski surumlerde dagitilmis anahtarlar. Bunlar kaynak
 * kodda gorulebildigi icin token uretiminde kullanilamaz.
 */
const BILINEN_ZAYIF_ANAHTARLAR = new Set([
  'bu-anahtari-uretimde-mutlaka-degistirin',
  'marpol-ppm-gelistirme-anahtari-degistirin',
  'degistirin',
  'change-me',
  'changeme',
  'secret',
]);

/** Zorunlu ortam degiskeni. Eksikse uygulama acilmaz. */
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Ortam degiskeni eksik: ${name}. server/.env dosyasini .env.example'a gore doldurun.`,
    );
  }
  return value;
}

/**
 * Imzalama anahtari. Varsayilan deger YOKTUR: eksik ya da zayif anahtarla
 * acilmak, kaynak kodu goren herkesin token uretebilmesi demektir.
 */
function requiredSecret(name: string): string {
  const value = required(name);

  if (BILINEN_ZAYIF_ANAHTARLAR.has(value.toLowerCase())) {
    throw new Error(
      `${name} ornek dosyadaki varsayilan degerde ve guvenli degil. ` +
        'Yeni anahtar uretin: openssl rand -base64 48',
    );
  }
  if (value.length < 32) {
    throw new Error(
      `${name} en az 32 karakter olmalidir (su an ${value.length}). ` +
        'Yeni anahtar uretin: openssl rand -base64 48',
    );
  }
  return value;
}

function readPort(): number {
  const raw = process.env.PORT?.trim() || '4000';
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`PORT gecersiz: "${raw}". 1-65535 arasinda tam sayi olmalidir.`);
  }
  return parsed;
}

/**
 * Izin verilen istemci adresleri. Uretimde sessizce localhost'a dusmek,
 * dagitim sirasinda fark edilmeyen bir yapilandirma hatasi birakir.
 */
function readCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN?.trim();

  if (!raw) {
    if (isProduction) {
      throw new Error('Uretim ortaminda CORS_ORIGIN tanimlanmalidir.');
    }
    return ['http://localhost:5173'];
  }

  const list = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (!list.length) throw new Error('CORS_ORIGIN bos olamaz.');
  return list;
}

function readBcryptRounds(): number {
  const raw = process.env.BCRYPT_ROUNDS?.trim() || '12';
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 10 || parsed > 15) {
    throw new Error(`BCRYPT_ROUNDS gecersiz: "${raw}". 10-15 arasinda tam sayi olmalidir.`);
  }
  return parsed;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction,
  port: readPort(),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: requiredSecret('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN?.trim() || '8h',
  jwtIssuer: 'marpol-ppm',
  jwtAudience: 'marpol-ppm-web',
  corsOrigin: readCorsOrigins(),
  bcryptRounds: readBcryptRounds(),
  /** Ters vekil arkasinda calisirken gercek istemci IP'si icin (audit kayitlari). */
  trustProxy: process.env.TRUST_PROXY?.trim() || (isProduction ? '1' : 'loopback'),
};
