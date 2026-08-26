import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { ModuleKey, OrderStatus, Priority, StepStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler, badRequest, conflict, forbidden } from '../lib/http.js';
import { pageResponse, readPageParams } from '../lib/pagination.js';
import { audit } from '../lib/audit.js';
import { assertNoDuplicates, assertRatioTotal, text } from '../lib/schemaHelpers.js';
import {
  ONAY_GEREKTIREN_DURUMLAR,
  STEP_TRANSITIONS,
  TRANSITIONS,
} from '../lib/orderState.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';

export const ordersRouter = Router();

const CREATE_MODULE = ModuleKey.URETIM_EMRI_OLUSTUR;
const LIST_MODULE = ModuleKey.URETIM_EMIRLERI;

const chemicalSchema = z.object({
  chemicalId: z.string().uuid('Kimyasal secimi gecersiz.'),
  ratio: z.coerce.number().min(0).max(100),
  amount: z.coerce.number().nonnegative().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
  notes: text,
});

const schema = z.object({
  fabricId: z.string().uuid('Kumas secimi zorunludur.'),
  flangeId: z.string().uuid('Flans secimi zorunludur.'),
  recipeId: z.string().uuid().optional().nullable(),
  workflowId: z.string().uuid().optional().nullable(),
  diskDiameter: z.coerce.number().positive('Disk capi 0 dan buyuk olmalidir.'),
  quantity: z.coerce.number().int().positive('Adet 0 dan buyuk olmalidir.'),
  layers: z.coerce.number().int().min(1, 'Katman sayisi en az 1 olmalidir.').default(1),
  priority: z.nativeEnum(Priority).default(Priority.NORMAL),
  deadline: z.coerce.date({ invalid_type_error: 'Termin tarihi gecersiz.' }),
  plannedStart: z.coerce.date().optional().nullable(),
  customer: text,
  notes: text,
  /**
   * Durum bilerek istemciden alinmaz. Serbest birakildiginda yalnizca
   * "olusturma" yetkisi olan biri emri dogrudan PLANLANDI/TAMAMLANDI
   * yaparak onay akisini ve canApprove kontrolunu atlayabiliyordu.
   */
  submitForApproval: z.boolean().default(true),
  chemicals: z.array(chemicalSchema).default([]),
});

