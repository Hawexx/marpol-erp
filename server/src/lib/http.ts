import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

/** Kontrollu hata: istemciye mesaj ile birlikte doner. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new ApiError(400, msg, details);
export const unauthorized = (msg = 'Oturum gecersiz veya suresi dolmus.') => new ApiError(401, msg);
export const forbidden = (msg = 'Bu islem icin yetkiniz yok.') => new ApiError(403, msg);
export const notFound = (msg = 'Kayit bulunamadi.') => new ApiError(404, msg);
export const conflict = (msg: string) => new ApiError(409, msg);

/** async route handler'lari icin try/catch sarmalayici. */
export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}

/** Merkezi hata yakalayici. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Girilen veriler gecersiz.',
      details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
    return;
  }

  // Gecersiz filtre/alan gibi sorgu kurulum hatalari istemci kaynaklidir;
  // 500 yerine 400 donmeli.
  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error('[PRISMA DOGRULAMA]', err.message);
    res.status(400).json({ error: 'Gonderilen sorgu parametreleri gecersiz.' });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'alan';
      res.status(409).json({ error: `Bu ${target} degeri zaten kayitli.` });
      return;
    }
    if (err.code === 'P2003') {
      res.status(409).json({
        error: 'Bu kayit baska kayitlarla iliskili oldugu icin islem yapilamiyor.',
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Kayit bulunamadi.' });
      return;
    }
  }

  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }

  console.error('[HATA]', err);
  res.status(500).json({ error: 'Sunucu hatasi olustu.' });
}
