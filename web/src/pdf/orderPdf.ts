/**
 * Üretim emrinin kurumsal PDF çıktısı.
 *
 * pdfmake, ana paketi şişirmemek için yalnızca indirme anında dinamik
 * olarak yüklenir. Türkçe karakterler pdfmake'in gömülü Roboto fontuyla
 * sorunsuz basılır.
 */
import type { Column, Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import {
  NODE_TYPE_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STEP_LABEL,
  formatDate,
  formatDateTime,
  formatNumber,
} from '../lib/format.js';
import type { OrderStatus, Priority, ProductionOrder } from '../api/types.js';

// Kurumsal renk paleti
const BRAND = '#E30613';
const INK = '#1D2429';
const MUTED = '#6A6D70';
const RULE = '#D9DDE1';
const HEAD_BG = '#0A2540';
const ZEBRA = '#F5F7F9';

const STATUS_COLOR: Record<OrderStatus, string> = {
  TASLAK: '#6A6D70',
  ONAY_BEKLIYOR: '#C35500',
  PLANLANDI: '#0057D2',
  URETIMDE: '#0057D2',
  BEKLEMEDE: '#C35500',
  TAMAMLANDI: '#0F7B32',
  IPTAL: '#B00020',
};

const PRIORITY_COLOR: Record<Priority, string> = {
  DUSUK: '#6A6D70',
  NORMAL: '#0F7B32',
  YUKSEK: '#C35500',
  KRITIK: '#B00020',
};

/** Logo bir kez rasterleştirilip önbelleğe alınır. */
let logoCache: string | null | undefined;

async function loadLogo(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;

  try {
    const response = await fetch('/marpol.svg');
    const svg = await response.text();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));

    const image = new Image();
    image.width = 520;
    image.height = 200;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('logo yüklenemedi'));
      image.src = url;
    });

    // 3x ölçek: baskıda keskin görünmesi için.
    const scale = 3;
    const canvas = document.createElement('canvas');
    canvas.width = 520 * scale;
    canvas.height = 200 * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas yok');
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0, 520, 200);
    URL.revokeObjectURL(url);

    logoCache = canvas.toDataURL('image/png');
  } catch {
    // Logo basılamazsa metin başlığa düşülür.
    logoCache = null;
  }
  return logoCache;
}

/** Renkli durum/aciliyet rozeti. */
function badge(text: string, color: string): Content {
  return {
    table: { body: [[{ text, color: '#FFFFFF', bold: true, fontSize: 8, margin: [6, 3, 6, 3] }]] },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: () => color,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  };
}

/** Bölüm başlığı - kırmızı çizgili. */
function sectionTitle(index: number, title: string): Content {
  return {
    margin: [0, 16, 0, 6],
    stack: [
      { text: `${index}.  ${title}`, fontSize: 10, bold: true, color: INK, characterSpacing: 0.4 },
      {
        canvas: [{ type: 'line', x1: 0, y1: 3, x2: 515, y2: 3, lineWidth: 1.4, lineColor: BRAND }],
      },
    ],
  };
}

/** Etiket/değer çiftlerini iki sütunlu künye tablosuna dönüştürür. */
function infoTable(rows: [string, string][]): Content {
  const body: TableCell[][] = [];
  for (let i = 0; i < rows.length; i += 2) {
    const left = rows[i];
    const right = rows[i + 1];
    body.push([
      { text: left[0], style: 'infoLabel' },
      { text: left[1] || '-', style: 'infoValue' },
      { text: right ? right[0] : '', style: 'infoLabel' },
      { text: right ? right[1] || '-' : '', style: 'infoValue' },
    ]);
  }

  return {
    table: { widths: ['20%', '30%', '20%', '30%'], body },
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: () => 0,
      hLineColor: () => RULE,
      paddingLeft: () => 4,
      paddingRight: () => 4,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
  };
}

/** Veri tabloları için ortak görünüm: koyu başlık + zebra satırlar. */
const dataTableLayout = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
    i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4,
  vLineWidth: () => 0,
  hLineColor: (i: number) => (i === 1 ? HEAD_BG : RULE),
  fillColor: (rowIndex: number) =>
    rowIndex === 0 ? HEAD_BG : rowIndex % 2 === 0 ? ZEBRA : null,
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 5,
  paddingBottom: () => 5,
};