const include = {
  fabric: true,
  flange: true,
  recipe: { include: { items: { include: { chemical: true } } } },
  workflow: { include: { nodes: { include: { machine: true } }, edges: true } },
  chemicals: { include: { chemical: true }, orderBy: { sortOrder: 'asc' as const } },
  createdBy: { select: { id: true, fullName: true, username: true } },
  approvedBy: { select: { id: true, fullName: true } },
  stepLogs: {
    include: {
      node: true,
      operator: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.ProductionOrderInclude;

/**
 * Liste gorunumu icin hafif include.
 *
 * Tam `include` her emirle birlikte bagli proses semasinin TUM dugumlerini,
 * kenarlarini ve recete kalemlerini tasiyordu; ayni sema yuzlerce emirde
 * tekrar edince yanit megabaytlara ciktigi gibi her arama tusunda yeniden
 * uretiliyordu. Listede gosterilmeyen alanlar burada yok - ayrinti icin
 * GET /orders/:id kullanilir.
 */
const listInclude = {
  fabric: { select: { id: true, code: true, name: true } },
  flange: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, fullName: true, username: true } },
  approvedBy: { select: { id: true, fullName: true } },
  chemicals: {
    select: {
      chemicalId: true,
      ratio: true,
      sortOrder: true,
      chemical: { select: { id: true, code: true, name: true, unit: true } },
    },
    orderBy: { sortOrder: 'asc' as const },
  },
  workflow: { select: { id: true, code: true, name: true } },
  _count: { select: { stepLogs: true } },
} satisfies Prisma.ProductionOrderInclude;

/**
 * UE-2026-0001 formatinda sirali emir numarasi uretir.
 *
 * Onceki surum `orderBy: { orderNo: 'desc' }` ile son kaydi okuyup bir
 * artiriyordu. Uc ayri sorun vardi:
 *  1. Es zamanli iki istek ayni numarayi uretiyor, biri unique kisitina
 *     carpiyordu (yeniden deneme yok).
 *  2. Siralama sozlukseldi: 9999'dan sonra '9999' > '10000' oldugu icin
 *     sayac orada takiliyordu.
 *  3. Elle girilmis bozuk bir numara Number() ile NaN'e donuyordu.
 *
 * Cozum: yil basina tek satirlik bir sayac tablosu. Satir kilidi islem
 * boyunca tutuldugundan es zamanli istekler siraya girer.
 */
async function nextOrderNo(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const counter = await tx.orderCounter.update({
    where: { year },
    data: { lastSeq: { increment: 1 } },
    select: { lastSeq: true },
  });

  // 4 hane taban; 9999 asilirsa dogal olarak genisler (UE-2026-10000).
  return `UE-${year}-${String(counter.lastSeq).padStart(4, '0')}`;
}

/**
 * Sayac satirini garanti eder. Sayac tablosu sonradan eklendigi icin, mevcut
 * emirlerin en buyuk sira numarasi devralinir; aksi halde ilk yeni emir
 * UE-2026-0001'i tekrar uretip unique kisitina carpardi.
 *
 * Emir olusturma isleminin DISINDA calisir: cakisma durumunda `upsert`
 * bir sey yapmaz, boylece ana islem bozulmaz.
 */
async function ensureOrderCounter(year: number): Promise<void> {
  if (await prisma.orderCounter.findUnique({ where: { year } })) return;

  const prefix = `UE-${year}-`;
  const orders = await prisma.productionOrder.findMany({
    where: { orderNo: { startsWith: prefix } },
    select: { orderNo: true },
  });

  const maxSeq = orders.reduce((max, o) => {
    const parsed = Number.parseInt(o.orderNo.slice(prefix.length), 10);
    return Number.isFinite(parsed) && parsed > max ? parsed : max;
  }, 0);

  await prisma.orderCounter.upsert({
    where: { year },
    create: { year, lastSeq: maxSeq },
    update: {}, // baska bir istek arada olusturduysa dokunma
  });
}

/**
 * Emir icin kimyasal oranlamasini belirler: kullanici satir girmediyse
 * secilen recete satirlari kopyalanir.
 */
async function resolveChemicals(
  tx: Prisma.TransactionClient,
  input: z.infer<typeof schema>,
): Promise<{ chemicalId: string; ratio: number; amount: number | null; sortOrder: number; notes: string | null }[]> {
  let rows = input.chemicals;

  if (rows.length === 0 && input.recipeId) {
    const items = await tx.recipeItem.findMany({
      where: { recipeId: input.recipeId },
      orderBy: { sortOrder: 'asc' },
    });
    rows = items.map((item) => ({
      chemicalId: item.chemicalId,
      ratio: item.ratio,
      amount: null,
      sortOrder: item.sortOrder,
      notes: item.notes,
    }));
  }

  if (rows.length === 0) {
    throw badRequest('Kimyasal oranlamasi girilmeli veya bir recete secilmelidir.');
  }

  assertRatioTotal(rows);
  assertNoDuplicates(rows, (r) => r.chemicalId, 'Kimyasal');

  return rows.map((r, i) => ({
    chemicalId: r.chemicalId,
    ratio: r.ratio,
    amount: r.amount ?? null,
    sortOrder: r.sortOrder || i,
    notes: r.notes ?? null,
  }));
}

/** Emre baglanan proses semasinin adimlarindan takip kayitlarini olusturur. */
async function createStepLogs(tx: Prisma.TransactionClient, orderId: string, workflowId: string) {
  const nodes = await tx.workflowNode.findMany({
    where: { workflowId },
    orderBy: { sortOrder: 'asc' },
  });
  if (!nodes.length) return;

  await tx.orderStepLog.createMany({
    data: nodes.map((node) => ({ orderId, nodeId: node.id, status: StepStatus.BEKLIYOR })),
    skipDuplicates: true,
  });
}

/**
 * "A,B,C" seklindeki sorgu parametresini dogrulanmis enum dizisine cevirir.
 * Gecersiz deger 400 ile geri doner.
 */
function parseEnumList<T extends Record<string, string>>(
  raw: unknown,
  enumObj: T,
  field: string,
): T[keyof T][] | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;

  const allowed = Object.values(enumObj) as string[];
  const values = String(raw)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const invalid = values.filter((v) => !allowed.includes(v));
  if (invalid.length) {
    throw badRequest(
      `"${field}" icin gecersiz deger: ${invalid.join(', ')}. Gecerli degerler: ${allowed.join(', ')}`,
    );
  }
  return values.length ? (values as T[keyof T][]) : undefined;
}

