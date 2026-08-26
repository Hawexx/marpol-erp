import { Router } from 'express';
import { ModuleKey, OrderStatus, StepStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/http.js';
import { requireAnyPermission, requireAuth } from '../middleware/auth.js';

export const planningRouter = Router();

planningRouter.use(requireAuth);

// Planlama, uretim emirleri uzerinde bir gorunumdur; ayri bir yetki modulu
// tanimlamak yerine emirleri gorebilenler bu ekrani da gorur.
const canRead = requireAnyPermission(
  [ModuleKey.URETIM_EMIRLERI, ModuleKey.URETIM_EMRI_OLUSTUR],
  'view',
);

/** Uretimi devam eden (kapanmamis) emir durumlari. */
const ACIK_DURUMLAR: OrderStatus[] = [
  OrderStatus.TASLAK,
  OrderStatus.ONAY_BEKLIYOR,
  OrderStatus.PLANLANDI,
  OrderStatus.URETIMDE,
  OrderStatus.BEKLEMEDE,
];

const GUN_MS = 86_400_000;

/**
 * Bir adimin tahmini suresi (dakika).
 *
 * Model: adimin sabit islem suresi (durationMin) + adedin makine
 * kapasitesine (adet/saat) bolunmesiyle bulunan akis suresi. Makineye bagli
 * olmayan ya da kapasitesi girilmemis adimlarda yalnizca sabit sure sayilir.
 */
function adimSuresi(
  durationMin: number | null,
  capacity: number | null | undefined,
  quantity: number,
): number {
  const sabit = durationMin ?? 0;
  const akis = capacity && capacity > 0 ? (quantity / capacity) * 60 : 0;
  return sabit + akis;
}

/** Gunun basina normalize eder; gun farki hesaplarinda saat kaymasini onler. */
function gunBasi(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

planningRouter.get(
  '/dashboard',
  canRead,
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const haftaSonu = new Date(now.getTime() + 7 * GUN_MS);
    const otuzGunOnce = new Date(now.getTime() - 30 * GUN_MS);

    const [byStatus, byPriority, overdue, dueThisWeek, totals, tamamlananlar, acikEmirler] =
      await Promise.all([
        prisma.productionOrder.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.productionOrder.groupBy({
          by: ['priority'],
          _count: { _all: true },
          where: { status: { in: ACIK_DURUMLAR } },
        }),
        prisma.productionOrder.count({
          where: { deadline: { lt: now }, status: { in: ACIK_DURUMLAR } },
        }),
        prisma.productionOrder.count({
          where: {
            deadline: { gte: now, lte: haftaSonu },
            status: { in: ACIK_DURUMLAR },
          },
        }),
        prisma.productionOrder.aggregate({
          _sum: { producedQty: true, scrapQty: true, quantity: true },
          where: { status: OrderStatus.TAMAMLANDI },
        }),
        // Son 30 gunun gunluk uretimi.
        prisma.productionOrder.findMany({
          where: { status: OrderStatus.TAMAMLANDI, completedAt: { gte: otuzGunOnce } },
          select: { completedAt: true, producedQty: true, scrapQty: true },
        }),
        prisma.productionOrder.count({ where: { status: { in: ACIK_DURUMLAR } } }),
      ]);

    // Gunluk uretim serisi (tarih -> uretilen/fire).
    const gunluk = new Map<string, { produced: number; scrap: number; orders: number }>();
    for (const o of tamamlananlar) {
      if (!o.completedAt) continue;
      const key = o.completedAt.toISOString().slice(0, 10);
      const row = gunluk.get(key) ?? { produced: 0, scrap: 0, orders: 0 };
      row.produced += o.producedQty;
      row.scrap += o.scrapQty;
      row.orders += 1;
      gunluk.set(key, row);
    }

    const uretilen = totals._sum.producedQty ?? 0;
    const fire = totals._sum.scrapQty ?? 0;

    res.json({
      openOrders: acikEmirler,
      overdue,
      dueThisWeek,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
      byPriority: Object.fromEntries(byPriority.map((r) => [r.priority, r._count._all])),
      production: {
        produced: uretilen,
        scrap: fire,
        planned: totals._sum.quantity ?? 0,
        // Fire orani: kalite takibinin tek sayilik ozeti.
        scrapRate: uretilen + fire > 0 ? (fire / (uretilen + fire)) * 100 : 0,
      },
      daily: [...gunluk.entries()]
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    });
  }),
);

