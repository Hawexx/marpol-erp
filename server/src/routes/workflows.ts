import { Router } from 'express';
import { z } from 'zod';
import { ModuleKey, NodeType, StepStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler, badRequest, conflict } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { text } from '../lib/schemaHelpers.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const workflowsRouter = Router();

const MODULE = ModuleKey.IS_AKISI;

/**
 * Dugum id'leri istemcide (crypto.randomUUID) uretilir; boylece semadaki
 * baglantilar kaydetmeden once de kurulabilir.
 */
const nodeSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(NodeType).default(NodeType.OPERATION),
  label: z.string().trim().min(1, 'Adim adi zorunludur.'),
  description: text,
  machineId: z.string().uuid().optional().nullable(),
  durationMin: z.coerce.number().nonnegative().optional().nullable(),
  temperature: z.coerce.number().optional().nullable(),
  config: z.unknown().optional().nullable(),
  posX: z.coerce.number().default(0),
  posY: z.coerce.number().default(0),
  sortOrder: z.coerce.number().int().default(0),
});

const edgeSchema = z.object({
  fromNodeId: z.string().uuid(),
  toNodeId: z.string().uuid(),
  label: text,
  condition: text,
});

const schema = z.object({
  code: z.string().trim().min(1, 'Sema kodu zorunludur.'),
  name: z.string().trim().min(1, 'Sema adi zorunludur.'),
  description: text,
  version: z.coerce.number().int().min(1).default(1),
  isActive: z.boolean().default(true),
  nodes: z.array(nodeSchema).default([]),
  edges: z.array(edgeSchema).default([]),
});

/**
 * Guncellemede isActive opsiyonel: gonderilmediginde .default(true)
 * devreye girip pasife alinmis kaydi sessizce yeniden aktif ediyordu.
 */
const updateSchema = schema.extend({ isActive: z.boolean().optional() });

const include = {
  nodes: { include: { machine: true }, orderBy: { sortOrder: 'asc' as const } },
  edges: true,
};

/**
 * Semanin tutarli oldugunu dogrular.
 *
 * `allowEmpty` yalnizca olusturmada true'dur: bos bir sema iskeleti kurup
 * adimlari sonra eklemek mesru bir akis. Guncellemede ise bos liste
 * TEHLIKELIDIR - "listede olmayan dugumleri sil" mantigi semanin tum
 * adimlarini siler, cascade ile baglantilar ve uretimdeki emirlerin adim
 * kayitlari da gider. Bu yuzden guncellemede bos sema reddedilir.
 */
function validateGraph(
  nodes: z.infer<typeof nodeSchema>[],
  edges: z.infer<typeof edgeSchema>[],
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
) {
  if (nodes.length === 0) {
    if (allowEmpty && edges.length === 0) return;
    throw badRequest('Sema en az bir adim icermelidir.');
  }

  const ids = new Set(nodes.map((n) => n.id));

  const duplicate = nodes.length !== ids.size;
  if (duplicate) throw badRequest('Semada ayni adim birden fazla kez yer aliyor.');
  for (const edge of edges) {
    if (!ids.has(edge.fromNodeId) || !ids.has(edge.toNodeId)) {
      throw badRequest('Semada gecersiz bir baglanti var: baglanti bilinmeyen bir adima isaret ediyor.');
    }
    if (edge.fromNodeId === edge.toNodeId) {
      throw badRequest('Bir adim kendisine baglanamaz.');
    }
  }

  const startCount = nodes.filter((n) => n.type === NodeType.START).length;
  if (startCount === 0) throw badRequest('Semada bir "Baslangic" adimi olmalidir.');
  if (startCount > 1) throw badRequest('Semada yalnizca bir "Baslangic" adimi olabilir.');
  if (!nodes.some((n) => n.type === NodeType.END)) {
    throw badRequest('Semada en az bir "Bitis" adimi olmalidir.');
  }

  // Baglantisi olmayan (yetim) adim uyarisi - START disindaki her adima giris olmali.
  const hasIncoming = new Set(edges.map((e) => e.toNodeId));
  const orphan = nodes.find((n) => n.type !== NodeType.START && !hasIncoming.has(n.id));
  if (orphan) {
    throw badRequest(`"${orphan.label}" adimina hicbir baglanti gelmiyor. Semayi tamamlayin.`);
  }

  const komsu = new Map<string, string[]>();
  for (const edge of edges) {
    komsu.set(edge.fromNodeId, [...(komsu.get(edge.fromNodeId) ?? []), edge.toNodeId]);
  }

  // Dongu kontrolu: sonsuz donen bir uretim akisi kabul edilmemeli.
  const ZIYARET_EDILIYOR = 1;
  const BITTI = 2;
  const durum = new Map<string, number>();

  function donguVar(id: string): boolean {
    const mevcut = durum.get(id);
    if (mevcut === ZIYARET_EDILIYOR) return true;
    if (mevcut === BITTI) return false;

    durum.set(id, ZIYARET_EDILIYOR);
    for (const sonraki of komsu.get(id) ?? []) {
      if (donguVar(sonraki)) return true;
    }
    durum.set(id, BITTI);
    return false;
  }

  const start = nodes.find((n) => n.type === NodeType.START)!;
  if (nodes.some((n) => donguVar(n.id))) {
    throw badRequest('Semada dongu var: adimlar kendi uzerine donen bir akis olusturuyor.');
  }

  // START'tan ulasilamayan adim, akista hicbir zaman calismaz.
  const ulasilan = new Set<string>();
  const kuyruk = [start.id];
  while (kuyruk.length) {
    const id = kuyruk.shift()!;
    if (ulasilan.has(id)) continue;
    ulasilan.add(id);
    for (const sonraki of komsu.get(id) ?? []) kuyruk.push(sonraki);
  }

  const ulasilmayan = nodes.find((n) => !ulasilan.has(n.id));
  if (ulasilmayan) {
    throw badRequest(`"${ulasilmayan.label}" adimina baslangictan ulasilamiyor.`);
  }

  if (!nodes.some((n) => n.type === NodeType.END && ulasilan.has(n.id))) {
    throw badRequest('Akis hicbir "Bitis" adimina ulasmiyor.');
  }
}

