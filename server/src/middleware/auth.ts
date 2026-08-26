import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { ModuleKey, Permission } from '@prisma/client';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { forbidden, unauthorized } from '../lib/http.js';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  isAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface JwtPayload {
  sub: string;
  username: string;
  /** Oturum surumu; User.tokenVersion ile eslesmezse token gecersizdir. */
  tv: number;
}

export function signToken(user: {
  id: string;
  username: string;
  tokenVersion: number;
}): string {
  return jwt.sign(
    { sub: user.id, username: user.username, tv: user.tokenVersion } satisfies JwtPayload,
    env.jwtSecret,
    {
      expiresIn: env.jwtExpiresIn,
      // Algoritma acikca sabitlenir: allowlist olmadan "alg" degistirilerek
      // dogrulama atlatilabilir.
      algorithm: 'HS256',
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
    } as jwt.SignOptions,
  );
}

/** Authorization: Bearer <token> basligini dogrular ve req.user'i doldurur. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized('Oturum acmaniz gerekiyor.');

    const payload = jwt.verify(header.slice(7), env.jwtSecret, {
      algorithms: ['HS256'],
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
    }) as JwtPayload;

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user) throw unauthorized('Kullanici bulunamadi.');
    if (!user.isActive) throw forbidden('Kullanici hesabi pasif durumda.');

    // Sifre degisimi / oturum sonlandirma sonrasi eski tokenlar reddedilir.
    if ((payload.tv ?? -1) !== user.tokenVersion) {
      throw unauthorized('Oturumunuz sonlandirildi. Lutfen tekrar giris yapin.');
    }

    req.user = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      isAdmin: user.isAdmin,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
      next(unauthorized());
      return;
    }
    next(err);
  }
}

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve';

/** Yetki adini Permission tablosundaki sutuna esler. */
const ACTION_FIELD = {
  view: 'canView',
  create: 'canCreate',
  edit: 'canEdit',
  delete: 'canDelete',
  approve: 'canApprove',
} as const satisfies Record<PermissionAction, keyof Permission>;

/**
 * Belirtilen sekme (modul) icin istenen yetkiyi kontrol eder.
 * Admin kullanicilar tum yetkilere sahiptir.
 */
export function requirePermission(module: ModuleKey, action: PermissionAction = 'view') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw unauthorized();
      if (req.user.isAdmin) return next();

      const permission = await prisma.permission.findUnique({
        where: { userId_module: { userId: req.user.id, module } },
      });

      const field = ACTION_FIELD[action];
      if (!permission || permission[field] !== true) {
        throw forbidden(`"${module}" modulu icin "${action}" yetkiniz bulunmuyor.`);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Sadece yoneticiler. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (!req.user.isAdmin) return next(forbidden('Bu islem yalnizca yoneticiler icindir.'));
  next();
}

/**
 * Birden fazla modulden herhangi birinde yetki yeterlidir.
 * Ornek: kimyasal listesi hem Kumas hem Kimyasal Recete sekmesinden okunur.
 */
export function requireAnyPermission(modules: ModuleKey[], action: PermissionAction = 'view') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw unauthorized();
      if (req.user.isAdmin) return next();

      const rows = await prisma.permission.findMany({
        where: { userId: req.user.id, module: { in: modules } },
      });

      const field = ACTION_FIELD[action];
      const allowed = rows.some((row) => row[field] === true);
      if (!allowed) throw forbidden('Bu islem icin yetkiniz bulunmuyor.');
      next();
    } catch (err) {
      next(err);
    }
  };
}
