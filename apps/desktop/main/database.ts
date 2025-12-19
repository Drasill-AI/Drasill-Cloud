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

  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'drasill-cloud.db');

  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  
  initializeSchema();
  
  return db;
}

/**
 * Initialize database schema
 */
function initializeSchema(): void {
  if (!db) return;

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
  `);
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
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
