import { Router } from 'express';
import { z } from 'zod';
import { ModuleKey } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler, badRequest } from '../lib/http.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const auditRouter = Router();

const MODULE = ModuleKey.DENETIM;

auditRouter.use(requireAuth);

/**
 * Denetim kayitlari salt okunurdur: yazma uclari bilerek yoktur.
 * Kayitlar lib/audit.ts uzerinden ilgili islemlerle birlikte olusur.
 */
const querySchema = z.object({
  q: z.string().trim().optional(),
  action: z.string().trim().optional(),
  entity: z.string().trim().optional(),
  userId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

auditRouter.get(
  '/',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Filtre degerleri gecersiz.', parsed.error.errors);
    }
    const { q, action, entity, userId, from, to, page, pageSize } = parsed.data;

    if (from && to && from > to) {
      throw badRequest('Baslangic tarihi bitis tarihinden sonra olamaz.');
    }

    const where: Prisma.AuditLogWhereInput = {
      ...(action ? { action } : {}),
      ...(entity ? { entity } : {}),
      ...(userId ? { userId } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              // "to" gun sonuna kadar kapsasin: 25.08 secildiginde o gunun
              // tamami dahil olmali.
              ...(to ? { lte: new Date(to.getTime() + 86_399_999) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { entityId: { contains: q, mode: 'insensitive' } },
              { entity: { contains: q, mode: 'insensitive' } },
              { action: { contains: q, mode: 'insensitive' } },
              { user: { fullName: { contains: q, mode: 'insensitive' } } },
              { user: { username: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({ total, page, pageSize, rows });
  }),
);

/** Filtre acilir kutularini doldurmak icin sistemde gecen degerler. */
auditRouter.get(
  '/filters',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (_req, res) => {
    const [actions, entities, users] = await Promise.all([
      prisma.auditLog.findMany({ distinct: ['action'], select: { action: true } }),
      prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true } }),
      prisma.user.findMany({
        where: { auditLogs: { some: {} } },
        select: { id: true, fullName: true, username: true },
        orderBy: { fullName: 'asc' },
      }),
    ]);

    res.json({
      actions: actions.map((a) => a.action).sort(),
      entities: entities.map((e) => e.entity).sort(),
      users,
    });
  }),
);
