import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ModuleKey } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { asyncHandler, badRequest, conflict, forbidden } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const usersRouter = Router();

const MODULE = ModuleKey.YETKILENDIRME;

usersRouter.use(requireAuth);

const permissionSchema = z.object({
  module: z.nativeEnum(ModuleKey),
  canView: z.boolean().default(false),
  canCreate: z.boolean().default(false),
  canEdit: z.boolean().default(false),
  canDelete: z.boolean().default(false),
  canApprove: z.boolean().default(false),
});

type PermissionInput = z.infer<typeof permissionSchema>;

const PERMISSION_FIELDS = ['canView', 'canCreate', 'canEdit', 'canDelete', 'canApprove'] as const;

/**
 * isAdmin ve permissions bilerek `.optional()`: `.default()` kullanilirsa
 * alani gondermeyen bir PUT kullanicinin yetkilerini sessizce sifirlar.
 * Gonderilmeyen alan "degistirme" anlamina gelir.
 */
const userBase = {
  fullName: z.string().min(2, 'Ad soyad zorunludur.'),
  employeeNo: z.string().trim().optional().nullable(),
  department: z.string().trim().optional().nullable(),
  title: z.string().trim().optional().nullable(),
  email: z.string().email('Gecerli bir e-posta giriniz.').optional().nullable().or(z.literal('')),
  phone: z.string().trim().optional().nullable(),
  isAdmin: z.boolean().optional(),
  isActive: z.boolean().optional(),
  permissions: z.array(permissionSchema).optional(),
};

const createSchema = z.object({
  username: z.string().min(3, 'Kullanici adi en az 3 karakter olmalidir.'),
  password: z.string().min(8, 'Sifre en az 8 karakter olmalidir.'),
  ...userBase,
});

const updateSchema = z.object({
  username: z.string().min(3).optional(),
  password: z.string().min(8, 'Sifre en az 8 karakter olmalidir.').optional().or(z.literal('')),
  ...userBase,
});

const publicUser = {
  id: true,
  username: true,
  fullName: true,
  employeeNo: true,
  department: true,
  title: true,
  email: true,
  phone: true,
  isAdmin: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  permissions: true,
} as const;

/** Yetki matrisini bos alanlariyla birlikte tam liste halinde doner. */
function fullPermissionMatrix(rows: { module: ModuleKey }[]) {
  return Object.values(ModuleKey).map((module) => {
    const found = rows.find((r) => r.module === module) as Record<string, unknown> | undefined;
    return {
      module,
      canView: Boolean(found?.canView),
      canCreate: Boolean(found?.canCreate),
      canEdit: Boolean(found?.canEdit),
      canDelete: Boolean(found?.canDelete),
      canApprove: Boolean(found?.canApprove),
    };
  });
}

interface TargetUser {
  id: string;
  isAdmin: boolean;
  isActive: boolean;
  permissions: { module: ModuleKey; [key: string]: unknown }[];
}

/**
 * Iki yetki matrisini karsilastirir. Kayitli olmayan modul, tum yetkileri
 * kapali sayilir; boylece istemcinin gonderdigi tam matris ile veritabanindaki
 * seyrek satirlar dogru eslesir.
 */
function permissionsDiffer(current: TargetUser['permissions'], next: PermissionInput[]): boolean {
  return Object.values(ModuleKey).some((module) => {
    const a = current.find((p) => p.module === module);
    const b = next.find((p) => p.module === module);
    return PERMISSION_FIELDS.some((field) => Boolean(a?.[field]) !== Boolean(b?.[field]));
  });
}

/**
 * Yetki yukseltmeyi engelleyen merkezi kontrol.
 *
 * Kapatilan saldiri yollari:
 *  - YETKILENDIRME duzenleme yetkisi olan biri kendini `isAdmin` yapamaz.
 *  - Kimse kendi yetki matrisini / aktifligini degistiremez.
 *  - Yonetici olmayan biri bir yonetici hesabini duzenleyemez (aksi halde
 *    yoneticinin sifresini sifirlayip hesabi devralabilirdi).
 *  - Yonetici olmayan biri, kendisinde bulunmayan bir yetkiyi baskasina
 *    veremez (yetki cogaltma).
 */