/**
 * Kismi guncelleme yardimcisi: alan hic gonderilmemisse mevcut deger korunur,
 * acikca `null` veya bos string gonderilmisse temizlenir.
 */
function patchNullable<T>(incoming: T | null | undefined, current: T | null): T | null {
  if (incoming === undefined) return current;
  if (incoming === null || incoming === ('' as unknown as T)) return null;
  return incoming;
}

ordersRouter.use(requireAuth);

// Listeleme: emir olusturan da, uretim sahasi da gorebilmeli.
const canRead = requireAnyPermission([LIST_MODULE, CREATE_MODULE], 'view');

/** Liste ve disa aktarma icin ortak filtre kurulumu. */
function buildOrderFilter(req: Request): Prisma.ProductionOrderWhereInput {
  const q = String(req.query.q ?? '').trim();
  // Enum degerleri dogrulanmadan Prisma'ya verildiginde
  // PrismaClientValidationError firlatiyor ve istemciye 400 yerine 500
  // donuyordu.
  const status = parseEnumList(req.query.status, OrderStatus, 'status');
  const priority = parseEnumList(req.query.priority, Priority, 'priority');

  const customer = String(req.query.customer ?? '').trim();
  const fabricId = String(req.query.fabricId ?? '').trim();
  const flangeId = String(req.query.flangeId ?? '').trim();
  const deadlineFrom = parseDateParam(req.query.deadlineFrom, 'deadlineFrom');
  const deadlineTo = parseDateParam(req.query.deadlineTo, 'deadlineTo');

  if (deadlineFrom && deadlineTo && deadlineFrom > deadlineTo) {
    throw badRequest('Termin baslangici bitisten sonra olamaz.');
  }

  return {
    ...(status ? { status: { in: status } } : {}),
    ...(priority ? { priority: { in: priority } } : {}),
    ...(customer ? { customer: { contains: customer, mode: 'insensitive' } } : {}),
    ...(fabricId ? { fabricId } : {}),
    ...(flangeId ? { flangeId } : {}),
    ...(deadlineFrom || deadlineTo
      ? {
          deadline: {
            ...(deadlineFrom ? { gte: deadlineFrom } : {}),
            // Bitis gunu tamamen dahil olsun.
            ...(deadlineTo ? { lte: new Date(deadlineTo.getTime() + 86_399_999) } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { orderNo: { contains: q, mode: 'insensitive' } },
            { customer: { contains: q, mode: 'insensitive' } },
            { fabric: { name: { contains: q, mode: 'insensitive' } } },
            { flange: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
}

function parseDateParam(raw: unknown, field: string): Date | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const date = new Date(String(raw));
  if (Number.isNaN(date.getTime())) throw badRequest(`"${field}" gecerli bir tarih olmalidir.`);
  return date;
}

// Aciliyet ve termin sirasi: sahada ilk bakilan sira.
const listOrderBy: Prisma.ProductionOrderOrderByWithRelationInput[] = [
  { status: 'asc' },
  { deadline: 'asc' },
];

ordersRouter.get(
  '/',
  canRead,
  asyncHandler(async (req, res) => {
    const where = buildOrderFilter(req);
    const params = readPageParams(req);

    const [rows, total] = await Promise.all([
      prisma.productionOrder.findMany({
        where,
        include: listInclude,
        orderBy: listOrderBy,
        skip: params.skip,
        take: params.take,
      }),
      prisma.productionOrder.count({ where }),
    ]);

    res.json(pageResponse(rows, total, params));
  }),
);

/** Uretim panosu ozet sayilari. */
ordersRouter.get(
  '/summary',
  canRead,
  asyncHandler(async (_req, res) => {
    const [byStatus, byPriority, overdue, total] = await Promise.all([
      prisma.productionOrder.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.productionOrder.groupBy({ by: ['priority'], _count: { _all: true } }),
      prisma.productionOrder.count({
        where: {
          deadline: { lt: new Date() },
          status: { notIn: [OrderStatus.TAMAMLANDI, OrderStatus.IPTAL] },
        },
      }),
      prisma.productionOrder.count(),
    ]);

    res.json({
      total,
      overdue,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
      byPriority: Object.fromEntries(byPriority.map((r) => [r.priority, r._count._all])),
    });
  }),
);

ordersRouter.get(
  '/:id',
  canRead,
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.productionOrder.findUniqueOrThrow({ where: { id: req.params.id }, include }),
    );
  }),
);

ordersRouter.post(
  '/',
  requirePermission(CREATE_MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = schema.parse(req.body);
    const year = new Date().getFullYear();
    await ensureOrderCounter(year);

    const created = await prisma.$transaction(async (tx) => {
      const chemicals = await resolveChemicals(tx, data);
      const order = await tx.productionOrder.create({
        data: {
          orderNo: await nextOrderNo(tx, year),
          fabricId: data.fabricId,
          flangeId: data.flangeId,
          recipeId: data.recipeId || null,
          workflowId: data.workflowId || null,
          diskDiameter: data.diskDiameter,
          quantity: data.quantity,
          layers: data.layers,
          priority: data.priority,
          deadline: data.deadline,
          plannedStart: data.plannedStart ?? null,
          customer: data.customer || null,
          notes: data.notes || null,
          status: data.submitForApproval ? OrderStatus.ONAY_BEKLIYOR : OrderStatus.TASLAK,
          createdById: req.user!.id,
          chemicals: { create: chemicals },
        },
      });

      if (data.workflowId) await createStepLogs(tx, order.id, data.workflowId);
      return tx.productionOrder.findUniqueOrThrow({ where: { id: order.id }, include });
    });

    await audit(req, 'CREATE', 'ProductionOrder', created.id, { orderNo: created.orderNo });
    res.status(201).json(created);
  }),
);

ordersRouter.put(
  '/:id',
  requirePermission(CREATE_MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = schema.parse(req.body);
    const id = req.params.id;

    const updated = await prisma.$transaction(async (tx) => {
      // Kayit islem icinde okunur: aksi halde kontrol ile guncelleme arasinda
      // durum degisebilir (TOCTOU).
      const current = await tx.productionOrder.findUniqueOrThrow({ where: { id } });
      if (current.status === OrderStatus.TAMAMLANDI || current.status === OrderStatus.IPTAL) {
        throw conflict('Tamamlanmis veya iptal edilmis emir duzenlenemez.');
      }

      /*
       * Gonderilmeyen alan DEGISTIRILMEZ; temizlemek icin acikca `null`
       * gonderilmelidir.
       *
       * Onceden dogrudan `data.workflowId !== current.workflowId`
       * karsilastiriliyordu. Alan opsiyonel oldugu icin gonderilmediginde
       * `undefined` oluyor, bu da mevcut sema ile esitsiz cikip emrin TUM
       * adim kayitlarini (operator, zaman damgasi, OK/fire miktarlari)
       * siliyordu. Semadan hic bahsetmeyen bir guncelleme uretim gecmisini
       * yok etmemeli.
       */
      const nextWorkflowId =
        data.workflowId === undefined ? current.workflowId : (data.workflowId ?? null);
      const workflowChanged = nextWorkflowId !== current.workflowId;

      if (workflowChanged) {
        const ilerlemis = await tx.orderStepLog.count({
          where: { orderId: id, status: { not: StepStatus.BEKLIYOR } },
        });
        if (ilerlemis > 0) {
          throw conflict(
            'Bu emirde uretimi baslamis adimlar var; proses semasi degistirilemez. ' +
              'Once adim kayitlarini gozden gecirin.',
          );
        }
        await tx.orderStepLog.deleteMany({ where: { orderId: id } });
      }

      const chemicals = await resolveChemicals(tx, data);
      await tx.orderChemical.deleteMany({ where: { orderId: id } });

      await tx.productionOrder.update({
        where: { id },
        data: {
          fabricId: data.fabricId,
          flangeId: data.flangeId,
          // Opsiyonel alanlarda ayni kural: gonderilmeyen korunur,
          // acikca null/bos gonderilen temizlenir.
          recipeId: patchNullable(data.recipeId, current.recipeId),
          workflowId: nextWorkflowId,
          diskDiameter: data.diskDiameter,
          quantity: data.quantity,
          layers: data.layers,
          priority: data.priority,
          deadline: data.deadline,
          plannedStart: patchNullable(data.plannedStart, current.plannedStart),
          customer: patchNullable(data.customer, current.customer),
          notes: patchNullable(data.notes, current.notes),
          chemicals: { create: chemicals },
        },
      });

      if (workflowChanged && nextWorkflowId) {
        await createStepLogs(tx, id, nextWorkflowId);
      }
      return tx.productionOrder.findUniqueOrThrow({ where: { id }, include });
    });

    await audit(req, 'UPDATE', 'ProductionOrder', id, { orderNo: updated.orderNo });
    res.json(updated);
  }),
);

const statusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  producedQty: z.coerce.number().int().nonnegative().optional(),
  scrapQty: z.coerce.number().int().nonnegative().optional(),
  notes: text,
});

ordersRouter.patch(
  '/:id/status',
  requirePermission(LIST_MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const body = statusSchema.parse(req.body);
    const id = req.params.id;
    const order = await prisma.productionOrder.findUniqueOrThrow({ where: { id } });

    if (!TRANSITIONS[order.status].includes(body.status)) {
      throw conflict(`"${order.status}" durumundan "${body.status}" durumuna gecis yapilamaz.`);
    }

    // Uretilen + fire, emir adedini asamaz.
    const uretilen = body.producedQty ?? order.producedQty;
    const fire = body.scrapQty ?? order.scrapQty;
    if (uretilen + fire > order.quantity) {
      throw badRequest(
        `Uretilen (${uretilen}) + fire (${fire}) toplami emir adedini (${order.quantity}) asamaz.`,
      );
    }

    // Emir tamamlanirken tum proses adimlari bitmis olmali.
    if (body.status === OrderStatus.TAMAMLANDI) {
      const eksik = await prisma.orderStepLog.count({
        where: {
          orderId: id,
          status: { notIn: [StepStatus.TAMAMLANDI, StepStatus.ATLANDI] },
        },
      });
      if (eksik > 0) {
        throw conflict(
          `Emir tamamlanamaz: ${eksik} proses adimi henuz bitirilmemis. ` +
            'Adimlari tamamlayin veya atlayin.',
        );
      }
    }

    // Onaylama, tamamlama ve iptal ayri bir yetkidir: bunlar "duzenleme"
    // yetkisine birakilirsa saha operatoru de emir iptal edebilir.
    if (ONAY_GEREKTIREN_DURUMLAR.has(body.status) && !req.user!.isAdmin) {
      const perm = await prisma.permission.findUnique({
        where: { userId_module: { userId: req.user!.id, module: LIST_MODULE } },
      });
      if (!perm?.canApprove) {
        throw forbidden(`"${body.status}" islemi icin onaylama yetkiniz bulunmuyor.`);
      }
    }

    const updated = await prisma.productionOrder.update({
      where: { id },
      data: {
        status: body.status,
        ...(body.status === OrderStatus.PLANLANDI
          ? { approvedById: req.user!.id, approvedAt: new Date() }
          : {}),
        ...(body.status === OrderStatus.URETIMDE && !order.startedAt
          ? { startedAt: new Date() }
          : {}),
        ...(body.status === OrderStatus.TAMAMLANDI ? { completedAt: new Date() } : {}),
        ...(body.producedQty !== undefined ? { producedQty: body.producedQty } : {}),
        ...(body.scrapQty !== undefined ? { scrapQty: body.scrapQty } : {}),
        ...(body.notes ? { notes: body.notes } : {}),
      },
      include,
    });

    await audit(req, 'STATUS_CHANGE', 'ProductionOrder', id, {
      from: order.status,
      to: body.status,
    });
    res.json(updated);
  }),
);

