import { z } from 'zod';
import { ModuleKey } from '@prisma/client';
import { prisma } from '../db.js';
import { crudRouter } from '../lib/crudRouter.js';

const num = z.coerce.number().nonnegative().optional().nullable();
const text = z.string().trim().optional().nullable();

const schema = z.object({
  code: z.string().trim().min(1, 'Flans kodu zorunludur.'),
  name: z.string().trim().min(1, 'Flans adi zorunludur.'),
  material: text,
  outerDiameter: num,
  innerDiameter: num,
  boreDiameter: num,
  thickness: num,
  holeCount: z.coerce.number().int().nonnegative().optional().nullable(),
  weight: num,
  supplier: text,
  notes: text,
  isActive: z.boolean().default(true),
});

export const flangesRouter = crudRouter({
  module: ModuleKey.FLANS,
  entity: 'Flange',
  delegate: prisma.flange,
  createSchema: schema,
  // Tam partial: gonderilmeyen alan degistirilmez. Onceden yalnizca
  // code/name opsiyoneldi, bu yuzden isActive gonderilmediginde
  // .default(true) devreye girip pasif kaydi yeniden aktif ediyordu.
  updateSchema: schema.partial(),
  searchFields: ['code', 'name', 'material', 'supplier'],
});