async function assertPrivilegeChange(
  req: Request,
  target: TargetUser | null,
  data: { isAdmin?: boolean; isActive?: boolean; permissions?: PermissionInput[] },
) {
  const actor = req.user!;

  // Kendi kaydini duzenlemek serbest; degistirilemeyen sey yalnizca kendi
  // yetkileri. Bu yuzden "alan gonderildi mi" degil, "deger gercekten
  // degisiyor mu" kontrol edilir - aksi halde form her seferinde isActive
  // gonderdigi icin profil duzenleme de engellenirdi.
  if (target && target.id === actor.id) {
    const selfEscalation =
      (data.isAdmin !== undefined && data.isAdmin !== target.isAdmin) ||
      (data.isActive !== undefined && data.isActive !== target.isActive) ||
      (data.permissions !== undefined && permissionsDiffer(target.permissions, data.permissions));

    if (selfEscalation) {
      throw forbidden(
        'Kendi yetkilerinizi degistiremezsiniz. Bu islemi baska bir yonetici yapmalidir.',
      );
    }
  }

  // Form bu alani her istekte gonderdigi icin "gonderildi mi" degil,
  // "deger degisiyor mu" bakilir. Yeni kullanicida karsilastirma tabani false.
  const adminFlagChanging =
    data.isAdmin !== undefined && data.isAdmin !== (target?.isAdmin ?? false);
  if (adminFlagChanging && !actor.isAdmin) {
    throw forbidden('Yonetici yetkisini yalnizca sistem yoneticileri verebilir veya alabilir.');
  }

  if (target?.isAdmin && !actor.isAdmin) {
    throw forbidden('Yonetici hesaplarini yalnizca sistem yoneticileri duzenleyebilir.');
  }

  if (data.permissions && !actor.isAdmin) {
    const own = await prisma.permission.findMany({ where: { userId: actor.id } });
    for (const row of data.permissions) {
      const mine = own.find((p) => p.module === row.module);
      const existing = target?.permissions.find((p) => p.module === row.module);
      // Yalnizca YENI verilen yetkiler kisitlanir: hedefte zaten var olan bir
      // yetki, dokunulmadigi surece duzenlemeyi engellememeli.
      const amplified = PERMISSION_FIELDS.filter((f) => row[f] && !mine?.[f] && !existing?.[f]);
      if (amplified.length) {
        throw forbidden(
          `"${row.module}" modulunde kendinizde olmayan bir yetkiyi baskasina veremezsiniz.`,
        );
      }
    }
  }
}

/** Sistemde yonetici kalmamasini engeller. */
async function assertNotLastAdmin(targetId: string, willBeAdmin: boolean, willBeActive: boolean) {
  if (willBeAdmin && willBeActive) return;

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target?.isAdmin || !target.isActive) return;

  const others = await prisma.user.count({
    where: { isAdmin: true, isActive: true, id: { not: targetId } },
  });
  if (others === 0) {
    throw conflict('Sistemdeki son yonetici hesabi pasife alinamaz veya yetkisi kaldirilamaz.');
  }
}

function permissionRows(rows: PermissionInput[]) {
  return rows.map((p) => ({
    module: p.module,
    canView: p.canView,
    canCreate: p.canCreate,
    canEdit: p.canEdit,
    canDelete: p.canDelete,
    canApprove: p.canApprove,
  }));
}

usersRouter.get(
  '/',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const users = await prisma.user.findMany({
      where: q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { username: { contains: q, mode: 'insensitive' } },
              { employeeNo: { contains: q, mode: 'insensitive' } },
              { department: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: publicUser,
      orderBy: { fullName: 'asc' },
    });

    res.json(users.map((u) => ({ ...u, permissions: fullPermissionMatrix(u.permissions) })));
  }),
);

usersRouter.get(
  '/modules',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (_req, res) => {
    res.json(Object.values(ModuleKey));
  }),
);

usersRouter.get(
  '/:id',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.params.id },
      select: publicUser,
    });
    res.json({ ...user, permissions: fullPermissionMatrix(user.permissions) });
  }),
);

usersRouter.post(
  '/',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    await assertPrivilegeChange(req, null, data);

    // Hash islemi transaction disinda: bcrypt CPU-yogun oldugundan islem
    // icinde calisirsa satir kilitlerini gereksiz yere uzun sure tutar.
    const passwordHash = await bcrypt.hash(data.password, env.bcryptRounds);

    const user = await prisma.user.create({
      data: {
        username: data.username.trim().toLowerCase(),
        passwordHash,
        fullName: data.fullName,
        employeeNo: data.employeeNo || null,
        department: data.department || null,
        title: data.title || null,
        email: data.email || null,
        phone: data.phone || null,
        isAdmin: data.isAdmin ?? false,
        isActive: data.isActive ?? true,
        permissions: { create: permissionRows(data.permissions ?? []) },
      },
      select: publicUser,
    });

    await audit(req, 'CREATE', 'User', user.id, {
      username: user.username,
      isAdmin: user.isAdmin,
      permissions: user.permissions.length,
    });
    res.status(201).json({ ...user, permissions: fullPermissionMatrix(user.permissions) });
  }),
);