const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'En az bir emir secilmelidir.').max(200),
  status: z.nativeEnum(OrderStatus),
});

/**
 * Toplu durum degisikligi.
 *
 * Tek tek isleme gore farki yalnizca hiz: her emir icin ayni gecis ve yetki
 * kurallari uygulanir, uygun olmayanlar atlanip sebebiyle birlikte raporlanir.
 * Boylece 50 emirlik bir secimde tek bir uygunsuz kayit tumunu durdurmaz.
 */
ordersRouter.patch(
  '/bulk-status',
  requirePermission(LIST_MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const { ids, status } = bulkSchema.parse(req.body);

    if (ONAY_GEREKTIREN_DURUMLAR.has(status) && !req.user!.isAdmin) {
      const perm = await prisma.permission.findUnique({
        where: { userId_module: { userId: req.user!.id, module: LIST_MODULE } },
      });
      if (!perm?.canApprove) {
        throw forbidden(`"${status}" islemi icin onaylama yetkiniz bulunmuyor.`);
      }
    }

    const orders = await prisma.productionOrder.findMany({
      where: { id: { in: ids } },
      select: { id: true, orderNo: true, status: true, quantity: true },
    });

    const basarili: string[] = [];
    const atlanan: { orderNo: string; reason: string }[] = [];

    for (const order of orders) {
      if (!TRANSITIONS[order.status].includes(status)) {
        atlanan.push({
          orderNo: order.orderNo,
          reason: `"${order.status}" durumundan gecis yapilamaz`,
        });
        continue;
      }

      if (status === OrderStatus.TAMAMLANDI) {
        const eksik = await prisma.orderStepLog.count({
          where: {
            orderId: order.id,
            status: { notIn: [StepStatus.TAMAMLANDI, StepStatus.ATLANDI] },
          },
        });
        if (eksik > 0) {
          atlanan.push({ orderNo: order.orderNo, reason: `${eksik} proses adimi bitirilmemis` });
          continue;
        }
      }

      await prisma.productionOrder.update({
        where: { id: order.id },
        data: {
          status,
          ...(status === OrderStatus.PLANLANDI
            ? { approvedById: req.user!.id, approvedAt: new Date() }
            : {}),
          ...(status === OrderStatus.URETIMDE ? { startedAt: new Date() } : {}),
          ...(status === OrderStatus.TAMAMLANDI ? { completedAt: new Date() } : {}),
        },
      });
      await audit(req, 'STATUS_CHANGE', 'ProductionOrder', order.id, {
        from: order.status,
        to: status,
        bulk: true,
      });
      basarili.push(order.orderNo);
    }

    const bulunamayan = ids.length - orders.length;
    if (bulunamayan > 0) {
      atlanan.push({ orderNo: `${bulunamayan} kayit`, reason: 'bulunamadi' });
    }

    res.json({ updated: basarili.length, skipped: atlanan, orderNos: basarili });
  }),
);

