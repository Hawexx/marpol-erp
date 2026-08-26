import { Router } from 'express';
import { z } from 'zod';
import { ModuleKey } from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler, conflict } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { pageResponse, readPageParams } from '../lib/pagination.js';
import { assertNoDuplicates, assertRatioTotal, num, text } from '../lib/schemaHelpers.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const fabricsRouter = Router();

const MODULE = ModuleKey.KUMAS;

/** Kumasa emdirilecek kimyasal + varsayilan oran satiri. */
const chemicalLinkSchema = z.object({
  chemicalId: z.string().uuid('Kimyasal secimi gecersiz.'),
  ratio: z.coerce.number().min(0).max(100).default(0),
  notes: text,
});

const schema = z.object({
  code: z.string().trim().min(1, 'Kumas kodu zorunludur.'),
  name: z.string().trim().min(1, 'Kumas adi zorunludur.'),
  type: text,
  composition: text,
  gramaj: num,
  width: num,
  thickness: num,
  color: text,
  supplier: text,
  notes: text,
  isActive: z.boolean().default(true),
  chemicals: z.array(chemicalLinkSchema).default([]),
});

/**
 * Guncellemede isActive opsiyonel: gonderilmediginde .default(true)
 * devreye girip pasife alinmis kaydi sessizce yeniden aktif ediyordu.
 */
const updateSchema = schema.extend({ isActive: z.boolean().optional() });

const include = {
  chemicals: {
    include: { chemical: true },
    orderBy: { ratio: 'desc' as const },
  },
};

fabricsRouter.use(requireAuth);

fabricsRouter.get(
  '/',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const where = {
          ...(req.query.active === 'true' ? { isActive: true } : {}),
          ...(q
            ? {
                OR: [
                  { code: { contains: q, mode: 'insensitive' as const } },
                  { name: { contains: q, mode: 'insensitive' as const } },
                  { type: { contains: q, mode: 'insensitive' as const } },
                  { supplier: { contains: q, mode: 'insensitive' as const } },
                ],
              }
            : {}),
    };

    const params = readPageParams(req);
    const [rows, total] = await Promise.all([
      prisma.fabric.findMany({
        where,
        include,
        orderBy: { code: 'asc' },
        skip: params.skip,
        take: params.take,
      }),
      prisma.fabric.count({ where }),
    ]);

    res.json(pageResponse(rows, total, params));
  }),
);

fabricsRouter.get(
  '/:id',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.fabric.findUniqueOrThrow({ where: { id: req.params.id }, include }),
    );
  }),
);

fabricsRouter.post(
  '/',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const { chemicals, ...fabric } = schema.parse(req.body);
    /*
     * Ayni %100 kurali recete ve emirde bastan beri zorunluydu; kumasta ise
     * hic kontrol edilmiyordu. Bos birakmak serbest, ama satir girildiyse
     * toplam tutmali.
     */
    assertRatioTotal(chemicals, 'Kumas kimyasal oranlarinin');
    assertNoDuplicates(chemicals, (c) => c.chemicalId, 'Kimyasal');
    const created = await prisma.fabric.create({
      data: { ...fabric, chemicals: { create: chemicals } },
      include,
    });
    await audit(req, 'CREATE', 'Fabric', created.id, { code: created.code });
    res.status(201).json(created);
  }),
);

fabricsRouter.put(
  '/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const { chemicals, ...fabric } = updateSchema.parse(req.body);
    /*
     * Ayni %100 kurali recete ve emirde bastan beri zorunluydu; kumasta ise
     * hic kontrol edilmiyordu. Bos birakmak serbest, ama satir girildiyse
     * toplam tutmali.
     */
    assertRatioTotal(chemicals, 'Kumas kimyasal oranlarinin');
    assertNoDuplicates(chemicals, (c) => c.chemicalId, 'Kimyasal');
    const id = req.params.id;

    // Kimyasal listesi tamamen yeniden yazilir (silinen satirlar da temizlenir).
    const updated = await prisma.$transaction(async (tx) => {
      await tx.fabricChemical.deleteMany({ where: { fabricId: id } });
      return tx.fabric.update({
        where: { id },
        data: { ...fabric, chemicals: { create: chemicals } },
        include,
      });
    });

    await audit(req, 'UPDATE', 'Fabric', id, { code: updated.code });
    res.json(updated);
  }),
);

fabricsRouter.delete(
  '/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    const orderUse = await prisma.productionOrder.count({ where: { fabricId: req.params.id } });
    if (orderUse > 0) {
      throw conflict(
        `Bu kumas ${orderUse} uretim emrinde kullaniliyor. Silmek yerine pasife alabilirsiniz.`,
      );
    }

    await prisma.fabric.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'Fabric', req.params.id);
    res.json({ message: 'Kumas silindi.' });
  }),
);
