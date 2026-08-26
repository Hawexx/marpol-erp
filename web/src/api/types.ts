export type ModuleKey =
  | 'URETIM_EMRI_OLUSTUR'
  | 'FLANS'
  | 'KUMAS'
  | 'KIMYASAL_RECETE'
  | 'IS_AKISI'
  | 'URETIM_EMIRLERI'
  | 'YETKILENDIRME'
  | 'DENETIM'
  | 'STOK';

export type Priority = 'DUSUK' | 'NORMAL' | 'YUKSEK' | 'KRITIK';

export type OrderStatus =
  | 'TASLAK'
  | 'ONAY_BEKLIYOR'
  | 'PLANLANDI'
  | 'URETIMDE'
  | 'BEKLEMEDE'
  | 'TAMAMLANDI'
  | 'IPTAL';

export type NodeType =
  | 'START'
  | 'OPERATION'
  | 'MACHINE'
  | 'QUALITY'
  | 'DECISION'
  | 'WAIT'
  | 'END';

export type StepStatus = 'BEKLIYOR' | 'BASLADI' | 'TAMAMLANDI' | 'ATLANDI';

export interface PermissionRow {
  module: ModuleKey;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
}

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  employeeNo?: string | null;
  department?: string | null;
  title?: string | null;
  isAdmin: boolean;
  permissions: PermissionRow[];
}

export interface AppUser extends SessionUser {
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface Flange {
  id: string;
  code: string;
  name: string;
  material?: string | null;
  outerDiameter?: number | null;
  innerDiameter?: number | null;
  boreDiameter?: number | null;
  thickness?: number | null;
  holeCount?: number | null;
  weight?: number | null;
  supplier?: string | null;
  notes?: string | null;
  isActive: boolean;
}

export interface Chemical {
  id: string;
  code: string;
  name: string;
  type?: string | null;
  unit: string;
  density?: number | null;
  supplier?: string | null;
  hazardNote?: string | null;
  notes?: string | null;
  isActive: boolean;
}

export interface FabricChemical {
  id?: string;
  chemicalId: string;
  ratio: number;
  notes?: string | null;
  chemical?: Chemical;
}

export interface Fabric {
  id: string;
  code: string;
  name: string;
  type?: string | null;
  composition?: string | null;
  gramaj?: number | null;
  width?: number | null;
  thickness?: number | null;
  color?: string | null;
  supplier?: string | null;
  notes?: string | null;
  isActive: boolean;
  chemicals: FabricChemical[];
}

export interface RecipeItem {
  id?: string;
  chemicalId: string;
  ratio: number;
  sortOrder: number;
  notes?: string | null;
  chemical?: Chemical;
}

export interface Recipe {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  version: number;
  batchSize?: number | null;
  isActive: boolean;
  items: RecipeItem[];
}

export interface Machine {
  id: string;
  code: string;
  name: string;
  line?: string | null;
  capacity?: number | null;
  location?: string | null;
  isActive: boolean;
}

export interface WorkflowNode {
  id: string;
  workflowId?: string;
  type: NodeType;
  label: string;
  description?: string | null;
  machineId?: string | null;
  durationMin?: number | null;
  temperature?: number | null;
  posX: number;
  posY: number;
  sortOrder: number;
  machine?: Machine | null;
}

export interface WorkflowEdge {
  id?: string;
  fromNodeId: string;
  toNodeId: string;
  label?: string | null;
  condition?: string | null;
}

export interface Workflow {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  version: number;
  isActive: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface OrderChemical {
  id?: string;
  chemicalId: string;
  ratio: number;
  amount?: number | null;
  sortOrder: number;
  notes?: string | null;
  chemical?: Chemical;
}

export interface OrderStepLog {
  id: string;
  nodeId: string;
  status: StepStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  okQty?: number | null;
  scrapQty?: number | null;
  notes?: string | null;
  node: WorkflowNode;
  operator?: { id: string; fullName: string } | null;
}

export interface ProductionOrder {
  id: string;
  orderNo: string;
  fabricId: string;
  flangeId: string;
  recipeId?: string | null;
  workflowId?: string | null;
  diskDiameter: number;
  quantity: number;
  layers: number;
  priority: Priority;
  deadline: string;
  status: OrderStatus;
  plannedStart?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  producedQty: number;
  scrapQty: number;
  customer?: string | null;
  notes?: string | null;
  createdAt: string;
  fabric: Fabric;
  flange: Flange;
  recipe?: Recipe | null;
  workflow?: Workflow | null;
  chemicals: OrderChemical[];
  stepLogs: OrderStepLog[];
  createdBy: { id: string; fullName: string; username: string };
  approvedBy?: { id: string; fullName: string } | null;
}

export interface OrderSummary {
  total: number;
  overdue: number;
  byStatus: Partial<Record<OrderStatus, number>>;
  byPriority: Partial<Record<Priority, number>>;
}

/** Denetim kaydi (salt okunur). */
export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: unknown;
  ip?: string | null;
  createdAt: string;
  user?: { id: string; fullName: string; username: string } | null;
}

export interface AuditPage {
  total: number;
  page: number;
  pageSize: number;
  rows: AuditLog[];
}

export interface AuditFilters {
  actions: string[];
  entities: string[];
  users: { id: string; fullName: string; username: string }[];
}

// --- Planlama ve kapasite -------------------------------------------------

export interface DashboardData {
  openOrders: number;
  overdue: number;
  dueThisWeek: number;
  byStatus: Partial<Record<OrderStatus, number>>;
  byPriority: Partial<Record<Priority, number>>;
  production: { produced: number; scrap: number; planned: number; scrapRate: number };
  daily: { date: string; produced: number; scrap: number; orders: number }[];
}

export interface MachineLoadRow {
  id: string;
  code: string;
  name: string;
  line?: string | null;
  location?: string | null;
  capacity?: number | null;
  nodeCount: number;
  orderCount: number;
  inProgressSteps: number;
  queuedUnits: number;
  queuedMinutes: number;
  queuedShifts: number;
}

export type ScheduleRisk = 'ok' | 'risk' | 'overdue' | 'unknown';

export interface ScheduleRow {
  id: string;
  orderNo: string;
  status: OrderStatus;
  priority: Priority;
  customer?: string | null;
  fabric: { code: string; name: string };
  quantity: number;
  plannedStart?: string | null;
  startedAt?: string | null;
  deadline: string;
  totalMinutes: number;
  remainingMinutes: number;
  progress: number;
  daysLeft: number;
  requiredDays: number;
  risk: ScheduleRisk;
}

// --- Stok ------------------------------------------------------------------

export type StockReason = 'GIRIS' | 'CIKIS' | 'URETIM' | 'SAYIM' | 'IADE';

export interface StockRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  supplier?: string | null;
  stockQty: number;
  minStockQty: number;
  isLow: boolean;
}

export interface StockMovement {
  id: string;
  reason: StockReason;
  delta: number;
  balance: number;
  note?: string | null;
  createdAt: string;
  chemical: { code: string; name: string; unit: string };
  user?: { fullName: string } | null;
  order?: { orderNo: string } | null;
}
