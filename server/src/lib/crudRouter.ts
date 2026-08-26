import { Router } from 'express';
import type { ZodSchema } from 'zod';
import type { ModuleKey } from '@prisma/client';
import { asyncHandler } from './http.js';
import { pageResponse, readPageParams } from './pagination.js';
import { audit } from './audit.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

/**
 * Prisma delegate'inin bu fabrikada kullanilan alt kumesi.
 * Prisma'nin uretilmis jenerik imzalari model bazli oldugu icin burada
 * gevsek tiplenir; dogrulama zod semalari ile yapilir.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
interface Delegate {
  findMany: (args?: any) => Promise<any[]>;
  findUniqueOrThrow: (args: any) => Promise<any>;
  create: (args: any) => Promise<{ id: string }>;
  update: (args: any) => Promise<{ id: string }>;
  delete: (args: any) => Promise<any>;
  count: (args?: any) => Promise<number>;
}

interface CrudOptions {
  /** Yetki kontrolu icin sekme anahtari */
  module: ModuleKey;
  /** Denetim kayitlarinda gorunecek varlik adi */
  entity: string;
  delegate: Delegate;
  createSchema: ZodSchema;
  updateSchema: ZodSchema;
  /** Serbest metin aramasinin uygulanacagi alanlar */
  searchFields: string[];
  orderBy?: Record<string, 'asc' | 'desc'>;
  include?: Record<string, unknown>;
  /**
   * Silme oncesi butunluk kontrolu. Iliskili kayit varsa `conflict` firlatarak
   * islemi durdurmalidir.
   *
   * Bu kanca olmadan, opsiyonel iliskilerde Prisma varsayilan olarak
   * `SetNull` uyguluyor ve kayit sessizce silinip bagli alanlar
   * bosaltiliyordu (ornegin silinen bir makine, proses semalarindaki
   * makine baglantilarini uyarisiz kaldiriyordu).
   */
  beforeDelete?: (id: string) => Promise<void>;
}

/**
 * Tanim karti (master data) sekmeleri icin standart CRUD ucu.
 * Silme islemi iliskili kayit varsa engellenir, bunun yerine pasife alma onerilir.
 */
export function crudRouter(options: CrudOptions): Router {
  const { module, entity, delegate, createSchema, updateSchema, searchFields } = options;
  const router = Router();

  router.use(requireAuth);

  router.get(
    '/',
    requirePermission(module, 'view'),
    asyncHandler(async (req, res) => {
      const q = String(req.query.q ?? '').trim();
      const onlyActive = req.query.active === 'true';

      const where: Record<string, unknown> = {};
      if (onlyActive) where.isActive = true;
      if (q) {
        where.OR = searchFields.map((field) => ({
          [field]: { contains: q, mode: 'insensitive' },
        }));
      }

      const params = readPageParams(req);
      const [rows, total] = await Promise.all([
        delegate.findMany({
          where,
          include: options.include,
          orderBy: options.orderBy ?? { code: 'asc' },
          skip: params.skip,
          take: params.take,
        }),
        delegate.count({ where }),
      ]);

      res.json(pageResponse(rows, total, params));
    }),
  );

  router.get(
    '/:id',
    requirePermission(module, 'view'),
    asyncHandler(async (req, res) => {
      res.json(
        await delegate.findUniqueOrThrow({
          where: { id: req.params.id },
          include: options.include,
        }),
      );
    }),
  );

  router.post(
    '/',
    requirePermission(module, 'create'),
    asyncHandler(async (req, res) => {
      const data = createSchema.parse(req.body);
      const created = await delegate.create({ data, include: options.include });
      await audit(req, 'CREATE', entity, created.id, data);
      res.status(201).json(created);
    }),
  );

  router.put(
    '/:id',
    requirePermission(module, 'edit'),
    asyncHandler(async (req, res) => {
      const data = updateSchema.parse(req.body);
      const updated = await delegate.update({
        where: { id: req.params.id },
        data,
        include: options.include,
      });
      await audit(req, 'UPDATE', entity, updated.id, data);
      res.json(updated);
    }),
  );

  router.delete(
    '/:id',
    requirePermission(module, 'delete'),
    asyncHandler(async (req, res) => {
      await options.beforeDelete?.(req.params.id);
      await delegate.delete({ where: { id: req.params.id } });
      await audit(req, 'DELETE', entity, req.params.id);
      res.json({ message: 'Kayit silindi.' });
    }),
  );

  return router;
}
