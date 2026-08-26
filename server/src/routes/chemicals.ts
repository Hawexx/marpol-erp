import { Router } from 'express';
import { z } from 'zod';
import { ModuleKey } from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler, conflict } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { pageResponse, readPageParams } from '../lib/pagination.js';
import { text } from '../lib/schemaHelpers.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';

export const chemicalsRouter = Router();

const schema = z.object({
  code: z.string().trim().min(1, 'Kimyasal kodu zorunludur.'),
  name: z.string().trim().min(1, 'Kimyasal adi zorunludur.'),
  type: text,
  unit: z.string().trim().default('kg'),
  density: z.coerce.number().positive().optional().nullable(),
  supplier: text,
  hazardNote: text,
  notes: text,
  isActive: z.boolean().default(true),
});

chemicalsRouter.use(requireAuth);

// Kimyasallar hem Kumas hem Kimyasal Recete sekmesinden okunur.
const canRead = requireAnyPermission([ModuleKey.KUMAS, ModuleKey.KIMYASAL_RECETE], 'view');

chemicalsRouter.get(
  '/',
  canRead,
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
      prisma.chemical.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: params.skip,
        take: params.take,
      }),
      prisma.chemical.count({ where }),
    ]);

    res.json(pageResponse(rows, total, params));
  }),
);

chemicalsRouter.get(
  '/:id',
  canRead,
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.chemical.findUniqueOrThrow({
        where: { id: req.params.id },
        include: {
          fabricLinks: { include: { fabric: { select: { code: true, name: true } } } },
          recipeItems: { include: { recipe: { select: { code: true, name: true } } } },
        },
      }),
    );
  }),
);

chemicalsRouter.post(
  '/',
  requirePermission(ModuleKey.KUMAS, 'create'),
  asyncHandler(async (req, res) => {
    const data = schema.parse(req.body);
    const created = await prisma.chemical.create({ data });
    await audit(req, 'CREATE', 'Chemical', created.id, data);
    res.status(201).json(created);
  }),
);

chemicalsRouter.put(
  '/:id',
  requirePermission(ModuleKey.KUMAS, 'edit'),
  asyncHandler(async (req, res) => {
    const data = schema.partial().parse(req.body);
    const updated = await prisma.chemical.update({ where: { id: req.params.id }, data });
    await audit(req, 'UPDATE', 'Chemical', updated.id, data);
    res.json(updated);
  }),
);

chemicalsRouter.delete(
  '/:id',
  requirePermission(ModuleKey.KUMAS, 'delete'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const [recipeUse, orderUse] = await Promise.all([
      prisma.recipeItem.count({ where: { chemicalId: id } }),
      prisma.orderChemical.count({ where: { chemicalId: id } }),
    ]);

    if (recipeUse > 0 || orderUse > 0) {
      throw conflict(
        `Bu kimyasal ${recipeUse} recetede ve ${orderUse} uretim emrinde kullaniliyor. ` +
          'Silmek yerine pasife alabilirsiniz.',
      );
    }

    await prisma.chemical.delete({ where: { id } });
    await audit(req, 'DELETE', 'Chemical', id);
    res.json({ message: 'Kimyasal silindi.' });
  }),
);
