import { Router } from 'express';
import { z } from 'zod';
import { ModuleKey } from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler, conflict } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { assertNoDuplicates, assertRatioTotal, text } from '../lib/schemaHelpers.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const recipesRouter = Router();

const MODULE = ModuleKey.KIMYASAL_RECETE;

const itemSchema = z.object({
  chemicalId: z.string().uuid('Kimyasal secimi gecersiz.'),
  ratio: z.coerce.number().min(0, 'Oran negatif olamaz.').max(100, 'Oran %100 uzeri olamaz.'),
  sortOrder: z.coerce.number().int().default(0),
  notes: text,
});

const schema = z.object({
  code: z.string().trim().min(1, 'Recete kodu zorunludur.'),
  name: z.string().trim().min(1, 'Recete adi zorunludur.'),
  description: text,
  version: z.coerce.number().int().min(1).default(1),
  batchSize: z.coerce.number().positive().optional().nullable(),
  isActive: z.boolean().default(true),
  items: z.array(itemSchema).min(1, 'Recetede en az bir kimyasal olmalidir.'),
});

/**
 * Guncellemede isActive opsiyonel: gonderilmediginde .default(true)
 * devreye girip pasife alinmis kaydi sessizce yeniden aktif ediyordu.
 */
const updateSchema = schema.extend({ isActive: z.boolean().optional() });

const include = {
  items: { include: { chemical: true }, orderBy: { sortOrder: 'asc' as const } },
};

/** Recete oranlari toplami %100 olmalidir (0.01 tolerans ile). */

recipesRouter.use(requireAuth);

recipesRouter.get(
  '/',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    res.json(
      await prisma.recipe.findMany({
        where: {
          ...(req.query.active === 'true' ? { isActive: true } : {}),
          ...(q
            ? {
                OR: [
                  { code: { contains: q, mode: 'insensitive' as const } },
                  { name: { contains: q, mode: 'insensitive' as const } },
                  { description: { contains: q, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        include,
        orderBy: { code: 'asc' },
      }),
    );
  }),
);

recipesRouter.get(
  '/:id',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    res.json(await prisma.recipe.findUniqueOrThrow({ where: { id: req.params.id }, include }));
  }),
);

recipesRouter.post(
  '/',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const { items, ...recipe } = schema.parse(req.body);
    assertRatioTotal(items);
    assertNoDuplicates(items, (i) => i.chemicalId, 'Kimyasal');

    const created = await prisma.recipe.create({
      data: { ...recipe, items: { create: items } },
      include,
    });
    await audit(req, 'CREATE', 'Recipe', created.id, { code: created.code });
    res.status(201).json(created);
  }),
);

recipesRouter.put(
  '/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const { items, ...recipe } = updateSchema.parse(req.body);
    assertRatioTotal(items);
    assertNoDuplicates(items, (i) => i.chemicalId, 'Kimyasal');
    const id = req.params.id;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({ where: { recipeId: id } });
      return tx.recipe.update({
        where: { id },
        data: { ...recipe, items: { create: items } },
        include,
      });
    });

    await audit(req, 'UPDATE', 'Recipe', id, { code: updated.code });
    res.json(updated);
  }),
);

recipesRouter.delete(
  '/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    const orderUse = await prisma.productionOrder.count({ where: { recipeId: req.params.id } });
    if (orderUse > 0) {
      throw conflict(
        `Bu recete ${orderUse} uretim emrinde kullaniliyor. Silmek yerine pasife alabilirsiniz.`,
      );
    }

    await prisma.recipe.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'Recipe', req.params.id);
    res.json({ message: 'Recete silindi.' });
  }),
);