workflowsRouter.use(requireAuth);

workflowsRouter.get(
  '/',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    res.json(
      await prisma.workflow.findMany({
        where: {
          ...(req.query.active === 'true' ? { isActive: true } : {}),
          ...(q
            ? {
                OR: [
                  { code: { contains: q, mode: 'insensitive' as const } },
                  { name: { contains: q, mode: 'insensitive' as const } },
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

workflowsRouter.get(
  '/:id',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    res.json(await prisma.workflow.findUniqueOrThrow({ where: { id: req.params.id }, include }));
  }),
);

workflowsRouter.post(
  '/',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const { nodes, edges, ...workflow } = schema.parse(req.body);
    validateGraph(nodes, edges, { allowEmpty: true });

    const created = await prisma.$transaction(async (tx) => {
      const wf = await tx.workflow.create({ data: workflow });
      if (nodes.length) {
        await tx.workflowNode.createMany({
          data: nodes.map((n) => ({
            ...n,
            config: (n.config ?? undefined) as object | undefined,
            workflowId: wf.id,
          })),
        });
        await tx.workflowEdge.createMany({
          data: edges.map((e) => ({ ...e, workflowId: wf.id })),
        });
      }
      return tx.workflow.findUniqueOrThrow({ where: { id: wf.id }, include });
    });

    await audit(req, 'CREATE', 'Workflow', created.id, { code: created.code });
    res.status(201).json(created);
  }),
);

workflowsRouter.put(
  '/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const { nodes, edges, ...workflow } = updateSchema.parse(req.body);
    const id = req.params.id;

    /*
     * Veri butunlugu kontrolleri sema seklinden ONCE calisir: kullanicinin
     * gormesi gereken ilk hata "bu adim uretimde kullaniliyor" olmali,
     * "adim baglantisiz kalmis" degil.
     */

    // Dugum id'leri istemciden geldigi icin, gonderilen id'lerin baska bir
    // semaya ait olmadigi dogrulanmali. Aksi halde asagidaki upsert o dugumu
    // bu semaya tasir; kaynak semanin baglantilari ve uretimdeki emirlerin
    // adim kayitlari cascade ile silinir.
    const yabanci = await prisma.workflowNode.findFirst({
      where: { id: { in: nodes.map((n) => n.id) }, workflowId: { not: id } },
      select: { id: true, label: true },
    });
    if (yabanci) {
      throw conflict(`"${yabanci.label}" adimi baska bir proses semasina ait, tasinamaz.`);
    }

    /*
     * Silinecek adimlarda ilerlemis uretim kaydi varsa islem durdurulur.
     * WorkflowNode -> OrderStepLog iliskisi cascade oldugundan, bir adimin
     * silinmesi o adima ait operator/zaman/miktar kayitlarini da goturur.
     */
    const keepIds = nodes.map((n) => n.id);
    const silinecek = await prisma.workflowNode.findMany({
      where: { workflowId: id, id: { notIn: keepIds } },
      select: { id: true, label: true },
    });

    if (silinecek.length) {
      const ilerlemisAdim = await prisma.orderStepLog.findFirst({
        where: {
          nodeId: { in: silinecek.map((n) => n.id) },
          status: { not: StepStatus.BEKLIYOR },
        },
        select: { node: { select: { label: true } }, order: { select: { orderNo: true } } },
      });

      if (ilerlemisAdim) {
        throw conflict(
          `"${ilerlemisAdim.node.label}" adimi ${ilerlemisAdim.order.orderNo} numarali emirde ` +
            'kullanilmis. Uretim gecmisi silinmemesi icin bu adim kaldirilamaz.',
        );
      }
    }

    // Butunluk kontrolleri gectikten sonra sema seklini dogrula.
    validateGraph(nodes, edges);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.workflow.update({ where: { id }, data: workflow });

      // Baglantilar her kayitta yeniden yazilir.
      await tx.workflowEdge.deleteMany({ where: { workflowId: id } });

      // Silinen adimlari temizle; kalanlari guncelle. Boylece devam eden
      // uretim emirlerinin adim kayitlari korunur.
      await tx.workflowNode.deleteMany({
        where: { workflowId: id, id: { notIn: keepIds } },
      });

      for (const node of nodes) {
        const data = {
          ...node,
          config: (node.config ?? undefined) as object | undefined,
          workflowId: id,
        };
        await tx.workflowNode.upsert({ where: { id: node.id }, create: data, update: data });
      }

      await tx.workflowEdge.createMany({ data: edges.map((e) => ({ ...e, workflowId: id })) });
      return tx.workflow.findUniqueOrThrow({ where: { id }, include });
    });

    await audit(req, 'UPDATE', 'Workflow', id, { code: updated.code });
    res.json(updated);
  }),
);

workflowsRouter.delete(
  '/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    const orderUse = await prisma.productionOrder.count({ where: { workflowId: req.params.id } });
    if (orderUse > 0) {
      throw conflict(
        `Bu proses semasi ${orderUse} uretim emrinde kullaniliyor. Silmek yerine pasife alabilirsiniz.`,
      );
    }

    await prisma.workflow.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'Workflow', req.params.id);
    res.json({ message: 'Proses semasi silindi.' });
  }),
);
