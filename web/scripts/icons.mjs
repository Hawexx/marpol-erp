#!/usr/bin/env node
/**
 * Kullanilan UI5 ikonlarini tarar ve src/icons.ts dosyasini uretir/dogrular.
 *
 * Neden gerekli: onceden `AllIcons.js` iceri aliniyordu; bu, kullanilsin
 * kullanilmasin butun ikon setini (~1,1 MB) ilk yuklemeye ekliyordu.
 * Yalnizca kullanilan ikonlari almak icin listenin kod ile senkron kalmasi
 * sart - aksi halde birisi yeni bir `icon="..."` yazdiginda ikon sessizce
 * bos gorunur.
 *
 * Kullanim:
 *   node scripts/icons.mjs --write   # icons.ts dosyasini uret
 *   node scripts/icons.mjs --check   # senkron mu diye bak (CI/lint)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../src');
const OUT = join(SRC, 'icons.ts');
const OUT_ILLU = join(SRC, 'illustrations.ts');
const ICON_PKG = resolve(HERE, '../../node_modules/@ui5/webcomponents-icons/dist');

/** Kaynak agacindaki tum .ts/.tsx dosyalari. */
function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/**
 * Ikon adlarini toplar. Uc kullanim bicimi var:
 *   icon="add"            JSX niteligi
 *   icon: 'add-document'  yapilandirma dizisi (NAV, ACTIONS)
 *   icon={x ? 'a' : 'b'}  kosullu
 */
function extractIcons(text) {
  const names = new Set();

  for (const m of text.matchAll(/\bicon\s*=\s*"([a-z0-9-]+)"/g)) names.add(m[1]);
  for (const m of text.matchAll(/\bicon\s*:\s*'([a-z0-9-]+)'/g)) names.add(m[1]);

  /*
   * icon={...} blogu. Kosullu ifadelerde yalnizca SONUC dallari alinir:
   * `theme === 'dark' ? 'light-mode' : 'dark-mode'` ifadesinde 'dark' bir
   * ikon adi degil, karsilastirma degeridir.
   */
  for (const m of text.matchAll(/\bicon\s*=\s*\{([^}]*)\}/g)) {
    const expr = m[1];
    const q = expr.indexOf('?');
    const branches = q === -1 ? expr : expr.slice(q + 1);
    for (const lit of branches.matchAll(/'([a-z0-9-]+)'/g)) names.add(lit[1]);
  }

  return names;
}

/**
 * IllustratedMessage gorselleri. Bunlar da ayri ayri import edilmeli;
 * bilesen yalnizca BeforeSearch ve NoData'yi kendisi getirir, digerleri
 * import edilmezse ekranda gorsel hic cikmaz.
 */
function extractIllustrations(text) {
  const names = new Set();
  for (const m of text.matchAll(/<IllustratedMessage[^>]*?\bname\s*=\s*"([A-Za-z0-9]+)"/gs)) {
    names.add(m[1]);
  }
  return names;
}

const used = new Set();
const illustrations = new Set();
for (const file of sourceFiles(SRC)) {
  if (file === OUT) continue;
  const text = readFileSync(file, 'utf8');
  for (const name of extractIcons(text)) used.add(name);
  for (const name of extractIllustrations(text)) illustrations.add(name);
}

// Paket icinde gercekten var mi? Yanlis yazim derleme hatasi yerine bos
// ikon olarak gorunurdu.
const missing = [...used].filter((n) => !existsSync(join(ICON_PKG, `${n}.js`)));
if (missing.length) {
  console.error(`HATA: su ikonlar @ui5/webcomponents-icons icinde yok: ${missing.join(', ')}`);
  process.exit(1);
}

const ILLU_PKG = resolve(HERE, '../../node_modules/@ui5/webcomponents-fiori/dist/illustrations');
const eksikGorsel = [...illustrations].filter((n) => !existsSync(join(ILLU_PKG, `${n}.js`)));
if (eksikGorsel.length) {
  console.error(`HATA: su gorseller bulunamadi: ${eksikGorsel.join(', ')}`);
  process.exit(1);
}

const sorted = [...used].sort();
const sortedIllu = [...illustrations].sort();

const content = `/**
 * Kullanilan UI5 ikonlari.
 *
 * BU DOSYA URETILIR - elle duzenlemeyin.
 * Guncellemek icin:  npm run icons -w web
 *
 * Onceden \`AllIcons.js\` iceri aliniyordu; bu, ilk ikon cizilir cizilmez
 * TUM ikon veri paketinin indirilmesine yol aciyordu. UI5 bilesenleri kendi
 * ic ikonlarini (acilir ok, kapat, sirala vb.) zaten kendileri import ettigi
 * icin burada yalnizca uygulamanin acikca kullandigi ${sorted.length} ikon yer alir.
 */
${sorted.map((n) => `import '@ui5/webcomponents-icons/dist/${n}.js';`).join('\n')}
`;

const contentIllu = `/**
 * IllustratedMessage gorselleri.
 *
 * BU DOSYA URETILIR - elle duzenlemeyin.
 * Guncellemek icin:  npm run icons -w web
 *
 * Gorseller buyuk SVG verileridir (tek basina ~120 KB). Bu dosya bilerek
 * DINAMIK import edilir: gorsel yalnizca ilgili ekran acildiginda indirilir.
 * Bilesen yalnizca BeforeSearch ve NoData'yi kendisi getirir; digerleri
 * burada alinmazsa ekranda gorsel hic gorunmez (sessiz hata).
 */
${sortedIllu
  .map((n) => `import '@ui5/webcomponents-fiori/dist/illustrations/${n}.js';`)
  .join('\n')}
`;

const mode = process.argv[2] ?? '--check';

if (mode === '--write') {
  writeFileSync(OUT, content);
  writeFileSync(OUT_ILLU, contentIllu);
  console.log(`icons.ts: ${sorted.length} ikon, illustrations.ts: ${sortedIllu.length} gorsel`);
} else {
  const stale = [
    [OUT, content],
    [OUT_ILLU, contentIllu],
  ].filter(([f, expected]) => (existsSync(f) ? readFileSync(f, 'utf8') : '') !== expected);

  if (stale.length) {
    console.error(
      'HATA: uretilen ikon dosyalari guncel degil. Calistirin: npm run icons -w web\n' +
        stale.map(([f]) => `  - ${f}`).join('\n'),
    );
    process.exit(1);
  }
  console.log(`guncel (${sorted.length} ikon, ${sortedIllu.length} gorsel)`);
}