export function buildOrderDocument(
  order: ProductionOrder,
  logo: string | null,
): TDocumentDefinitions {
  const printedAt = new Date();
  const batchSize = order.recipe?.batchSize ?? null;

  // --- Kimyasal oranlaması ---
  const chemicalHead = ['#', 'Kod', 'Kimyasal', 'Tip', 'Oran (%)'];
  if (batchSize) chemicalHead.push(`Miktar (${formatNumber(batchSize, 0)} kg)`);
  chemicalHead.push('Açıklama');

  const ratioTotal = order.chemicals.reduce((sum, row) => sum + row.ratio, 0);

  const chemicalBody: TableCell[][] = [
    chemicalHead.map((text) => ({ text, style: 'th' })),
    ...order.chemicals.map((row, index) => {
      const cells: TableCell[] = [
        { text: String(index + 1), style: 'tdCenter' },
        { text: row.chemical?.code ?? '-', style: 'tdMono' },
        { text: row.chemical?.name ?? '-', style: 'td' },
        { text: row.chemical?.type ?? '-', style: 'td' },
        { text: formatNumber(row.ratio, 2), style: 'tdRight' },
      ];
      if (batchSize) {
        cells.push({
          text: `${formatNumber((batchSize * row.ratio) / 100, 2)} ${row.chemical?.unit ?? 'kg'}`,
          style: 'tdRight',
        });
      }
      cells.push({ text: row.notes ?? '-', style: 'td' });
      return cells;
    }),
  ];

  // Toplam satırı
  const totalRow: TableCell[] = [
    { text: '', style: 'td' },
    { text: '', style: 'td' },
    { text: 'TOPLAM', style: 'tdBold', colSpan: 2 },
    { text: '' },
    { text: formatNumber(ratioTotal, 2), style: 'tdRightBold' },
  ];
  if (batchSize) {
    totalRow.push({ text: `${formatNumber(batchSize, 2)} kg`, style: 'tdRightBold' });
  }
  totalRow.push({ text: '', style: 'td' });
  chemicalBody.push(totalRow);

  const chemicalWidths = batchSize
    ? [18, 48, '*', 62, 48, 72, 92]
    : [18, 52, '*', 70, 52, 110];

  // --- Proses akışı ---
  const steps = [...order.stepLogs].sort((a, b) => a.node.sortOrder - b.node.sortOrder);
  const stepBody: TableCell[][] = [
    ['#', 'Üretim Adımı', 'Tip', 'Makine / Hat', 'Süre', 'Sıcaklık', 'Durum'].map((text) => ({
      text,
      style: 'th',
    })),
    ...steps.map((step, index) => [
      { text: String(index + 1), style: 'tdCenter' },
      { text: step.node.label, style: 'td' },
      { text: NODE_TYPE_LABEL[step.node.type] ?? step.node.type, style: 'td' },
      { text: step.node.machine?.name ?? '-', style: 'td' },
      { text: step.node.durationMin ? `${formatNumber(step.node.durationMin)} dk` : '-', style: 'tdRight' },
      { text: step.node.temperature ? `${formatNumber(step.node.temperature)} °C` : '-', style: 'tdRight' },
      { text: STEP_LABEL[step.status], style: 'tdCenter' },
    ]),
  ];

  const content: Content[] = [
    // Emir numarası bandı
    {
      margin: [0, 0, 0, 4],
      columns: [
        {
          width: '*',
          stack: [
            { text: 'ÜRETİM EMRİ', fontSize: 18, bold: true, color: INK, characterSpacing: 1.2 },
            {
              text: order.orderNo,
              fontSize: 13, bold: true, color: BRAND, margin: [0, 2, 0, 0],
            },
          ],
        },
        {
          width: 'auto',
          alignment: 'right',
          stack: [
            { columns: [{ width: '*', text: '' }, badge(STATUS_LABEL[order.status], STATUS_COLOR[order.status])] },
            { text: ' ', fontSize: 3 },
            { columns: [{ width: '*', text: '' }, badge(`ACİLİYET: ${PRIORITY_LABEL[order.priority]}`, PRIORITY_COLOR[order.priority])] },
          ],
        },
      ],
    },

    sectionTitle(1, 'EMİR BİLGİLERİ'),
    infoTable([
      ['Emir No', order.orderNo],
      ['Durum', STATUS_LABEL[order.status]],
      ['Müşteri', order.customer ?? '-'],
      ['Aciliyet', PRIORITY_LABEL[order.priority]],
      ['Termin Tarihi', formatDate(order.deadline)],
      ['Planlanan Başlangıç', formatDate(order.plannedStart)],
      ['Emri Oluşturan', order.createdBy.fullName],
      ['Oluşturma Tarihi', formatDateTime(order.createdAt)],
      ['Onaylayan', order.approvedBy?.fullName ?? '-'],
      ['Üretim Başlangıcı', formatDateTime(order.startedAt)],
      ['Tamamlanma', formatDateTime(order.completedAt)],
      ['Üretilen / Hedef', `${formatNumber(order.producedQty)} / ${formatNumber(order.quantity)} adet`],
    ]),

    sectionTitle(2, 'ÜRÜN TANIMI'),
    infoTable([
      ['Kumaş Çeşidi', `${order.fabric.code} - ${order.fabric.name}`],
      ['Kumaş Tipi', order.fabric.type ?? '-'],
      ['Flanş Çeşidi', `${order.flange.code} - ${order.flange.name}`],
      ['Flanş Malzemesi', order.flange.material ?? '-'],
      ['Disk Çapı', `${formatNumber(order.diskDiameter, 1)} mm`],
      ['Katman Sayısı', `${order.layers} katman`],
      ['Üretim Adedi', `${formatNumber(order.quantity)} adet`],
      ['Gramaj', order.fabric.gramaj ? `${formatNumber(order.fabric.gramaj)} g/m²` : '-'],
    ]),

    sectionTitle(3, 'KUMAŞA EMDİRİLECEK KİMYASAL ORANLAMASI'),
    order.recipe
      ? {
          text: `Uygulanan reçete: ${order.recipe.code} - ${order.recipe.name} (v${order.recipe.version})`,
          style: 'caption',
          margin: [0, 0, 0, 6],
        }
      : { text: 'Bu emir için özel oranlama girilmiştir.', style: 'caption', margin: [0, 0, 0, 6] },
    order.chemicals.length
      ? {
          table: { headerRows: 1, widths: chemicalWidths, body: chemicalBody },
          layout: dataTableLayout,
        }
      : { text: 'Kimyasal oranlaması girilmemiştir.', style: 'caption' },

    sectionTitle(4, 'ÜRETİM PROSES AKIŞI'),
    order.workflow
      ? {
          text: `Proses şeması: ${order.workflow.code} - ${order.workflow.name} (v${order.workflow.version})`,
          style: 'caption',
          margin: [0, 0, 0, 6],
        }
      : { text: 'Bu emre proses şeması bağlanmamıştır.', style: 'caption' },
    ...(steps.length
      ? [
          {
            table: { headerRows: 1, widths: [18, '*', 66, 92, 42, 48, 60], body: stepBody },
            layout: dataTableLayout,
          } as Content,
        ]
      : []),

    sectionTitle(5, 'ÜRETİM NOTLARI VE ÖZEL TALİMATLAR'),
    {
      table: {
        widths: ['*'],
        body: [[{ text: order.notes?.trim() || 'Özel talimat girilmemiştir.', style: 'note' }]],
      },
      layout: {
        hLineWidth: () => 0.6,
        vLineWidth: () => 0.6,
        hLineColor: () => RULE,
        vLineColor: () => RULE,
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 8,
        paddingBottom: () => 8,
      },
    },

    // İmza bloğu - sayfa sonunda bölünmesin
    {
      unbreakable: true,
      margin: [0, 26, 0, 0],
      columns: [
        signatureBox('Hazırlayan', order.createdBy.fullName),
        { width: 16, text: '' },
        signatureBox('Onaylayan', order.approvedBy?.fullName ?? ''),
        { width: 16, text: '' },
        signatureBox('Üretim Sorumlusu', ''),
      ],
    },
  ];

  return {
    pageSize: 'A4',
    pageMargins: [40, logo ? 96 : 84, 40, 56],
    info: {
      title: `Uretim Emri ${order.orderNo}`,
      author: 'Marpol A.S.',
      subject: 'Uretim Emri',
      creator: 'Marpol Uretim Yonetim Sistemi',
    },
    ...(order.status === 'TASLAK' || order.status === 'IPTAL'
      ? {
          watermark: {
            text: STATUS_LABEL[order.status].toLocaleUpperCase('tr-TR'),
            color: order.status === 'IPTAL' ? '#B00020' : '#6A6D70',
            opacity: 0.08,
            bold: true,
          },
        }
      : {}),

    header: () => ({
      margin: [40, 22, 40, 0],
      stack: [
        {
          columns: [
            logo
              ? { image: logo, width: 132, margin: [0, 2, 0, 0] }
              : {
                  text: 'MARPOL',
                  fontSize: 22,
                  bold: true,
                  italics: true,
                  color: BRAND,
                  margin: [0, 4, 0, 0],
                },
            {
              width: '*',
              alignment: 'right',
              stack: [
                { text: 'ÜRETİM YÖNETİM SİSTEMİ', fontSize: 8, color: MUTED, characterSpacing: 1.6 },
                { text: 'ÜRETİM EMRİ FORMU', fontSize: 11, bold: true, color: INK, margin: [0, 2, 0, 0] },
                { text: `Doküman No: ${order.orderNo}`, fontSize: 8, color: MUTED, margin: [0, 2, 0, 0] },
              ],
            },
          ],
        },
        {
          margin: [0, 8, 0, 0],
          canvas: [
            { type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: BRAND },
            { type: 'line', x1: 0, y1: 3, x2: 515, y2: 3, lineWidth: 0.6, lineColor: RULE },
          ],
        },
      ],
    }),

    footer: (currentPage: number, pageCount: number) => ({
      margin: [40, 12, 40, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.6, lineColor: RULE }] },
        {
          margin: [0, 6, 0, 0],
          columns: [
            { text: 'Marpol A.Ş.  ·  Disk Cila Fırçası Üretimi', fontSize: 7.5, color: MUTED },
            {
              text: `Baskı: ${printedAt.toLocaleString('tr-TR')}`,
              fontSize: 7.5,
              color: MUTED,
              alignment: 'center',
            },
            {
              text: `Sayfa ${currentPage} / ${pageCount}`,
              fontSize: 7.5,
              color: MUTED,
              alignment: 'right',
            },
          ],
        },
        {
          text: 'Bu belge Marpol Üretim Yönetim Sistemi tarafından otomatik oluşturulmuştur.',
          fontSize: 6.5,
          color: MUTED,
          margin: [0, 3, 0, 0],
        },
      ],
    }),

    content,

    defaultStyle: { font: 'Roboto', fontSize: 9, color: INK, lineHeight: 1.15 },
    styles: {
      infoLabel: { fontSize: 8, color: MUTED, characterSpacing: 0.2 },
      infoValue: { fontSize: 9, bold: true, color: INK },
      caption: { fontSize: 8, color: MUTED, italics: true },
      th: { fontSize: 8, bold: true, color: '#FFFFFF', characterSpacing: 0.3 },
      td: { fontSize: 8.5 },
      tdBold: { fontSize: 8.5, bold: true },
      tdMono: { fontSize: 8.5, bold: true, color: BRAND },
      tdCenter: { fontSize: 8.5, alignment: 'center' },
      tdRight: { fontSize: 8.5, alignment: 'right' },
      tdRightBold: { fontSize: 8.5, alignment: 'right', bold: true },
      note: { fontSize: 8.5, color: INK },
      sigRole: { fontSize: 7.5, color: MUTED, characterSpacing: 0.6 },
      sigName: { fontSize: 8.5, bold: true, color: INK },
    },
  };
}

