/**
 * CSV Import/Export Utilities
 * 
 * Handles bulk equipment import and data export for fleet management.
 * Supports equipment, maintenance logs, and failure events.
 */
import * as fs from 'fs/promises';
import { dialog } from 'electron';
import { 
  Equipment, 
  MaintenanceLog, 
  EquipmentCSVRow, 
  CSVImportResult,
  CSVExportOptions,
} from '@drasill/shared';
import * as database from './database';

// ==========================================
// CSV Parsing
// ==========================================

/**
 * Parse CSV string into rows
 */
function parseCSV(content: string, delimiter: string = ','): string[][] {
  const rows: string[][] = [];
  const lines = content.split(/\r?\n/);
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    rows.push(row);
  }
  
  return rows;
}

/**
 * Convert rows to objects using header row
 */
function rowsToObjects<T>(rows: string[][], headers: string[]): Array<Partial<T>> {
  return rows.map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => {
      if (row[i] !== undefined && row[i] !== '') {
        obj[header] = row[i];
      }
    });
    return obj as Partial<T>;
  });
}

// ==========================================
// Equipment Import
// ==========================================

/**
 * Validate equipment row
 */
function validateEquipmentRow(
  row: Partial<EquipmentCSVRow>, 
  rowNumber: number
): { valid: boolean; errors: Array<{ row: number; field: string; message: string }> } {
  const errors: Array<{ row: number; field: string; message: string }> = [];
  
  if (!row.name || row.name.trim() === '') {
    errors.push({ row: rowNumber, field: 'name', message: 'Name is required' });
  }
  
  if (!row.make || row.make.trim() === '') {
    errors.push({ row: rowNumber, field: 'make', message: 'Make is required' });
  }
  
  if (!row.model || row.model.trim() === '') {
    errors.push({ row: rowNumber, field: 'model', message: 'Model is required' });
  }
  
  // Normalize status values
  if (row.status) {
    const statusMap: Record<string, 'operational' | 'maintenance' | 'down' | 'retired'> = {
      'active': 'operational',
      'inactive': 'down',
      'operational': 'operational',
      'maintenance': 'maintenance',
      'down': 'down',
      'retired': 'retired',
    };
    const normalizedStatus = statusMap[row.status.toLowerCase()];
    if (normalizedStatus) {
      row.status = normalizedStatus;
    } else {
      errors.push({ row: rowNumber, field: 'status', message: `Invalid status: ${row.status}` });
    }
  }
  
  if (row.hourlyCost !== undefined && isNaN(Number(row.hourlyCost))) {
    errors.push({ row: rowNumber, field: 'hourlyCost', message: 'Hourly cost must be a number' });
  }
  
  if (row.installDate && isNaN(Date.parse(row.installDate))) {
    errors.push({ row: rowNumber, field: 'installDate', message: 'Invalid date format' });
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Import equipment from CSV file
 */
export async function importEquipmentCSV(): Promise<CSVImportResult> {
  const result = await dialog.showOpenDialog({
    title: 'Import Equipment CSV',
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    properties: ['openFile'],
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, imported: 0, skipped: 0, errors: [] };
  }
  
  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf-8');
  const rows = parseCSV(content);
  
  if (rows.length < 2) {
    return { 
      success: false, 
      imported: 0, 
      skipped: 0, 
      errors: [{ row: 0, field: '', message: 'CSV file is empty or has no data rows' }] 
    };
  }
  
  // First row is headers
  const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, ''));
  const dataRows = rows.slice(1);
  
  // Map headers to expected fields
  const headerMap: Record<string, string> = {
    'name': 'name',
    'make': 'make',
    'model': 'model',
    'serialnumber': 'serialNumber',
    'serialnum': 'serialNumber',
    'serial': 'serialNumber',
    'serial_number': 'serialNumber',
    'location': 'location',
    'installdate': 'installDate',
    'install_date': 'installDate',
    'installed': 'installDate',
    'status': 'status',
    'hourlycost': 'hourlyCost',
    'hourlycos': 'hourlyCost',
    'hourly_cost': 'hourlyCost',
    'cost': 'hourlyCost',
  };
  
  const normalizedHeaders: string[] = headers.map(h => headerMap[h] || h);
  const objects = rowsToObjects<EquipmentCSVRow>(dataRows, normalizedHeaders);
  
  console.log('[CSV] Raw headers:', headers);
  console.log('[CSV] Normalized headers:', normalizedHeaders);
  console.log('[CSV] First row object:', objects[0]);
  
  let imported = 0;
  let skipped = 0;
  const allErrors: Array<{ row: number; field: string; message: string }> = [];
  
  const db = database.getDatabase();
  
  for (let i = 0; i < objects.length; i++) {
    const row = objects[i];
    const rowNumber = i + 2; // +2 for 1-indexed and header row
    
    const { valid, errors } = validateEquipmentRow(row, rowNumber);
    
    if (!valid) {
      console.log(`[CSV] Row ${rowNumber} validation errors:`, errors);
      allErrors.push(...errors);
      skipped++;
      continue;
    }
    
    try {
      // Check for duplicate by serial number if provided
      if (row.serialNumber) {
        const existing = db.prepare(
          'SELECT id FROM equipment WHERE serial_number = ?'
        ).get(row.serialNumber) as { id: string } | undefined;
        
        if (existing) {
          allErrors.push({ 
            row: rowNumber, 
            field: 'serialNumber', 
            message: `Duplicate serial number: ${row.serialNumber}` 
          });
          skipped++;
          continue;
        }
      }
      
      // Insert new equipment
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      
      db.prepare(`
        INSERT INTO equipment (id, name, make, model, serial_number, location, install_date, status, hourly_cost)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        row.name!.trim(),
        row.make!.trim(),
        row.model!.trim(),
        row.serialNumber?.trim() || null,
        row.location?.trim() || null,
        row.installDate || null,
        row.status || 'operational',
        row.hourlyCost !== undefined ? Number(row.hourlyCost) : 0
      );
      
      imported++;
    } catch (error) {
      allErrors.push({ 
        row: rowNumber, 
        field: '', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
      skipped++;
    }
  }
  
  return {
    success: imported > 0,
    imported,
    skipped,
    errors: allErrors,
  };
}

// ==========================================
// Equipment Export
// ==========================================

/**
 * Generate equipment CSV content
 */
function generateEquipmentCSV(equipment: Equipment[], options: CSVExportOptions = {}): string {
  const { delimiter = ',', includeHeaders = true } = options;
  
  const headers = [
    'name', 'make', 'model', 'serialNumber', 'location', 
    'installDate', 'status', 'hourlyCost', 'createdAt', 'updatedAt'
  ];
  
  const rows: string[] = [];
  
  if (includeHeaders) {
    rows.push(headers.join(delimiter));
  }
  
  for (const eq of equipment) {
    const row = [
      escapeCSV(eq.name),
      escapeCSV(eq.make),
      escapeCSV(eq.model),
      escapeCSV(eq.serialNumber || ''),
      escapeCSV(eq.location || ''),
      eq.installDate || '',
      eq.status,
      String(eq.hourlyCost),
      eq.createdAt,
      eq.updatedAt,
    ];
    rows.push(row.join(delimiter));
  }
  
  return rows.join('\n');
}

/**
 * Escape CSV value
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Export equipment to CSV file
 */
export async function exportEquipmentCSV(options: CSVExportOptions = {}): Promise<{ success: boolean; path?: string; error?: string }> {
  const result = await dialog.showSaveDialog({
    title: 'Export Equipment CSV',
    defaultPath: `equipment_export_${new Date().toISOString().split('T')[0]}.csv`,
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
  });
  
  if (result.canceled || !result.filePath) {
    return { success: false };
  }
  
  try {
    const db = database.getDatabase();
    const equipment = db.prepare('SELECT * FROM equipment ORDER BY name').all() as Equipment[];
    
    const csv = generateEquipmentCSV(equipment, options);
    await fs.writeFile(result.filePath, csv, 'utf-8');
    
    return { success: true, path: result.filePath };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// ==========================================
// Logs Export
// ==========================================

/**
 * Export maintenance logs to CSV (with equipment names)
 */
export async function exportLogsCSV(
  equipmentId?: string,
  options: CSVExportOptions = {}
): Promise<{ success: boolean; path?: string; error?: string }> {
  const result = await dialog.showSaveDialog({
    title: 'Export Maintenance Logs CSV',
    defaultPath: `maintenance_logs_${new Date().toISOString().split('T')[0]}.csv`,
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
  });
  
  if (result.canceled || !result.filePath) {
    return { success: false };
  }
  
  try {
    const db = database.getDatabase();
    const { delimiter = ',', includeHeaders = true } = options;
    
    // Join logs with equipment names
    const query = equipmentId
      ? `SELECT l.*, e.name as equipment_name, e.make, e.model 
         FROM maintenance_logs l 
         JOIN equipment e ON l.equipment_id = e.id 
         WHERE l.equipment_id = ?
         ORDER BY l.started_at DESC`
      : `SELECT l.*, e.name as equipment_name, e.make, e.model 
         FROM maintenance_logs l 
         JOIN equipment e ON l.equipment_id = e.id 
         ORDER BY l.started_at DESC`;
    
    const logs = equipmentId 
      ? db.prepare(query).all(equipmentId) as (MaintenanceLog & { equipment_name: string; make: string; model: string })[]
      : db.prepare(query).all() as (MaintenanceLog & { equipment_name: string; make: string; model: string })[];
    
    const headers = [
      'equipmentName', 'make', 'model', 'type', 'startedAt', 'completedAt',
      'durationMinutes', 'technician', 'partsUsed', 'notes', 'createdAt'
    ];
    
    const rows: string[] = [];
    
    if (includeHeaders) {
      rows.push(headers.join(delimiter));
    }
    
    for (const log of logs) {
      const row = [
        escapeCSV(log.equipment_name),
        escapeCSV(log.make),
        escapeCSV(log.model),
        log.type,
        log.startedAt,
        log.completedAt || '',
        log.durationMinutes?.toString() || '',
        escapeCSV(log.technician || ''),
        escapeCSV(log.partsUsed || ''),
        escapeCSV(log.notes || ''),
        log.createdAt,
      ];
      rows.push(row.join(delimiter));
    }
    
    const csv = rows.join('\n');
    await fs.writeFile(result.filePath, csv, 'utf-8');
    
    return { success: true, path: result.filePath };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// ==========================================
// Template Generation
// ==========================================

/**
 * Get CSV template for equipment import
 */
export function getEquipmentCSVTemplate(): string {
  const headers = 'name,make,model,serialNumber,location,installDate,status,hourlyCost';
  const example = 'Excavator 01,Caterpillar,320D,CAT123456,Site A,2020-05-15,operational,150';
  
  return `${headers}\n${example}`;
}
