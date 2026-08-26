import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { asyncHandler, badRequest, unauthorized } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { requireAuth, signToken } from '../middleware/auth.js';

export const authRouter = Router();

/** Hesap kilidi: ard arda bu kadar hatali denemeden sonra devreye girer. */
const MAX_HATALI_DENEME = 5;
const KILIT_DAKIKA = 15;

/**
 * Kullanici bulunamadiginda da bcrypt calistirmak icin sabit hash.
 * Aksi halde "kullanici yok" dalinda istek belirgin sekilde daha hizli
 * doner ve kullanici adi enumerasyonu icin zamanlama kanali olusur.
 */
const KUKLA_HASH = bcrypt.hashSync('marpol-kukla-parola', env.bcryptRounds);

const loginSchema = z.object({
  username: z.string().min(1, 'Kullanici adi zorunludur.'),
  password: z.string().min(1, 'Sifre zorunludur.'),
});

/** Kullanicinin yetki matrisini istemcinin kullanacagi sade yapiya cevirir. */
async function buildSession(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { permissions: true },
  });

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    employeeNo: user.employeeNo,
    department: user.department,
    title: user.title,
    isAdmin: user.isAdmin,
    permissions: user.permissions.map((p) => ({
      module: p.module,
      canView: p.canView,
      canCreate: p.canCreate,
      canEdit: p.canEdit,
      canDelete: p.canDelete,
      canApprove: p.canApprove,
    })),
  };
}

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    // Kayit sirasinda kullanici adlari kucuk harfe cevriliyor; giriste de
    // ayni normalizasyon uygulanmazsa "Ahmet" olarak eklenen kullanici
    // hicbir zaman giris yapamaz.
    const normalized = username.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { username: normalized } });

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      await audit(req, 'LOGIN_LOCKED', 'User', user.id, { username: normalized });
      throw unauthorized(
        `Cok fazla hatali deneme yapildi. Hesap ${KILIT_DAKIKA} dakika boyunca kilitli.`,
      );
    }

    const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? KUKLA_HASH);

    if (!user || !passwordOk) {
      // Basarisiz denemeler denetim kaydina yazilmazsa kaba kuvvet saldirisi
      // hicbir iz birakmaz.
      if (user) {
        const failed = user.failedLoginCount + 1;
        const locked = failed >= MAX_HATALI_DENEME;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: locked ? 0 : failed,
            lockedUntil: locked ? new Date(Date.now() + KILIT_DAKIKA * 60_000) : null,
          },
        });
      }
      await audit(req, 'LOGIN_FAILED', 'User', user?.id ?? null, { username: normalized });
      throw unauthorized('Kullanici adi veya sifre hatali.');
    }

    // Pasif hesap icin de ayni genel mesaj: dogru sifrenin tutturuldugu
    // bilgisini sizdirmamak icin.
    if (!user.isActive) {
      await audit(req, 'LOGIN_INACTIVE', 'User', user.id, { username: normalized });
      throw unauthorized('Kullanici adi veya sifre hatali.');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });

    const token = signToken(user);
    req.user = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      isAdmin: user.isAdmin,
    };
    await audit(req, 'LOGIN', 'User', user.id);

    res.json({ token, user: await buildSession(user.id) });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: await buildSession(req.user!.id) });
  }),
);

/**
 * Oturumu sunucu tarafinda da sonlandirir: tokenVersion artirildigi icin
 * kopyalanmis tokenlar da aninda gecersiz olur.
 */
authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { tokenVersion: { increment: 1 } },
    });
    await audit(req, 'LOGOUT', 'User', req.user!.id);
    res.json({ message: 'Oturum kapatildi.' });
  }),
);

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mevcut sifre zorunludur.'),
    newPassword: z.string().min(8, 'Yeni sifre en az 8 karakter olmalidir.'),
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    path: ['newPassword'],
    message: 'Yeni sifre mevcut sifreden farkli olmalidir.',
  });

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = passwordSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });

    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw badRequest('Mevcut sifre hatali.');
    }

    const passwordHash = await bcrypt.hash(newPassword, env.bcryptRounds);
    await prisma.user.update({
      where: { id: user.id },
      // tokenVersion artirilmazsa calinmis bir token sifre degisiminden
      // sonra da gecerli kalir.
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await audit(req, 'CHANGE_PASSWORD', 'User', user.id);

    res.json({
      message: 'Sifreniz guncellendi. Guvenlik icin tekrar giris yapmaniz gerekiyor.',
      reauthRequired: true,
    });
  }),
);
