import { Router } from 'express';
import { z } from 'zod';
import { ModuleKey, StockReason } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler, badRequest, conflict } from '../lib/http.js';
import { pageResponse, readPageParams } from '../lib/pagination.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const stockRouter = Router();

const MODULE = ModuleKey.STOK;

stockRouter.use(requireAuth);

/** Girisi artiran, cikisi azaltan sebepler. */
const ARTIRAN = new Set<StockReason>([StockReason.GIRIS, StockReason.IADE]);

const movementSchema = z.object({
  chemicalId: z.string().uuid('Kimyasal secimi gecersiz.'),
  reason: z.nativeEnum(StockReason),
  /** Her zaman POZITIF girilir; yon `reason` alanindan belirlenir. */
  quantity: z.coerce.number().positive('Miktar 0 dan buyuk olmalidir.'),
  note: z.string().trim().max(500).optional().nullable(),
  orderId: z.string().uuid().optional().nullable(),
});

const thresholdSchema = z.object({
  minStockQty: z.coerce.number().nonnegative(),
});

/** Stok durumu: eldeki miktar, esik ve uyari. */
stockRouter.get(
  '/',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const onlyLow = req.query.low === 'true';
    const params = readPageParams(req);

    const where: Prisma.ChemicalWhereInput = {
      isActive: true,
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
              { supplier: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.chemical.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          unit: true,
          supplier: true,
          stockQty: true,
          minStockQty: true,
        },
        orderBy: { code: 'asc' },
        skip: params.skip,
        take: params.take,
      }),
      prisma.chemical.count({ where }),
    ]);

    /*
     * Kritik filtresi veritabaninda yapilamaz: Prisma iki sutunu birbiriyle
     * karsilastiramiyor (stockQty <= minStockQty). Sayfa boyutu sinirli
     * oldugundan bellekte suzmek guvenli.
     */
    const shaped = rows.map((c) => ({
      ...c,
      isLow: c.minStockQty > 0 && c.stockQty <= c.minStockQty,
    }));
    const filtered = onlyLow ? shaped.filter((c) => c.isLow) : shaped;

    res.json(pageResponse(filtered, onlyLow ? filtered.length : total, params));
  }),
);

/** Kritik seviyedeki kalemler - pano uyarisi icin. */
stockRouter.get(
  '/alerts',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (_req, res) => {
    const hepsi = await prisma.chemical.findMany({
      where: { isActive: true, minStockQty: { gt: 0 } },
      select: { id: true, code: true, name: true, unit: true, stockQty: true, minStockQty: true },
      orderBy: { code: 'asc' },
    });
    res.json({ rows: hepsi.filter((c) => c.stockQty <= c.minStockQty) });
  }),
);

/** Bir kimyasalin hareket gecmisi. */
stockRouter.get(
  '/movements',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const chemicalId = String(req.query.chemicalId ?? '').trim();
    const params = readPageParams(req);

    const where: Prisma.StockMovementWhereInput = chemicalId ? { chemicalId } : {};

    const [rows, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          chemical: { select: { code: true, name: true, unit: true } },
          user: { select: { fullName: true } },
          order: { select: { orderNo: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      prisma.stockMovement.count({ where }),
    ]);

    res.json(pageResponse(rows, total, params));
  }),
);

/**
 * Stok hareketi kaydeder ve eldeki miktari gunceller.
 *
 * Okuma ve yazma tek islemde yapilir: es zamanli iki hareket ayni bakiyeyi
 * okuyup birbirini ezmemeli.
 */
stockRouter.post(
  '/movements',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = movementSchema.parse(req.body);
    const yon = ARTIRAN.has(data.reason) ? 1 : -1;
    const delta = data.quantity * yon;

    const hareket = await prisma.$transaction(async (tx) => {
      const chemical = await tx.chemical.findUniqueOrThrow({
        where: { id: data.chemicalId },
        select: { id: true, code: true, stockQty: true, unit: true },
      });

      const yeniBakiye = chemical.stockQty + delta;
      if (yeniBakiye < 0) {
        throw conflict(
          `${chemical.code} icin yeterli stok yok. Eldeki: ${chemical.stockQty} ${chemical.unit}, ` +
            `cikis: ${data.quantity} ${chemical.unit}.`,
        );
      }

      await tx.chemical.update({
        where: { id: chemical.id },
        data: { stockQty: yeniBakiye },
      });

      return tx.stockMovement.create({
        data: {
          chemicalId: chemical.id,
          reason: data.reason,
          delta,
          balance: yeniBakiye,
          orderId: data.orderId || null,
          note: data.note || null,
          userId: req.user!.id,
        },
        include: { chemical: { select: { code: true, name: true, unit: true } } },
      });
    });

    await audit(req, 'STOCK_MOVE', 'Chemical', data.chemicalId, {
      code: hareket.chemical.code,
      reason: data.reason,
      delta,
      balance: hareket.balance,
    });

    res.status(201).json(hareket);
  }),
);

/** Sayim duzeltmesi: eldeki miktari dogrudan belirtilen degere cekar. */
stockRouter.post(
  '/count',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        chemicalId: z.string().uuid(),
        countedQty: z.coerce.number().nonnegative(),
        note: z.string().trim().max(500).optional().nullable(),
      })
      .parse(req.body);

    const hareket = await prisma.$transaction(async (tx) => {
      const chemical = await tx.chemical.findUniqueOrThrow({
        where: { id: data.chemicalId },
        select: { id: true, code: true, stockQty: true },
      });

      const fark = data.countedQty - chemical.stockQty;
      if (fark === 0) throw badRequest('Sayim sonucu mevcut miktarla ayni, kayit olusturulmadi.');

      await tx.chemical.update({
        where: { id: chemical.id },
        data: { stockQty: data.countedQty },
      });

      return tx.stockMovement.create({
        data: {
          chemicalId: chemical.id,
          reason: StockReason.SAYIM,
          delta: fark,
          balance: data.countedQty,
          note: data.note || null,
          userId: req.user!.id,
        },
        include: { chemical: { select: { code: true, name: true, unit: true } } },
      });
    });

    await audit(req, 'STOCK_COUNT', 'Chemical', data.chemicalId, {
      code: hareket.chemical.code,
      delta: hareket.delta,
      balance: hareket.balance,
    });

    res.status(201).json(hareket);
  }),
);

/** Kritik stok esigi. */
stockRouter.put(
  '/:chemicalId/threshold',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const { minStockQty } = thresholdSchema.parse(req.body);
    const updated = await prisma.chemical.update({
      where: { id: req.params.chemicalId },
      data: { minStockQty },
      select: { id: true, code: true, stockQty: true, minStockQty: true, unit: true },
    });

    await audit(req, 'UPDATE', 'Chemical', updated.id, {
      code: updated.code,
      minStockQty,
    });
    res.json(updated);
  }),
);
