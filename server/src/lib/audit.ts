import type { Request } from 'express';
import { prisma } from '../db.js';

/**
 * Denetim kaydi olusturur. Loglama hatasi ana islemi bozmamali,
 * bu yuzden hata yutulur.
 */
export async function audit(
  req: Request,
  action: string,
  entity: string,
  entityId?: string | null,
  detail?: unknown,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        detail: detail === undefined ? undefined : (detail as object),
        ip: req.ip ?? null,
      },
    });
  } catch (err) {
    console.error('[AUDIT] kayit yazilamadi:', err);
  }
}