planningRouter.get(
  '/machine-load',
  canRead,
  asyncHandler(async (_req, res) => {
    const makineler = await prisma.machine.findMany({
      where: { isActive: true },
      orderBy: [{ line: 'asc' }, { code: 'asc' }],
      include: { nodes: { select: { id: true, durationMin: true, workflowId: true } } },
    });

    // Bitmemis adimlar: makine yuku bunlardan hesaplanir.
    const bekleyenAdimlar = await prisma.orderStepLog.findMany({
      where: {
        status: { in: [StepStatus.BEKLIYOR, StepStatus.BASLADI] },
        order: { status: { in: ACIK_DURUMLAR } },
      },
      select: {
        nodeId: true,
        status: true,
        order: { select: { id: true, orderNo: true, quantity: true, deadline: true } },
      },
    });

    const adimlarByNode = new Map<string, typeof bekleyenAdimlar>();
    for (const adim of bekleyenAdimlar) {
      const list = adimlarByNode.get(adim.nodeId) ?? [];
      list.push(adim);
      adimlarByNode.set(adim.nodeId, list);
    }

    const rows = makineler.map((makine) => {
      let toplamDakika = 0;
      let bekleyenAdet = 0;
      const emirler = new Set<string>();
      let devamEden = 0;

      for (const node of makine.nodes) {
        for (const adim of adimlarByNode.get(node.id) ?? []) {
          toplamDakika += adimSuresi(node.durationMin, makine.capacity, adim.order.quantity);
          bekleyenAdet += adim.order.quantity;
          emirler.add(adim.order.id);
          if (adim.status === StepStatus.BASLADI) devamEden += 1;
        }
      }

      return {
        id: makine.id,
        code: makine.code,
        name: makine.name,
        line: makine.line,
        location: makine.location,
        capacity: makine.capacity,
        nodeCount: makine.nodes.length,
        orderCount: emirler.size,
        inProgressSteps: devamEden,
        queuedUnits: bekleyenAdet,
        queuedMinutes: Math.round(toplamDakika),
        // Tek vardiya 8 saat kabul edilir.
        queuedShifts: Number((toplamDakika / 480).toFixed(2)),
      };
    });

    res.json({ rows, shiftMinutes: 480 });
  }),
);

planningRouter.get(
  '/schedule',
  canRead,
  asyncHandler(async (_req, res) => {
    const emirler = await prisma.productionOrder.findMany({
      where: { status: { in: ACIK_DURUMLAR } },
      orderBy: [{ deadline: 'asc' }],
      take: 200,
      select: {
        id: true,
        orderNo: true,
        status: true,
        priority: true,
        quantity: true,
        customer: true,
        plannedStart: true,
        startedAt: true,
        deadline: true,
        fabric: { select: { code: true, name: true } },
        workflow: {
          select: {
            nodes: { select: { id: true, durationMin: true, machine: { select: { capacity: true } } } },
          },
        },
        stepLogs: { select: { nodeId: true, status: true } },
      },
    });

    const now = new Date();

    const rows = emirler.map((emir) => {
      const nodes = emir.workflow?.nodes ?? [];
      const bitmisNodeIds = new Set(
        emir.stepLogs
          .filter((s) => s.status === StepStatus.TAMAMLANDI || s.status === StepStatus.ATLANDI)
          .map((s) => s.nodeId),
      );

      let toplamDakika = 0;
      let kalanDakika = 0;
      for (const node of nodes) {
        const sure = adimSuresi(node.durationMin, node.machine?.capacity, emir.quantity);
        toplamDakika += sure;
        if (!bitmisNodeIds.has(node.id)) kalanDakika += sure;
      }

      const toplamAdim = emir.stepLogs.length;
      const ilerleme = toplamAdim > 0 ? (bitmisNodeIds.size / toplamAdim) * 100 : 0;

      // Termine kalan calisma suresi (vardiya bazli degil, takvim bazli).
      const kalanGun = Math.round((gunBasi(emir.deadline) - gunBasi(now)) / GUN_MS);
      // Gunde tek vardiya (480 dk) varsayimiyla gereken gun sayisi.
      const gerekenGun = kalanDakika / 480;

      return {
        id: emir.id,
        orderNo: emir.orderNo,
        status: emir.status,
        priority: emir.priority,
        customer: emir.customer,
        fabric: emir.fabric,
        quantity: emir.quantity,
        plannedStart: emir.plannedStart,
        startedAt: emir.startedAt,
        deadline: emir.deadline,
        totalMinutes: Math.round(toplamDakika),
        remainingMinutes: Math.round(kalanDakika),
        progress: Number(ilerleme.toFixed(1)),
        daysLeft: kalanGun,
        requiredDays: Number(gerekenGun.toFixed(2)),
        /*
         * Risk: kalan is, termine kalan sureye sigmiyorsa.
         * "overdue" zaten gecmis, "risk" ise henuz gecmemis ama yetismeyecek
         * gorunen emir.
         *
         * Onemli ayrim: kalanDakika 0 olabilir cunku (a) sema adimlarina hic
         * sure girilmemistir ya da (b) is bitmistir. Ikisi ayni sayilirsa
         * tamamlanmis bir emir "sure girilmemis" gorunur. Bu yuzden karar
         * TOPLAM sureye bakilarak verilir.
         */
        risk:
          kalanGun < 0
            ? 'overdue'
            : toplamDakika === 0
              ? 'unknown'
              : gerekenGun > kalanGun
                ? 'risk'
                : 'ok',
      };
    });

    res.json({ rows, shiftMinutes: 480 });
  }),
);
