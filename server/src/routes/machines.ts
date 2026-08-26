import { z } from 'zod';
import { ModuleKey } from '@prisma/client';
import { prisma } from '../db.js';
import { crudRouter } from '../lib/crudRouter.js';
import { conflict } from '../lib/http.js';
import { text } from '../lib/schemaHelpers.js';

const schema = z.object({
  code: z.string().trim().min(1, 'Makine kodu zorunludur.'),
  name: z.string().trim().min(1, 'Makine adi zorunludur.'),
  line: text,
  capacity: z.coerce.number().nonnegative().optional().nullable(),
  location: text,
  isActive: z.boolean().default(true),
});

export const machinesRouter = crudRouter({
  module: ModuleKey.IS_AKISI,
  entity: 'Machine',
  delegate: prisma.machine,
  createSchema: schema,
  // Tam partial: gonderilmeyen alan degistirilmez. Onceden yalnizca
  // code/name opsiyoneldi, bu yuzden isActive gonderilmediginde
  // .default(true) devreye girip pasif kaydi yeniden aktif ediyordu.
  updateSchema: schema.partial(),
  searchFields: ['code', 'name', 'line', 'location'],
  /*
   * WorkflowNode.machineId opsiyonel bir iliski oldugundan Prisma silmede
   * varsayilan olarak SetNull uyguluyordu: kullanimdaki bir makine silinince
   * proses semalarindaki makine baglantilari sessizce bosaliyor, kapasite
   * planlamasi da bozuluyordu.
   */
  beforeDelete: async (id) => {
    const kullanim = await prisma.workflowNode.count({ where: { machineId: id } });
    if (kullanim > 0) {
      throw conflict(
        `Bu makine ${kullanim} proses adiminda kullaniliyor. ` +
          'Silmek yerine pasife alabilirsiniz.',
      );
    }
  },
});