usersRouter.put(
  '/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const id = req.params.id;

    const current = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, isAdmin: true, isActive: true, permissions: true },
    });

    await assertPrivilegeChange(req, current, data);
    await assertNotLastAdmin(id, data.isAdmin ?? current.isAdmin, data.isActive ?? current.isActive);

    if (id === req.user!.id && data.password) {
      throw badRequest('Kendi sifrenizi "Sifre Degistir" ekranindan guncelleyin.');
    }

    const passwordHash = data.password
      ? await bcrypt.hash(data.password, env.bcryptRounds)
      : undefined;

    const user = await prisma.$transaction(async (tx) => {
      // permissions gonderilmediyse mevcut matrise dokunulmaz.
      if (data.permissions) {
        await tx.permission.deleteMany({ where: { userId: id } });
      }

      return tx.user.update({
        where: { id },
        data: {
          ...(data.username ? { username: data.username.trim().toLowerCase() } : {}),
          // Sifre sifirlandiginda hedefin acik oturumlari da dusurulur.
          ...(passwordHash ? { passwordHash, tokenVersion: { increment: 1 } } : {}),
          fullName: data.fullName,
          employeeNo: data.employeeNo || null,
          department: data.department || null,
          title: data.title || null,
          email: data.email || null,
          phone: data.phone || null,
          ...(data.isAdmin !== undefined ? { isAdmin: data.isAdmin } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.permissions ? { permissions: { create: permissionRows(data.permissions) } } : {}),
        },
        select: publicUser,
      });
    });

    // Yetki degisiklikleri sistemin en kritik mutasyonu: oncesi/sonrasi ile
    // birlikte kaydedilir.
    await audit(req, 'UPDATE', 'User', id, {
      username: user.username,
      passwordReset: Boolean(passwordHash),
      ...(data.isAdmin !== undefined && data.isAdmin !== current.isAdmin
        ? { isAdmin: { from: current.isAdmin, to: data.isAdmin } }
        : {}),
      ...(data.permissions
        ? {
            permissions: {
              from: current.permissions.map((p) => p.module).sort(),
              to: user.permissions.map((p) => p.module).sort(),
            },
          }
        : {}),
    });

    res.json({ ...user, permissions: fullPermissionMatrix(user.permissions) });
  }),
);

usersRouter.delete(
  '/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.id) throw badRequest('Kendi hesabinizi silemezsiniz.');

    const target = await prisma.user.findUniqueOrThrow({
      where: { id: req.params.id },
      select: { id: true, isAdmin: true },
    });
    if (target.isAdmin && !req.user!.isAdmin) {
      throw forbidden('Yonetici hesaplarini yalnizca sistem yoneticileri silebilir.');
    }
    await assertNotLastAdmin(req.params.id, false, false);

    /*
     * Uretim gecmisi olan kullanicilar silinmez, pasife alinir.
     *
     * Onceden yalnizca createdById sayiliyordu; oysa approvedOrders da
     * Restrict oldugu icin silme yine de P2003 ile basarisiz olup yaniltici
     * bir 409 donduruyordu. (AuditLog ve OrderStepLog artik SetNull.)
     */
    const [orderCount, approvedCount] = await Promise.all([
      prisma.productionOrder.count({ where: { createdById: req.params.id } }),
      prisma.productionOrder.count({ where: { approvedById: req.params.id } }),
    ]);

    if (orderCount + approvedCount > 0) {
      await prisma.user.update({
        where: { id: req.params.id },
        data: { isActive: false, tokenVersion: { increment: 1 } },
      });
      await audit(req, 'DEACTIVATE', 'User', req.params.id);
      res.json({
        message: 'Kullanicinin uretim emri kayitlari oldugu icin hesap pasife alindi.',
      });
      return;
    }

    await prisma.user.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'User', req.params.id);
    res.json({ message: 'Kullanici silindi.' });
  }),
);