/** İmza kutusu - ad, tarih ve imza satırı. */
function signatureBox(role: string, name: string): Column {
  return {
    width: '*',
    stack: [
      { text: role.toLocaleUpperCase('tr-TR'), style: 'sigRole' },
      {
        margin: [0, 4, 0, 0],
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 0.8, lineColor: RULE }],
      },
      { text: name || ' ', style: 'sigName', margin: [0, 6, 0, 0] },
      { text: 'Tarih / İmza', fontSize: 7, color: MUTED, margin: [0, 18, 0, 0] },
      {
        margin: [0, 2, 0, 0],
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 0.8, lineColor: INK }],
      },
    ],
  };
}

/**
 * Üretim emrini PDF olarak oluşturur ve tarayıcıya indirtir.
 * Dosya adı: UE-2026-0001.pdf
 */
export async function downloadOrderPdf(order: ProductionOrder): Promise<void> {
  const [{ default: pdfMakeImport }, fontsModule, logo] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
    loadLogo(),
  ]);

  const pdfMake = pdfMakeImport as unknown as {
    vfs: unknown;
    createPdf: (def: TDocumentDefinitions) => { download: (name: string) => void };
  };
  // vfs_fonts sürüme göre ya doğrudan ya da default altında gelir.
  const fonts = fontsModule as unknown as { default?: unknown };
  pdfMake.vfs = fonts.default ?? fontsModule;

  pdfMake.createPdf(buildOrderDocument(order, logo)).download(`${order.orderNo}.pdf`);
}
