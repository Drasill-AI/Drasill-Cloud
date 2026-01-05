/**
 * SQLite database module for equipment and maintenance logs
 * Uses better-sqlite3 for synchronous, high-performance SQLite access
 */
import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// Types
export interface Equipment {
  id: string;
  name: string;
  make: string;
  model: string;
  serialNumber: string | null;
  location: string | null;
  installDate: string | null;
  status: 'operational' | 'maintenance' | 'down' | 'retired';
  hourlyCost: number;
  manualPath: string | null; // Path to manual in workspace
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceLog {
  id: string;
  equipmentId: string;
  type: 'preventive' | 'corrective' | 'emergency' | 'inspection';
  startedAt: string;
  completedAt: string | null;
  durationMinutes: number | null;
  technician: string | null;
  partsUsed: string | null; // JSON array
  notes: string | null;
  createdAt: string;
}

export interface FailureEvent {
  id: string;
  equipmentId: string;
  occurredAt: string;
  resolvedAt: string | null;
  rootCause: string | null;
  maintenanceLogId: string | null;
  createdAt: string;
}

export interface EquipmentAnalytics {
  equipmentId: string;
  mtbf: number | null; // Mean Time Between Failures (hours)
  mttr: number | null; // Mean Time To Recovery (hours)
  availability: number | null; // Percentage (0-100)
  totalFailures: number;
  totalMaintenanceLogs: number;
  lastMaintenanceDate: string | null;
  lastMaintenanceType: string | null;
  predictedNextMaintenance: string | null;
}

let db: Database.Database | null = null;

/**
 * Get or create the database connection
 */
export function getDatabase(): Database.Database {
  if (db) return db;

  try {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'drasill-legal.db');

    // Ensure directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    
    initializeSchema();
    
    return db;
  } catch (error) {
    console.error('[Database] Failed to initialize database:', error);
    throw new Error(`Database initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Close the database connection safely
 */
export function closeDatabase(): void {
  if (db) {
    try {
      db.close();
      db = null;
      console.log('[Database] Connection closed');
    } catch (error) {
      console.error('[Database] Error closing connection:', error);
    }
  }
}

/**
 * Initialize database schema
 */
function initializeSchema(): void {
  if (!db) return;

  try {
    db.exec(`
    -- Equipment/Assets table
    CREATE TABLE IF NOT EXISTS equipment (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      make TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      serial_number TEXT,
      location TEXT,
      install_date TEXT,
      status TEXT DEFAULT 'operational' CHECK(status IN ('operational', 'maintenance', 'down', 'retired')),
      hourly_cost REAL DEFAULT 0,
      manual_path TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Maintenance Logs table
    CREATE TABLE IF NOT EXISTS maintenance_logs (
      id TEXT PRIMARY KEY,
      equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('preventive', 'corrective', 'emergency', 'inspection')),
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_minutes INTEGER,
      technician TEXT,
      parts_used TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Failure Events table (for MTBF calculation)
    CREATE TABLE IF NOT EXISTS failure_events (
      id TEXT PRIMARY KEY,
      equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      occurred_at TEXT NOT NULL,
      resolved_at TEXT,
      root_cause TEXT,
      maintenance_log_id TEXT REFERENCES maintenance_logs(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_maintenance_logs_equipment ON maintenance_logs(equipment_id);
    CREATE INDEX IF NOT EXISTS idx_maintenance_logs_started ON maintenance_logs(started_at);
    CREATE INDEX IF NOT EXISTS idx_failure_events_equipment ON failure_events(equipment_id);
    CREATE INDEX IF NOT EXISTS idx_failure_events_occurred ON failure_events(occurred_at);

    -- File-Equipment Associations table
    CREATE TABLE IF NOT EXISTS file_equipment_associations (
      id TEXT PRIMARY KEY,
      equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT DEFAULT 'other' CHECK(file_type IN ('manual', 'image', 'schematic', 'document', 'other')),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(equipment_id, file_path)
    );

    CREATE INDEX IF NOT EXISTS idx_file_assoc_equipment ON file_equipment_associations(equipment_id);
    CREATE INDEX IF NOT EXISTS idx_file_assoc_path ON file_equipment_associations(file_path);

    -- Work Orders table
    CREATE TABLE IF NOT EXISTS work_orders (
      id TEXT PRIMARY KEY,
      work_order_number TEXT UNIQUE NOT NULL,
      equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      template_id TEXT REFERENCES work_order_templates(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL CHECK(type IN ('preventive', 'corrective', 'emergency', 'inspection')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'open', 'in_progress', 'on_hold', 'completed', 'cancelled')),
      scheduled_start TEXT,
      scheduled_end TEXT,
      actual_start TEXT,
      actual_end TEXT,
      estimated_hours REAL,
      actual_hours REAL,
      technician TEXT,
      parts_required TEXT,
      notes TEXT,
      maintenance_log_id TEXT REFERENCES maintenance_logs(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_work_orders_equipment ON work_orders(equipment_id);
    CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
    CREATE INDEX IF NOT EXISTS idx_work_orders_scheduled ON work_orders(scheduled_start);
    CREATE INDEX IF NOT EXISTS idx_work_orders_number ON work_orders(work_order_number);

    -- Work Order Templates table
    CREATE TABLE IF NOT EXISTS work_order_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL CHECK(type IN ('preventive', 'corrective', 'emergency', 'inspection')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
      estimated_hours REAL,
      parts_required TEXT,
      checklist TEXT,
      equipment_type TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_templates_type ON work_order_templates(type);
  `);
    console.log('[Database] Schema initialized successfully');
  } catch (error) {
    console.error('[Database] Failed to initialize schema:', error);
    throw new Error(`Database schema initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// ============ Equipment CRUD ============

export function createEquipment(data: Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'>): Equipment {
  const db = getDatabase();
  const id = generateId();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO equipment (id, name, make, model, serial_number, location, install_date, status, hourly_cost, manual_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.name,
    data.make,
    data.model,
    data.serialNumber,
    data.location,
    data.installDate,
    data.status,
    data.hourlyCost,
    data.manualPath,
    now,
    now
  );

  return {
    id,
    ...data,
    createdAt: now,
    updatedAt: now,
  };
}

export function getEquipment(id: string): Equipment | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM equipment WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapRowToEquipment(row) : null;
}

export function getAllEquipment(): Equipment[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM equipment ORDER BY name').all() as Record<string, unknown>[];
  return rows.map(mapRowToEquipment);
}

export function updateEquipment(id: string, data: Partial<Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'>>): Equipment | null {
  const db = getDatabase();
  const existing = getEquipment(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated = { ...existing, ...data, updatedAt: now };

  const stmt = db.prepare(`
    UPDATE equipment 
    SET name = ?, make = ?, model = ?, serial_number = ?, location = ?, install_date = ?, status = ?, hourly_cost = ?, manual_path = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    updated.name,
    updated.make,
    updated.model,
    updated.serialNumber,
    updated.location,
    updated.installDate,
    updated.status,
    updated.hourlyCost,
    updated.manualPath,
    now,
    id
  );

  return updated;
}

export function deleteEquipment(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM equipment WHERE id = ?').run(id);
  return result.changes > 0;
}

function mapRowToEquipment(row: Record<string, unknown>): Equipment {
  return {
    id: row.id as string,
    name: row.name as string,
    make: row.make as string,
    model: row.model as string,
    serialNumber: row.serial_number as string | null,
    location: row.location as string | null,
    installDate: row.install_date as string | null,
    status: row.status as Equipment['status'],
    hourlyCost: row.hourly_cost as number,
    manualPath: row.manual_path as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ============ Maintenance Logs CRUD ============

export function createMaintenanceLog(data: Omit<MaintenanceLog, 'id' | 'createdAt'>): MaintenanceLog {
  const db = getDatabase();
  const id = generateId();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO maintenance_logs (id, equipment_id, type, started_at, completed_at, duration_minutes, technician, parts_used, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.equipmentId,
    data.type,
    data.startedAt,
    data.completedAt,
    data.durationMinutes,
    data.technician,
    data.partsUsed,
    data.notes,
    now
  );

  return {
    id,
    ...data,
    createdAt: now,
  };
}

export function getMaintenanceLog(id: string): MaintenanceLog | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM maintenance_logs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapRowToMaintenanceLog(row) : null;
}

export function getMaintenanceLogsForEquipment(equipmentId: string): MaintenanceLog[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM maintenance_logs WHERE equipment_id = ? ORDER BY started_at DESC').all(equipmentId) as Record<string, unknown>[];
  return rows.map(mapRowToMaintenanceLog);
}

export function getAllMaintenanceLogs(): MaintenanceLog[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM maintenance_logs ORDER BY started_at DESC').all() as Record<string, unknown>[];
  return rows.map(mapRowToMaintenanceLog);
}

export function updateMaintenanceLog(id: string, data: Partial<Omit<MaintenanceLog, 'id' | 'createdAt'>>): MaintenanceLog | null {
  const db = getDatabase();
  const existing = getMaintenanceLog(id);
  if (!existing) return null;

  const updated = { ...existing, ...data };

  const stmt = db.prepare(`
    UPDATE maintenance_logs 
    SET equipment_id = ?, type = ?, started_at = ?, completed_at = ?, duration_minutes = ?, technician = ?, parts_used = ?, notes = ?
    WHERE id = ?
  `);

  stmt.run(
    updated.equipmentId,
    updated.type,
    updated.startedAt,
    updated.completedAt,
    updated.durationMinutes,
    updated.technician,
    updated.partsUsed,
    updated.notes,
    id
  );

  return updated;
}

export function deleteMaintenanceLog(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM maintenance_logs WHERE id = ?').run(id);
  return result.changes > 0;
}

function mapRowToMaintenanceLog(row: Record<string, unknown>): MaintenanceLog {
  return {
    id: row.id as string,
    equipmentId: row.equipment_id as string,
    type: row.type as MaintenanceLog['type'],
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string | null,
    durationMinutes: row.duration_minutes as number | null,
    technician: row.technician as string | null,
    partsUsed: row.parts_used as string | null,
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
  };
}

// ============ Failure Events CRUD ============

export function createFailureEvent(data: Omit<FailureEvent, 'id' | 'createdAt'>): FailureEvent {
  const db = getDatabase();
  const id = generateId();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO failure_events (id, equipment_id, occurred_at, resolved_at, root_cause, maintenance_log_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.equipmentId,
    data.occurredAt,
    data.resolvedAt,
    data.rootCause,
    data.maintenanceLogId,
    now
  );

  return {
    id,
    ...data,
    createdAt: now,
  };
}

export function getFailureEventsForEquipment(equipmentId: string): FailureEvent[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM failure_events WHERE equipment_id = ? ORDER BY occurred_at DESC').all(equipmentId) as Record<string, unknown>[];
  return rows.map(mapRowToFailureEvent);
}

function mapRowToFailureEvent(row: Record<string, unknown>): FailureEvent {
  return {
    id: row.id as string,
    equipmentId: row.equipment_id as string,
    occurredAt: row.occurred_at as string,
    resolvedAt: row.resolved_at as string | null,
    rootCause: row.root_cause as string | null,
    maintenanceLogId: row.maintenance_log_id as string | null,
    createdAt: row.created_at as string,
  };
}

// ============ File-Equipment Associations CRUD ============

export interface FileEquipmentAssociation {
  id: string;
  equipmentId: string;
  filePath: string;
  fileName: string;
  fileType: 'manual' | 'image' | 'schematic' | 'document' | 'other';
  notes: string | null;
  createdAt: string;
}

export function addFileAssociation(data: Omit<FileEquipmentAssociation, 'id' | 'createdAt'>): FileEquipmentAssociation {
  const db = getDatabase();
  const id = generateId();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO file_equipment_associations (id, equipment_id, file_path, file_name, file_type, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.equipmentId,
    data.filePath,
    data.fileName,
    data.fileType,
    data.notes || null,
    now
  );

  return {
    id,
    ...data,
    notes: data.notes || null,
    createdAt: now,
  };
}

export function removeFileAssociation(equipmentId: string, filePath: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM file_equipment_associations WHERE equipment_id = ? AND file_path = ?').run(equipmentId, filePath);
  return result.changes > 0;
}

export function removeFileAssociationsByPath(filePath: string): number {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM file_equipment_associations WHERE file_path = ?').run(filePath);
  return result.changes;
}

export function getFileAssociationsForEquipment(equipmentId: string): FileEquipmentAssociation[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM file_equipment_associations WHERE equipment_id = ? ORDER BY created_at DESC').all(equipmentId) as Record<string, unknown>[];
  return rows.map(mapRowToFileAssociation);
}

export function getFileAssociationsForFile(filePath: string): FileEquipmentAssociation[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM file_equipment_associations WHERE file_path = ?').all(filePath) as Record<string, unknown>[];
  return rows.map(mapRowToFileAssociation);
}

function mapRowToFileAssociation(row: Record<string, unknown>): FileEquipmentAssociation {
  return {
    id: row.id as string,
    equipmentId: row.equipment_id as string,
    filePath: row.file_path as string,
    fileName: row.file_name as string,
    fileType: row.file_type as FileEquipmentAssociation['fileType'],
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
  };
}

// ============ Analytics Calculations ============

export function calculateEquipmentAnalytics(equipmentId: string): EquipmentAnalytics {
  // Get failure events
  const failures = getFailureEventsForEquipment(equipmentId);
  const totalFailures = failures.length;

  // Get maintenance logs
  const logs = getMaintenanceLogsForEquipment(equipmentId);
  const totalMaintenanceLogs = logs.length;

  // Last maintenance info
  const lastLog = logs[0];
  const lastMaintenanceDate = lastLog?.startedAt || null;
  const lastMaintenanceType = lastLog?.type || null;

  // Calculate MTBF (Mean Time Between Failures)
  let mtbf: number | null = null;
  if (failures.length >= 2) {
    const sortedFailures = [...failures].sort((a, b) => 
      new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
    );
    
    let totalTimeBetween = 0;
    for (let i = 1; i < sortedFailures.length; i++) {
      const prev = new Date(sortedFailures[i - 1].occurredAt);
      const curr = new Date(sortedFailures[i].occurredAt);
      totalTimeBetween += (curr.getTime() - prev.getTime()) / (1000 * 60 * 60); // hours
    }
    mtbf = Math.round(totalTimeBetween / (failures.length - 1));
  }

  // Calculate MTTR (Mean Time To Recovery)
  let mttr: number | null = null;
  const resolvedFailures = failures.filter(f => f.resolvedAt);
  if (resolvedFailures.length > 0) {
    let totalRecoveryTime = 0;
    for (const failure of resolvedFailures) {
      const occurred = new Date(failure.occurredAt);
      const resolved = new Date(failure.resolvedAt!);
      totalRecoveryTime += (resolved.getTime() - occurred.getTime()) / (1000 * 60 * 60); // hours
    }
    mttr = Math.round((totalRecoveryTime / resolvedFailures.length) * 10) / 10;
  }

  // Calculate Availability
  let availability: number | null = null;
  if (mtbf !== null && mttr !== null && (mtbf + mttr) > 0) {
    availability = Math.round((mtbf / (mtbf + mttr)) * 1000) / 10;
  }

  // Predict next maintenance (simple: average days between maintenance)
  let predictedNextMaintenance: string | null = null;
  if (logs.length >= 2) {
    const sortedLogs = [...logs].sort((a, b) => 
      new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    );
    
    let totalDaysBetween = 0;
    for (let i = 1; i < sortedLogs.length; i++) {
      const prev = new Date(sortedLogs[i - 1].startedAt);
      const curr = new Date(sortedLogs[i].startedAt);
      totalDaysBetween += (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    }
    const avgDays = totalDaysBetween / (logs.length - 1);
    
    if (lastMaintenanceDate) {
      const lastDate = new Date(lastMaintenanceDate);
      const predictedDate = new Date(lastDate.getTime() + avgDays * 24 * 60 * 60 * 1000);
      predictedNextMaintenance = predictedDate.toISOString();
    }
  }

  return {
    equipmentId,
    mtbf,
    mttr,
    availability,
    totalFailures,
    totalMaintenanceLogs,
    lastMaintenanceDate,
    lastMaintenanceType,
    predictedNextMaintenance,
  };
}

/**
 * Generate sample case issues and activity logs for testing analytics
 */
export function generateSampleAnalyticsData(equipmentId: string): { 
  failuresCreated: number; 
  logsCreated: number;
} {
  const now = new Date();
  
  // Generate 5 case issues over the past 6 months
  const failureData = [
    { daysAgo: 180, rootCause: 'Motion deadline missed - court extension granted', resolvedHoursLater: 4 },
    { daysAgo: 120, rootCause: 'Discovery response delay - opposing counsel objection resolved', resolvedHoursLater: 8 },
    { daysAgo: 75, rootCause: 'Filing error - amended complaint submitted', resolvedHoursLater: 2 },
    { daysAgo: 30, rootCause: 'Document production incomplete - supplemental response filed', resolvedHoursLater: 1 },
    { daysAgo: 7, rootCause: 'Court scheduling conflict - hearing rescheduled', resolvedHoursLater: 3 },
  ];

  for (const failure of failureData) {
    const occurredAt = new Date(now.getTime() - failure.daysAgo * 24 * 60 * 60 * 1000);
    const resolvedAt = new Date(occurredAt.getTime() + failure.resolvedHoursLater * 60 * 60 * 1000);
    
    createFailureEvent({
      equipmentId,
      occurredAt: occurredAt.toISOString(),
      resolvedAt: resolvedAt.toISOString(),
      rootCause: failure.rootCause,
      maintenanceLogId: null,
    });
  }

  // Generate 8 activity logs over the past 6 months
  const logData = [
    { daysAgo: 175, type: 'corrective' as const, notes: 'Motion to dismiss response drafted and filed', duration: 120, technician: 'Jane Morrison, Esq.' },
    { daysAgo: 150, type: 'preventive' as const, notes: 'Quarterly case status review and deadline audit', duration: 45, technician: 'Robert Chen, Esq.' },
    { daysAgo: 115, type: 'corrective' as const, notes: 'Discovery objections prepared and served', duration: 240, technician: 'Jane Morrison, Esq.' },
    { daysAgo: 90, type: 'inspection' as const, notes: 'Annual compliance review - all filings current', duration: 60, technician: 'Maria Santos, Paralegal' },
    { daysAgo: 70, type: 'emergency' as const, notes: 'Emergency TRO motion prepared and filed', duration: 90, technician: 'Robert Chen, Esq.' },
    { daysAgo: 45, type: 'preventive' as const, notes: 'Document organization and indexing update', duration: 30, technician: 'Jane Morrison, Esq.' },
    { daysAgo: 25, type: 'corrective' as const, notes: 'Amended pleading drafted per court order', duration: 60, technician: 'Robert Chen, Esq.' },
    { daysAgo: 5, type: 'corrective' as const, notes: 'Settlement agreement revisions completed', duration: 45, technician: 'Maria Santos, Paralegal' },
  ];

  for (const log of logData) {
    const startedAt = new Date(now.getTime() - log.daysAgo * 24 * 60 * 60 * 1000);
    const completedAt = new Date(startedAt.getTime() + log.duration * 60 * 1000);
    
    createMaintenanceLog({
      equipmentId,
      type: log.type,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMinutes: log.duration,
      technician: log.technician,
      partsUsed: null,
      notes: log.notes,
    });
  }

  return {
    failuresCreated: failureData.length,
    logsCreated: logData.length,
  };
}

// ============ Work Order Types ============

export type WorkOrderStatus = 'draft' | 'open' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
export type WorkOrderPriority = 'low' | 'medium' | 'high' | 'critical';
export type WorkOrderType = 'preventive' | 'corrective' | 'emergency' | 'inspection';

export interface WorkOrder {
  id: string;
  workOrderNumber: string;
  equipmentId: string;
  templateId: string | null;
  title: string;
  description: string | null;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  technician: string | null;
  partsRequired: string | null;
  notes: string | null;
  maintenanceLogId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderTemplate {
  id: string;
  name: string;
  description: string | null;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  estimatedHours: number | null;
  partsRequired: string | null;
  checklist: string | null;
  equipmentType: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============ Work Order Number Generation ============

function generateWorkOrderNumber(): string {
  const db = getDatabase();
  const year = new Date().getFullYear();
  
  // Get the highest work order number for this year
  const result = db.prepare(`
    SELECT work_order_number FROM work_orders 
    WHERE work_order_number LIKE ? 
    ORDER BY work_order_number DESC LIMIT 1
  `).get(`WO-${year}-%`) as { work_order_number: string } | undefined;
  
  let nextNumber = 1;
  if (result) {
    const parts = result.work_order_number.split('-');
    const lastNumber = parseInt(parts[2], 10);
    if (!isNaN(lastNumber)) {
      nextNumber = lastNumber + 1;
    }
  }
  
  return `WO-${year}-${String(nextNumber).padStart(4, '0')}`;
}

// ============ Work Order CRUD ============

export function createWorkOrder(data: Omit<WorkOrder, 'id' | 'workOrderNumber' | 'maintenanceLogId' | 'createdAt' | 'updatedAt'>): WorkOrder {
  const db = getDatabase();
  const id = generateId();
  const workOrderNumber = generateWorkOrderNumber();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO work_orders (
      id, work_order_number, equipment_id, template_id, title, description, type, priority, status,
      scheduled_start, scheduled_end, actual_start, actual_end, estimated_hours, actual_hours,
      technician, parts_required, notes, maintenance_log_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    workOrderNumber,
    data.equipmentId,
    data.templateId,
    data.title,
    data.description,
    data.type,
    data.priority,
    data.status || 'draft',
    data.scheduledStart,
    data.scheduledEnd,
    data.actualStart,
    data.actualEnd,
    data.estimatedHours,
    data.actualHours,
    data.technician,
    data.partsRequired,
    data.notes,
    null,
    now,
    now
  );

  return {
    id,
    workOrderNumber,
    ...data,
    status: data.status || 'draft',
    maintenanceLogId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function getWorkOrder(id: string): WorkOrder | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapRowToWorkOrder(row) : null;
}

export function getAllWorkOrders(): WorkOrder[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM work_orders ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return rows.map(mapRowToWorkOrder);
}

export function getWorkOrdersForEquipment(equipmentId: string): WorkOrder[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM work_orders WHERE equipment_id = ? ORDER BY created_at DESC').all(equipmentId) as Record<string, unknown>[];
  return rows.map(mapRowToWorkOrder);
}

export function updateWorkOrder(id: string, data: Partial<Omit<WorkOrder, 'id' | 'workOrderNumber' | 'createdAt' | 'updatedAt'>>): WorkOrder | null {
  const db = getDatabase();
  const existing = getWorkOrder(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated = { ...existing, ...data, updatedAt: now };

  const stmt = db.prepare(`
    UPDATE work_orders 
    SET equipment_id = ?, template_id = ?, title = ?, description = ?, type = ?, priority = ?, status = ?,
        scheduled_start = ?, scheduled_end = ?, actual_start = ?, actual_end = ?, estimated_hours = ?,
        actual_hours = ?, technician = ?, parts_required = ?, notes = ?, maintenance_log_id = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    updated.equipmentId,
    updated.templateId,
    updated.title,
    updated.description,
    updated.type,
    updated.priority,
    updated.status,
    updated.scheduledStart,
    updated.scheduledEnd,
    updated.actualStart,
    updated.actualEnd,
    updated.estimatedHours,
    updated.actualHours,
    updated.technician,
    updated.partsRequired,
    updated.notes,
    updated.maintenanceLogId,
    now,
    id
  );

  return updated;
}

export function deleteWorkOrder(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM work_orders WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Complete a work order and optionally create a maintenance log
 */
export function completeWorkOrder(
  id: string, 
  actualHours: number, 
  notes?: string | null,
  createLog: boolean = true
): { workOrder: WorkOrder; maintenanceLog?: MaintenanceLog } | null {
  const workOrder = getWorkOrder(id);
  if (!workOrder) return null;

  const now = new Date().toISOString();
  let maintenanceLog: MaintenanceLog | undefined;

  // Create maintenance log if requested
  if (createLog) {
    const combinedNotes = [workOrder.notes, notes].filter(Boolean).join('\n\nCompletion Notes: ');
    maintenanceLog = createMaintenanceLog({
      equipmentId: workOrder.equipmentId,
      type: workOrder.type,
      startedAt: workOrder.actualStart || now,
      completedAt: now,
      durationMinutes: Math.round(actualHours * 60),
      technician: workOrder.technician,
      partsUsed: workOrder.partsRequired,
      notes: combinedNotes || `Completed work order ${workOrder.workOrderNumber}: ${workOrder.title}`,
    });
  }

  // Update the work order
  const updatedWorkOrder = updateWorkOrder(id, {
    status: 'completed',
    actualEnd: now,
    actualHours,
    notes: notes ? (workOrder.notes ? `${workOrder.notes}\n\nCompletion Notes: ${notes}` : notes) : workOrder.notes,
    maintenanceLogId: maintenanceLog?.id || null,
  });

  return updatedWorkOrder ? { workOrder: updatedWorkOrder, maintenanceLog } : null;
}

function mapRowToWorkOrder(row: Record<string, unknown>): WorkOrder {
  return {
    id: row.id as string,
    workOrderNumber: row.work_order_number as string,
    equipmentId: row.equipment_id as string,
    templateId: row.template_id as string | null,
    title: row.title as string,
    description: row.description as string | null,
    type: row.type as WorkOrderType,
    priority: row.priority as WorkOrderPriority,
    status: row.status as WorkOrderStatus,
    scheduledStart: row.scheduled_start as string | null,
    scheduledEnd: row.scheduled_end as string | null,
    actualStart: row.actual_start as string | null,
    actualEnd: row.actual_end as string | null,
    estimatedHours: row.estimated_hours as number | null,
    actualHours: row.actual_hours as number | null,
    technician: row.technician as string | null,
    partsRequired: row.parts_required as string | null,
    notes: row.notes as string | null,
    maintenanceLogId: row.maintenance_log_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ============ Work Order Template CRUD ============

export function createWorkOrderTemplate(data: Omit<WorkOrderTemplate, 'id' | 'createdAt' | 'updatedAt'>): WorkOrderTemplate {
  const db = getDatabase();
  const id = generateId();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO work_order_templates (
      id, name, description, type, priority, estimated_hours, parts_required, checklist, equipment_type, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.name,
    data.description,
    data.type,
    data.priority,
    data.estimatedHours,
    data.partsRequired,
    data.checklist,
    data.equipmentType,
    now,
    now
  );

  return {
    id,
    ...data,
    createdAt: now,
    updatedAt: now,
  };
}

export function getWorkOrderTemplate(id: string): WorkOrderTemplate | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM work_order_templates WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapRowToTemplate(row) : null;
}

export function getAllWorkOrderTemplates(): WorkOrderTemplate[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM work_order_templates ORDER BY name').all() as Record<string, unknown>[];
  return rows.map(mapRowToTemplate);
}

export function updateWorkOrderTemplate(id: string, data: Partial<Omit<WorkOrderTemplate, 'id' | 'createdAt' | 'updatedAt'>>): WorkOrderTemplate | null {
  const db = getDatabase();
  const existing = getWorkOrderTemplate(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated = { ...existing, ...data, updatedAt: now };

  const stmt = db.prepare(`
    UPDATE work_order_templates 
    SET name = ?, description = ?, type = ?, priority = ?, estimated_hours = ?, parts_required = ?, checklist = ?, equipment_type = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    updated.name,
    updated.description,
    updated.type,
    updated.priority,
    updated.estimatedHours,
    updated.partsRequired,
    updated.checklist,
    updated.equipmentType,
    now,
    id
  );

  return updated;
}

export function deleteWorkOrderTemplate(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM work_order_templates WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Create a work order from a template
 */
export function createWorkOrderFromTemplate(
  templateId: string, 
  equipmentId: string, 
  scheduledStart?: string | null,
  technician?: string | null
): WorkOrder | null {
  const template = getWorkOrderTemplate(templateId);
  if (!template) return null;

  return createWorkOrder({
    equipmentId,
    templateId,
    title: template.name,
    description: template.description,
    type: template.type,
    priority: template.priority,
    status: 'open',
    scheduledStart: scheduledStart || null,
    scheduledEnd: null,
    actualStart: null,
    actualEnd: null,
    estimatedHours: template.estimatedHours,
    actualHours: null,
    technician: technician || null,
    partsRequired: template.partsRequired,
    notes: template.checklist ? `Checklist:\n${template.checklist}` : null,
  });
}

function mapRowToTemplate(row: Record<string, unknown>): WorkOrderTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | null,
    type: row.type as WorkOrderType,
    priority: row.priority as WorkOrderPriority,
    estimatedHours: row.estimated_hours as number | null,
    partsRequired: row.parts_required as string | null,
    checklist: row.checklist as string | null,
    equipmentType: row.equipment_type as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
