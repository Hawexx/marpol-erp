/**
 * Marpol PPM - baslangic verisi.
 * Calistirma: npm run seed -w server
 */
import bcrypt from 'bcryptjs';
import { ModuleKey, NodeType, OrderStatus, Priority, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ALL_MODULES = Object.values(ModuleKey);

function fullAccess(modules: ModuleKey[]) {
  return modules.map((module) => ({
    module,
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canApprove: true,
  }));
}

function readOnly(modules: ModuleKey[]) {
  return modules.map((module) => ({
    module,
    canView: true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
  }));
}

/**
 * Ornek hesaplarin sifreleri. Varsayilanlar README'de yazili oldugundan
 * uretimde kullanilamaz; oradaki degerler ortam degiskeniyle verilmelidir.
 */
function seedPassword(envVar: string, devDefault: string): string {
  const provided = process.env[envVar]?.trim();
  if (provided) return provided;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Uretim ortaminda ${envVar} tanimlanmadan seed calistirilamaz. ` +
        'Varsayilan ornek sifreler dokumantasyonda yazili oldugu icin guvenli degil.',
    );
  }
  return devDefault;
}

async function main() {
  console.log('Baslangic verisi yukleniyor...');

  // --- Kullanicilar --------------------------------------------------------
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
  const hash = (pw: string) => bcrypt.hash(pw, rounds);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: await hash(seedPassword('SEED_ADMIN_PASSWORD', 'Marpol2026!')),
      fullName: 'Sistem Yoneticisi',
      employeeNo: '0001',
      department: 'Bilgi Islem',
      title: 'Sistem Yoneticisi',
      isAdmin: true,
      permissions: { create: fullAccess(ALL_MODULES) },
    },
  });

  await prisma.user.upsert({
    where: { username: 'uretimmuduru' },
    update: {},
    create: {
      username: 'uretimmuduru',
      passwordHash: await hash(seedPassword('SEED_MANAGER_PASSWORD', 'Uretim2026!')),
      fullName: 'Uretim Muduru',
      employeeNo: '1001',
      department: 'Uretim',
      title: 'Uretim Muduru',
      permissions: {
        create: [
          ...fullAccess([
            ModuleKey.URETIM_EMRI_OLUSTUR,
            ModuleKey.URETIM_EMIRLERI,
            ModuleKey.FLANS,
            ModuleKey.KUMAS,
            ModuleKey.KIMYASAL_RECETE,
            ModuleKey.IS_AKISI,
          ]),
        ],
      },
    },
  });

  await prisma.user.upsert({
    where: { username: 'operator' },
    update: {},
    create: {
      username: 'operator',
      passwordHash: await hash(seedPassword('SEED_OPERATOR_PASSWORD', 'Operator2026!')),
      fullName: 'Hat Operatoru',
      employeeNo: '2001',
      department: 'Uretim Hatti',
      title: 'Operator',
      permissions: {
        create: [
          {
            module: ModuleKey.URETIM_EMIRLERI,
            canView: true,
            canCreate: false,
            canEdit: true, // adim ilerletebilir
            canDelete: false,
            canApprove: false,
          },
          ...readOnly([ModuleKey.IS_AKISI, ModuleKey.KIMYASAL_RECETE]),
        ],
      },
    },
  });

  // --- Kimyasallar ---------------------------------------------------------
  const chemicalData = [
    { code: 'CH-001', name: 'Fenolik Recine', type: 'Recine', unit: 'kg', density: 1.2 },
    { code: 'CH-002', name: 'Sertlestirici (Hardener)', type: 'Sertlestirici', unit: 'kg', density: 1.05 },
    { code: 'CH-003', name: 'Alumina Asindirici', type: 'Asindirici', unit: 'kg', density: 3.9 },
    { code: 'CH-004', name: 'Silikon Karbur', type: 'Asindirici', unit: 'kg', density: 3.2 },
    { code: 'CH-005', name: 'Cozucu (Tiner)', type: 'Cozucu', unit: 'lt', density: 0.87 },
    { code: 'CH-006', name: 'Dolgu Malzemesi', type: 'Dolgu', unit: 'kg', density: 2.1 },
  ];

  const chemicals = Object.fromEntries(
    await Promise.all(
      chemicalData.map(async (c) => [
        c.code,
        await prisma.chemical.upsert({ where: { code: c.code }, update: {}, create: c }),
      ]),
    ),
  ) as Record<string, { id: string }>;

  // --- Flanslar ------------------------------------------------------------
  const flangeData = [
    { code: 'FL-001', name: 'Standart Plastik Flans 100mm', material: 'Plastik', outerDiameter: 100, innerDiameter: 22, boreDiameter: 16, thickness: 8, holeCount: 4 },
    { code: 'FL-002', name: 'Aluminyum Flans 125mm', material: 'Aluminyum', outerDiameter: 125, innerDiameter: 22, boreDiameter: 16, thickness: 10, holeCount: 6 },
    { code: 'FL-003', name: 'Sac Flans 180mm', material: 'Sac', outerDiameter: 180, innerDiameter: 32, boreDiameter: 22, thickness: 12, holeCount: 6 },
    { code: 'FL-004', name: 'Agir Hizmet Flans 250mm', material: 'Celik', outerDiameter: 250, innerDiameter: 50, boreDiameter: 32, thickness: 15, holeCount: 8 },
  ];

  const flanges = Object.fromEntries(
    await Promise.all(
      flangeData.map(async (f) => [
        f.code,
        await prisma.flange.upsert({ where: { code: f.code }, update: {}, create: f }),
      ]),
    ),
  ) as Record<string, { id: string }>;

  // --- Kumaslar ------------------------------------------------------------
  const fabrics = {
    'KM-001': await prisma.fabric.upsert({
      where: { code: 'KM-001' },
      update: {},
      create: {
        code: 'KM-001',
        name: 'Sisal Keçe - Sert',
        type: 'Sisal',
        gramaj: 850,
        width: 1600,
        thickness: 6,
        color: 'Naturel',
        chemicals: {
          create: [
            { chemicalId: chemicals['CH-001'].id, ratio: 55 },
            { chemicalId: chemicals['CH-002'].id, ratio: 20 },
            { chemicalId: chemicals['CH-003'].id, ratio: 25 },
          ],
        },
      },
    }),
    'KM-002': await prisma.fabric.upsert({
      where: { code: 'KM-002' },
      update: {},
      create: {
        code: 'KM-002',
        name: 'Pamuk Dokuma - Yumusak',
        type: 'Dokuma',
        composition: '%100 Pamuk',
        gramaj: 420,
        width: 1500,
        thickness: 3,
        color: 'Beyaz',
        chemicals: {
          create: [
            { chemicalId: chemicals['CH-001'].id, ratio: 60 },
            { chemicalId: chemicals['CH-006'].id, ratio: 40 },
          ],
        },
      },
    }),
    'KM-003': await prisma.fabric.upsert({
      where: { code: 'KM-003' },
      update: {},
      create: {
        code: 'KM-003',
        name: 'Nonwoven Sentetik Keçe',
        type: 'Nonwoven',
        gramaj: 600,
        width: 1800,
        thickness: 5,
        color: 'Gri',
        chemicals: {
          create: [
            { chemicalId: chemicals['CH-001'].id, ratio: 45 },
            { chemicalId: chemicals['CH-004'].id, ratio: 35 },
            { chemicalId: chemicals['CH-002'].id, ratio: 20 },
          ],
        },
      },
    }),
  };

  // --- Receteler -----------------------------------------------------------
  const recipe = await prisma.recipe.upsert({
    where: { code: 'RC-001' },
    update: {},
    create: {
      code: 'RC-001',
      name: 'Standart Cila Emdirme Recetesi',
      description: 'Genel amacli cila fircasi emdirme karisimi.',
      batchSize: 100,
      items: {
        create: [
          { chemicalId: chemicals['CH-001'].id, ratio: 55, sortOrder: 0 },
          { chemicalId: chemicals['CH-002'].id, ratio: 20, sortOrder: 1 },
          { chemicalId: chemicals['CH-003'].id, ratio: 25, sortOrder: 2 },
        ],
      },
    },
  });

  await prisma.recipe.upsert({
    where: { code: 'RC-002' },
    update: {},
    create: {
      code: 'RC-002',
      name: 'Ince Perdah Recetesi',
      description: 'Yuzey perdahi icin dusuk asindiricili karisim.',
      batchSize: 50,
      items: {
        create: [
          { chemicalId: chemicals['CH-001'].id, ratio: 65, sortOrder: 0 },
          { chemicalId: chemicals['CH-006'].id, ratio: 25, sortOrder: 1 },
          { chemicalId: chemicals['CH-005'].id, ratio: 10, sortOrder: 2 },
        ],
      },
    },
  });

  // --- Makineler -----------------------------------------------------------
  const machineData = [
    { code: 'MK-01', name: 'Kumas Kesim Makinesi', line: 'Hat 1', capacity: 400 },
    { code: 'MK-02', name: 'Emdirme (Impregnasyon) Hattı', line: 'Hat 1', capacity: 250 },
    { code: 'MK-03', name: 'Kurutma Firini', line: 'Hat 1', capacity: 300 },
    { code: 'MK-04', name: 'Montaj / Presleme', line: 'Hat 2', capacity: 200 },
    { code: 'MK-05', name: 'Balans ve Son Kontrol', line: 'Hat 2', capacity: 350 },
  ];

  const machines = Object.fromEntries(
    await Promise.all(
      machineData.map(async (m) => [
        m.code,
        await prisma.machine.upsert({ where: { code: m.code }, update: {}, create: m }),
      ]),
    ),
  ) as Record<string, { id: string }>;

  // --- Uretim proses semasi ------------------------------------------------
  const existingWorkflow = await prisma.workflow.findUnique({ where: { code: 'PS-001' } });

  const workflow =
    existingWorkflow ??
    (await (async () => {
      const wf = await prisma.workflow.create({
        data: {
          code: 'PS-001',
          name: 'Disk Cila Fircasi - Standart Proses',
          description: 'Kesimden sevkiyata standart uretim akisi.',
        },
      });

      const steps = [
        { type: NodeType.START, label: 'Uretim Emri Acildi', machine: null, dur: null, temp: null },
        { type: NodeType.MACHINE, label: 'Kumas Kesim', machine: 'MK-01', dur: 25, temp: null },
        { type: NodeType.MACHINE, label: 'Kimyasal Emdirme', machine: 'MK-02', dur: 40, temp: 45 },
        { type: NodeType.WAIT, label: 'Kurutma', machine: 'MK-03', dur: 120, temp: 130 },
        { type: NodeType.QUALITY, label: 'Ara Kalite Kontrol', machine: null, dur: 15, temp: null },
        { type: NodeType.MACHINE, label: 'Flans Montaj / Pres', machine: 'MK-04', dur: 30, temp: null },
        { type: NodeType.MACHINE, label: 'Balans ve Son Kontrol', machine: 'MK-05', dur: 20, temp: null },
        { type: NodeType.OPERATION, label: 'Paketleme', machine: null, dur: 15, temp: null },
        { type: NodeType.END, label: 'Sevkiyata Hazir', machine: null, dur: null, temp: null },
      ];

      const nodes = [];
      for (const [i, step] of steps.entries()) {
        nodes.push(
          await prisma.workflowNode.create({
            data: {
              workflowId: wf.id,
              type: step.type,
              label: step.label,
              machineId: step.machine ? machines[step.machine].id : null,
              durationMin: step.dur,
              temperature: step.temp,
              posX: 120 + (i % 3) * 280,
              posY: 100 + Math.floor(i / 3) * 180,
              sortOrder: i,
            },
          }),
        );
      }

      for (let i = 0; i < nodes.length - 1; i++) {
        await prisma.workflowEdge.create({
          data: { workflowId: wf.id, fromNodeId: nodes[i].id, toNodeId: nodes[i + 1].id },
        });
      }

      return wf;
    })());

  // --- Ornek uretim emirleri ----------------------------------------------
  const orderCount = await prisma.productionOrder.count();
  if (orderCount === 0) {
    const nodes = await prisma.workflowNode.findMany({
      where: { workflowId: workflow.id },
      orderBy: { sortOrder: 'asc' },
    });

    const samples = [
      {
        orderNo: `UE-${new Date().getFullYear()}-0001`,
        fabricId: fabrics['KM-001'].id,
        flangeId: flanges['FL-002'].id,
        diskDiameter: 125,
        quantity: 500,
        layers: 3,
        priority: Priority.YUKSEK,
        status: OrderStatus.URETIMDE,
        customer: 'Anadolu Otomotiv A.S.',
        days: 7,
      },
      {
        orderNo: `UE-${new Date().getFullYear()}-0002`,
        fabricId: fabrics['KM-002'].id,
        flangeId: flanges['FL-001'].id,
        diskDiameter: 100,
        quantity: 1200,
        layers: 2,
        priority: Priority.NORMAL,
        status: OrderStatus.PLANLANDI,
        customer: 'Marmara Metal Ltd.',
        days: 14,
      },
      {
        orderNo: `UE-${new Date().getFullYear()}-0003`,
        fabricId: fabrics['KM-003'].id,
        flangeId: flanges['FL-004'].id,
        diskDiameter: 250,
        quantity: 180,
        layers: 5,
        priority: Priority.KRITIK,
        status: OrderStatus.ONAY_BEKLIYOR,
        customer: 'Ege Tersanesi',
        days: 3,
      },
    ];

    for (const s of samples) {
      const { days, ...data } = s;
      const order = await prisma.productionOrder.create({
        data: {
          ...data,
          recipeId: recipe.id,
          workflowId: workflow.id,
          deadline: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
          createdById: admin.id,
          chemicals: {
            create: [
              { chemicalId: chemicals['CH-001'].id, ratio: 55, sortOrder: 0 },
              { chemicalId: chemicals['CH-002'].id, ratio: 20, sortOrder: 1 },
              { chemicalId: chemicals['CH-003'].id, ratio: 25, sortOrder: 2 },
            ],
          },
        },
      });

      await prisma.orderStepLog.createMany({
        data: nodes.map((n) => ({ orderId: order.id, nodeId: n.id })),
        skipDuplicates: true,
      });
    }
  }

  console.log('Baslangic verisi hazir.');
  console.log('  Kullanicilar: admin (tam yetki), uretimmuduru, operator');
  console.log(
    '  Sifreler SEED_ADMIN_PASSWORD / SEED_MANAGER_PASSWORD / SEED_OPERATOR_PASSWORD ile',
  );
  console.log('  verilebilir. Verilmediyse README’deki gelistirme varsayilanlari kullanilir.');
  console.log('  UYARI: canli kullanimdan once tum ornek sifreleri degistirin.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