const stepSchema = z.object({
  status: z.nativeEnum(StepStatus),
  okQty: z.coerce.number().int().nonnegative().optional().nullable(),
  scrapQty: z.coerce.number().int().nonnegative().optional().nullable(),
  notes: text,
});

/** Sahadaki operatorun proses adimini ilerletmesi. */
ordersRouter.patch(
  '/:id/steps/:nodeId',
  requirePermission(LIST_MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const body = stepSchema.parse(req.body);
    const { id, nodeId } = req.params;

    const current = await prisma.orderStepLog.findUniqueOrThrow({
      where: { orderId_nodeId: { orderId: id, nodeId } },
      include: { node: { select: { label: true } }, order: { select: { quantity: true, status: true } } },
    });

    if (current.order.status === OrderStatus.IPTAL) {
      throw conflict('Iptal edilmis emirde adim guncellenemez.');
    }

    // Emirlerdeki TRANSITIONS'in adim karsiligi: adim durumlari da rastgele
    // ileri geri tasinamamali (ornegin TAMAMLANDI -> BEKLIYOR).
    if (body.status !== current.status && !STEP_TRANSITIONS[current.status].includes(body.status)) {
      throw conflict(
        `"${current.node.label}" adimi "${current.status}" durumundan "${body.status}" durumuna gecemez.`,
      );
    }

    const okQty = body.okQty === undefined ? current.okQty : body.okQty;
    const scrapQty = body.scrapQty === undefined ? current.scrapQty : body.scrapQty;

    if ((okQty ?? 0) + (scrapQty ?? 0) > current.order.quantity) {
      throw badRequest(
        `Saglam (${okQty ?? 0}) + fire (${scrapQty ?? 0}) toplami emir adedini ` +
          `(${current.order.quantity}) asamaz.`,
      );
    }

    const updated = await prisma.orderStepLog.update({
      where: { orderId_nodeId: { orderId: id, nodeId } },
      data: {
        status: body.status,
        operatorId: req.user!.id,
        ...(body.status === StepStatus.BASLADI
          ? { startedAt: current.startedAt ?? new Date(), completedAt: null }
          : {}),
        ...(body.status === StepStatus.TAMAMLANDI ? { completedAt: new Date() } : {}),
        // `?? undefined` kullanildiginda acikca gonderilen null "degisiklik
        // yok" olarak yorumlaniyor, yanlis girilmis bir miktar hicbir zaman
        // temizlenemiyordu.
        okQty,
        scrapQty,
        notes: body.notes === undefined ? current.notes : (body.notes || null),
      },
      include: { node: true },
    });

    await audit(req, 'STEP_UPDATE', 'ProductionOrder', id, {
      step: updated.node.label,
      from: current.status,
      to: body.status,
      ...(okQty !== current.okQty ? { okQty: { from: current.okQty, to: okQty } } : {}),
      ...(scrapQty !== current.scrapQty
        ? { scrapQty: { from: current.scrapQty, to: scrapQty } }
        : {}),
    });
    res.json(updated);
  }),
);

ordersRouter.delete(
  '/:id',
  requirePermission(CREATE_MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    const order = await prisma.productionOrder.findUniqueOrThrow({ where: { id: req.params.id } });
    if (order.status !== OrderStatus.TASLAK && order.status !== OrderStatus.IPTAL) {
      throw conflict('Yalnizca taslak veya iptal edilmis emirler silinebilir.');
    }

    await prisma.productionOrder.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'ProductionOrder', req.params.id, { orderNo: order.orderNo });
    res.json({ message: 'Uretim emri silindi.' });
  }),
);
