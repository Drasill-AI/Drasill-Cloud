/**
 * Database module for Deal Management
 * Uses better-sqlite3 for synchronous SQLite access
 */

import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import type { Deal, DealActivity, DealStage, DealActivityType, PipelineAnalytics, ChatSession, ChatSessionFull, ChatMessage, ChatSessionSource, ActivitySource, KnowledgeProfile, KnowledgeDocument, DocumentTemplate, GeneratedMemo } from '@drasill/shared';

let db: Database.Database | null = null;

/**
 * Get the database file path
 */
function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'drasill.db');
}

/**
 * Initialize the database connection and schema
 */
export function initDatabase(): void {
  if (db) return;
  
  const dbPath = getDbPath();
  console.log('Initializing database at:', dbPath);
  
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON'); // Enable foreign key enforcement
  db.pragma('busy_timeout = 5000'); // Wait up to 5 seconds if database is locked
  
  initializeSchema();
  initializeDefaultProfiles();
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    // Ensure WAL is checkpointed before closing
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (err) {
      console.error('Failed to checkpoint WAL:', err);
    }
    db.close();
    db = null;
  }
}

/**
 * Backup the database to a timestamped file
 * Keeps the last 5 backups
 */
export function backupDatabase(): string | null {
  if (!db) return null;
  
  const fs = require('fs');
  const userDataPath = app.getPath('userData');
  const backupDir = path.join(userDataPath, 'backups');
  
  // Create backup directory if it doesn't exist
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  // Create backup filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `drasill-backup-${timestamp}.db`);
  
  try {
    // Use SQLite backup API for safe backup
    db.backup(backupPath);
    console.log(`Database backed up to: ${backupPath}`);
    
    // Clean up old backups (keep last 5)
    const backups = fs.readdirSync(backupDir)
      .filter((f: string) => f.startsWith('drasill-backup-') && f.endsWith('.db'))
      .sort()
      .reverse();
    
    for (let i = 5; i < backups.length; i++) {
      const oldBackup = path.join(backupDir, backups[i]);
      fs.unlinkSync(oldBackup);
      console.log(`Deleted old backup: ${backups[i]}`);
    }
    
    return backupPath;
  } catch (err) {
    console.error('Database backup failed:', err);
    return null;
  }
}

/**
 * Get the database instance
 */
export function getDatabase(): Database.Database | null {
  return db;
}

/**
 * Initialize database schema
 */
function initializeSchema(): void {
  if (!db) return;

  db.exec(`
    -- Deals table
    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      deal_number TEXT NOT NULL UNIQUE,
      borrower_name TEXT NOT NULL,
      borrower_contact TEXT,
      loan_amount REAL NOT NULL DEFAULT 0,
      interest_rate REAL,
      term_months INTEGER,
      collateral_description TEXT,
      stage TEXT DEFAULT 'lead' CHECK(stage IN ('lead', 'application', 'underwriting', 'approved', 'funded', 'closed', 'declined')),
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
      assigned_to TEXT,
      document_path TEXT,
      notes TEXT,
      expected_close_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Deal activities table
    CREATE TABLE IF NOT EXISTS deal_activities (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('note', 'call', 'email', 'document', 'meeting')),
      description TEXT NOT NULL,
      performed_by TEXT,
      performed_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
    CREATE INDEX IF NOT EXISTS idx_deals_borrower ON deals(borrower_name);
    CREATE INDEX IF NOT EXISTS idx_activities_deal ON deal_activities(deal_id);
    CREATE INDEX IF NOT EXISTS idx_activities_type ON deal_activities(type);

    -- Chat sessions table
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      deal_id TEXT,
      deal_name TEXT,
      sources TEXT DEFAULT '[]',
      message_count INTEGER DEFAULT 0,
      first_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL
    );

    -- Chat messages table
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      rag_sources TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );

    -- Chat session indexes
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_deal ON chat_sessions(deal_id);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

    -- Activity sources table (for document citations)
    CREATE TABLE IF NOT EXISTS activity_sources (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      section TEXT,
      page_number INTEGER,
      source TEXT,
      onedrive_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (activity_id) REFERENCES deal_activities(id) ON DELETE CASCADE
    );

    -- Activity sources index
    CREATE INDEX IF NOT EXISTS idx_activity_sources_activity ON activity_sources(activity_id);

    -- Deal-document associations (many-to-many)
    CREATE TABLE IF NOT EXISTS deal_documents (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT,
      auto_detected INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
      UNIQUE(deal_id, file_path)
    );

    -- Deal documents indexes
    CREATE INDEX IF NOT EXISTS idx_deal_documents_deal ON deal_documents(deal_id);
    CREATE INDEX IF NOT EXISTS idx_deal_documents_path ON deal_documents(file_path);

    -- App settings table (for user preferences like relevance thresholds)
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Knowledge profiles table (investment strategies with soft guardrails)
    CREATE TABLE IF NOT EXISTS knowledge_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('base', 'cre', 'pe', 'vc', 'c_and_i', 'sba', 'custom')),
      description TEXT,
      parent_id TEXT,
      guidelines TEXT NOT NULL,
      terminology TEXT,
      compliance_checks TEXT,
      is_active INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES knowledge_profiles(id) ON DELETE SET NULL
    );

    -- Knowledge documents table (documents associated with profiles)
    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      category TEXT DEFAULT 'other' CHECK(category IN ('policy', 'procedure', 'guideline', 'example', 'template', 'other')),
      description TEXT,
      is_indexed INTEGER DEFAULT 0,
      source TEXT DEFAULT 'local' CHECK(source IN ('local', 'onedrive')),
      onedrive_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (profile_id) REFERENCES knowledge_profiles(id) ON DELETE CASCADE
    );

    -- Document templates table (for memo generation)
    CREATE TABLE IF NOT EXISTS document_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      template_type TEXT NOT NULL CHECK(template_type IN ('credit_memo', 'ic_report', 'approval_letter', 'term_sheet', 'commitment_letter', 'custom')),
      profile_id TEXT,
      content TEXT,
      file_path TEXT,
      required_sections TEXT DEFAULT '[]',
      ai_instructions TEXT,
      default_fields TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (profile_id) REFERENCES knowledge_profiles(id) ON DELETE SET NULL
    );

    -- Generated memos table
    CREATE TABLE IF NOT EXISTS generated_memos (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      template_name TEXT,
      profile_id TEXT,
      content TEXT NOT NULL,
      manual_fields TEXT DEFAULT '{}',
      inferred_fields TEXT DEFAULT '{}',
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'final', 'exported')),
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES document_templates(id) ON DELETE SET NULL,
      FOREIGN KEY (profile_id) REFERENCES knowledge_profiles(id) ON DELETE SET NULL
    );

    -- Knowledge base indexes
    CREATE INDEX IF NOT EXISTS idx_knowledge_profiles_type ON knowledge_profiles(type);
    CREATE INDEX IF NOT EXISTS idx_knowledge_profiles_active ON knowledge_profiles(is_active);
    CREATE INDEX IF NOT EXISTS idx_knowledge_docs_profile ON knowledge_documents(profile_id);
    CREATE INDEX IF NOT EXISTS idx_templates_profile ON document_templates(profile_id);
    CREATE INDEX IF NOT EXISTS idx_templates_type ON document_templates(template_type);
    CREATE INDEX IF NOT EXISTS idx_memos_deal ON generated_memos(deal_id);
    CREATE INDEX IF NOT EXISTS idx_memos_template ON generated_memos(template_id);
  `);
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Generate deal number
 */
function generateDealNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DEAL-${year}-${random}`;
}

// =============================================================================
// DEAL OPERATIONS
// =============================================================================

// Valid stage and priority values
const VALID_STAGES = ['lead', 'application', 'underwriting', 'approved', 'funded', 'closed', 'declined'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];

/**
 * Validate deal data before insert/update
 */
function validateDealData(data: Partial<Deal>): void {
  // Validate loan amount (must be non-negative number)
  if (data.loanAmount !== undefined && data.loanAmount !== null) {
    const amount = Number(data.loanAmount);
    if (isNaN(amount) || amount < 0) {
      throw new Error('Loan amount must be a non-negative number');
    }
    // Cap at reasonable maximum (1 trillion)
    if (amount > 1_000_000_000_000) {
      throw new Error('Loan amount exceeds maximum allowed value');
    }
  }

  // Validate interest rate (0-100%)
  if (data.interestRate !== undefined && data.interestRate !== null) {
    const rate = Number(data.interestRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      throw new Error('Interest rate must be between 0 and 100');
    }
  }

  // Validate term months (positive integer, max 600 = 50 years)
  if (data.termMonths !== undefined && data.termMonths !== null) {
    const months = Number(data.termMonths);
    if (isNaN(months) || months < 0 || months > 600 || !Number.isInteger(months)) {
      throw new Error('Term months must be a positive integer (max 600)');
    }
  }

  // Validate stage
  if (data.stage !== undefined && data.stage !== null) {
    if (!VALID_STAGES.includes(data.stage)) {
      throw new Error(`Invalid stage. Must be one of: ${VALID_STAGES.join(', ')}`);
    }
  }

  // Validate priority
  if (data.priority !== undefined && data.priority !== null) {
    if (!VALID_PRIORITIES.includes(data.priority)) {
      throw new Error(`Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }
  }

  // Validate borrower name length
  if (data.borrowerName !== undefined && data.borrowerName !== null) {
    if (data.borrowerName.length > 500) {
      throw new Error('Borrower name too long (max 500 characters)');
    }
  }
}

/**
 * Create a new deal
 */
export function createDeal(data: Partial<Deal>): Deal {
  if (!db) throw new Error('Database not initialized');
  
  // Validate data
  validateDealData(data);
  
  const id = generateId();
  const dealNumber = data.dealNumber || generateDealNumber();
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO deals (id, deal_number, borrower_name, borrower_contact, loan_amount, interest_rate, term_months, collateral_description, stage, priority, assigned_to, document_path, notes, expected_close_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    dealNumber,
    data.borrowerName || 'Unknown',
    data.borrowerContact || null,
    data.loanAmount || 0,
    data.interestRate || null,
    data.termMonths || null,
    data.collateralDescription || null,
    data.stage || 'lead',
    data.priority || 'medium',
    data.assignedTo || null,
    data.documentPath || null,
    data.notes || null,
    data.expectedCloseDate || null,
    now,
    now
  );
  
  return getDeal(id)!;
}

/**
 * Get a deal by ID
 */
export function getDeal(id: string): Deal | null {
  if (!db) throw new Error('Database not initialized');
  
  const row = db.prepare('SELECT * FROM deals WHERE id = ?').get(id) as any;
  if (!row) return null;
  
  return mapRowToDeal(row);
}

/**
 * Get all deals
 */
export function getAllDeals(): Deal[] {
  if (!db) throw new Error('Database not initialized');
  
  const rows = db.prepare('SELECT * FROM deals ORDER BY updated_at DESC').all() as any[];
  return rows.map(mapRowToDeal);
}

/**
 * Update a deal
 */
export function updateDeal(id: string, data: Partial<Deal>): Deal | null {
  if (!db) throw new Error('Database not initialized');
  
  // Validate data
  validateDealData(data);
  
  const existing = getDeal(id);
  if (!existing) return null;
  
  const now = new Date().toISOString();
  
  // Use transaction to ensure atomic update of deal + activity
  const transaction = db.transaction(() => {
    // Auto-create activity if stage changed
    if (data.stage && data.stage !== existing.stage) {
      createDealActivity({
        dealId: id,
        type: 'note',
        description: `Stage changed from "${existing.stage}" to "${data.stage}"`,
        performedBy: 'System'
      });
    }
    
    const stmt = db!.prepare(`
      UPDATE deals SET
        borrower_name = COALESCE(?, borrower_name),
        borrower_contact = COALESCE(?, borrower_contact),
        loan_amount = COALESCE(?, loan_amount),
        interest_rate = COALESCE(?, interest_rate),
        term_months = COALESCE(?, term_months),
        collateral_description = COALESCE(?, collateral_description),
        stage = COALESCE(?, stage),
        priority = COALESCE(?, priority),
        assigned_to = COALESCE(?, assigned_to),
        document_path = COALESCE(?, document_path),
        notes = COALESCE(?, notes),
        expected_close_date = COALESCE(?, expected_close_date),
        updated_at = ?
      WHERE id = ?
    `);
    
    stmt.run(
      data.borrowerName,
      data.borrowerContact,
      data.loanAmount,
      data.interestRate,
      data.termMonths,
      data.collateralDescription,
      data.stage,
      data.priority,
      data.assignedTo,
      data.documentPath,
      data.notes,
    data.expectedCloseDate,
    now,
    id
  );
  });
  
  transaction();
  
  return getDeal(id);
}

/**
 * Delete a deal
 */
export function deleteDeal(id: string): boolean {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.prepare('DELETE FROM deals WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Detect deal from file path
 */
export function detectDealFromPath(filePath: string): Deal | null {
  if (!db) throw new Error('Database not initialized');
  
  // Try to match by document_path
  const byPath = db.prepare('SELECT * FROM deals WHERE document_path = ?').get(filePath) as any;
  if (byPath) return mapRowToDeal(byPath);
  
  // Try to match by folder structure
  const pathParts = filePath.split(/[/\\]/);
  for (const part of pathParts.reverse()) {
    const byName = db.prepare('SELECT * FROM deals WHERE borrower_name LIKE ?').get(`%${part}%`) as any;
    if (byName) return mapRowToDeal(byName);
    
    const byNumber = db.prepare('SELECT * FROM deals WHERE deal_number LIKE ?').get(`%${part}%`) as any;
    if (byNumber) return mapRowToDeal(byNumber);
  }
  
  return null;
}

// =============================================================================
// DEAL-DOCUMENT ASSOCIATIONS
// =============================================================================

export interface DealDocument {
  id: string;
  dealId: string;
  filePath: string;
  fileName?: string;
  autoDetected: boolean;
  createdAt?: string;
}

/**
 * Add a document association to a deal
 */
export function addDealDocument(dealId: string, filePath: string, fileName?: string, autoDetected = true): DealDocument | null {
  if (!db) throw new Error('Database not initialized');
  
  try {
    const id = generateId();
    const name = fileName || path.basename(filePath);
    db.prepare(`
      INSERT OR IGNORE INTO deal_documents (id, deal_id, file_path, file_name, auto_detected)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, dealId, filePath, name, autoDetected ? 1 : 0);
    
    return { id, dealId, filePath, fileName: name, autoDetected };
  } catch (err) {
    console.error('[DB] Failed to add deal document:', err);
    return null;
  }
}

/**
 * Remove a document association from a deal
 */
export function removeDealDocument(dealId: string, filePath: string): boolean {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.prepare('DELETE FROM deal_documents WHERE deal_id = ? AND file_path = ?').run(dealId, filePath);
  return result.changes > 0;
}

/**
 * Get all documents associated with a deal
 */
export function getDealDocuments(dealId: string): DealDocument[] {
  if (!db) throw new Error('Database not initialized');
  
  const rows = db.prepare('SELECT * FROM deal_documents WHERE deal_id = ? ORDER BY created_at DESC').all(dealId) as any[];
  return rows.map(row => ({
    id: row.id,
    dealId: row.deal_id,
    filePath: row.file_path,
    fileName: row.file_name,
    autoDetected: row.auto_detected === 1,
    createdAt: row.created_at,
  }));
}

/**
 * Get all deal IDs associated with a document path
 */
export function getDealsForDocument(filePath: string): string[] {
  if (!db) throw new Error('Database not initialized');
  
  const rows = db.prepare('SELECT deal_id FROM deal_documents WHERE file_path = ?').all(filePath) as any[];
  return rows.map(row => row.deal_id);
}

/**
 * Check if a file path is associated with a specific deal
 */
export function isDocumentAssociatedWithDeal(filePath: string, dealId: string): boolean {
  if (!db) throw new Error('Database not initialized');
  
  const row = db.prepare('SELECT 1 FROM deal_documents WHERE deal_id = ? AND file_path = ?').get(dealId, filePath);
  return !!row;
}

/**
 * Auto-detect and associate documents based on deal's document_path folder
 */
export function detectAndAssociateDocuments(dealId: string): number {
  if (!db) throw new Error('Database not initialized');
  
  const deal = getDeal(dealId);
  if (!deal || !deal.documentPath) return 0;
  
  let count = 0;
  
  // Associate the folder itself
  const result = addDealDocument(dealId, deal.documentPath, undefined, true);
  if (result) count++;
  
  // Also try to find documents in parent folders that match deal name/number
  const pathParts = deal.documentPath.split(/[/\\]/);
  for (let i = pathParts.length - 1; i >= 0; i--) {
    const part = pathParts[i].toLowerCase();
    if (part.includes(deal.borrowerName.toLowerCase()) || 
        part.includes(deal.dealNumber.toLowerCase())) {
      const folderPath = pathParts.slice(0, i + 1).join(path.sep);
      const folderResult = addDealDocument(dealId, folderPath, undefined, true);
      if (folderResult) count++;
      break;
    }
  }
  
  return count;
}

/**
 * Associate all files in a folder with a deal (for explicit folder selection)
 */
export function associateFolderWithDeal(dealId: string, folderPath: string): number {
  if (!db) throw new Error('Database not initialized');
  
  // Add the folder path itself as an association
  const result = addDealDocument(dealId, folderPath, path.basename(folderPath), false);
  return result ? 1 : 0;
}

// =============================================================================
// APP SETTINGS
// =============================================================================

/**
 * Get an app setting
 */
export function getSetting(key: string, defaultValue?: string): string | null {
  if (!db) throw new Error('Database not initialized');
  
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as any;
  return row?.value ?? defaultValue ?? null;
}

/**
 * Set an app setting
 */
export function setSetting(key: string, value: string): void {
  if (!db) throw new Error('Database not initialized');
  
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) 
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, value);
}

/**
 * Get relevance threshold settings
 */
export function getRelevanceThresholds(): { displayThreshold: number; activityThreshold: number } {
  const display = parseFloat(getSetting('rag_display_threshold', '0.4') || '0.4');
  const activity = parseFloat(getSetting('rag_activity_threshold', '0.5') || '0.5');
  return { displayThreshold: display, activityThreshold: activity };
}

/**
 * Set relevance threshold settings
 */
export function setRelevanceThresholds(displayThreshold: number, activityThreshold: number): void {
  setSetting('rag_display_threshold', displayThreshold.toString());
  setSetting('rag_activity_threshold', activityThreshold.toString());
}

// =============================================================================
// DEAL ACTIVITY OPERATIONS
// =============================================================================

/**
 * Create a deal activity
 */
export function createDealActivity(data: Partial<DealActivity>): DealActivity {
  if (!db) throw new Error('Database not initialized');
  
  const id = generateId();
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO deal_activities (id, deal_id, type, description, performed_by, performed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    data.dealId,
    data.type || 'note',
    data.description || '',
    data.performedBy || null,
    data.performedAt || now,
    now
  );
  
  // Update deal's updated_at
  if (data.dealId) {
    db.prepare('UPDATE deals SET updated_at = ? WHERE id = ?').run(now, data.dealId);
  }
  
  return getDealActivity(id)!;
}

/**
 * Get a deal activity by ID
 */
export function getDealActivity(id: string): DealActivity | null {
  if (!db) throw new Error('Database not initialized');
  
  const row = db.prepare('SELECT * FROM deal_activities WHERE id = ?').get(id) as any;
  if (!row) return null;
  
  return mapRowToActivity(row);
}

/**
 * Get activities for a deal
 */
export function getActivitiesForDeal(dealId: string): DealActivity[] {
  if (!db) throw new Error('Database not initialized');
  
  const rows = db.prepare('SELECT * FROM deal_activities WHERE deal_id = ? ORDER BY performed_at DESC').all(dealId) as any[];
  return rows.map(mapRowToActivity);
}

/**
 * Get all activities
 */
export function getAllActivities(): DealActivity[] {
  if (!db) throw new Error('Database not initialized');
  
  const rows = db.prepare('SELECT * FROM deal_activities ORDER BY performed_at DESC').all() as any[];
  return rows.map(mapRowToActivity);
}

/**
 * Update a deal activity
 */
export function updateDealActivity(id: string, data: Partial<DealActivity>): DealActivity | null {
  if (!db) throw new Error('Database not initialized');
  
  const existing = getDealActivity(id);
  if (!existing) return null;
  
  const stmt = db.prepare(`
    UPDATE deal_activities SET
      type = COALESCE(?, type),
      description = COALESCE(?, description),
      performed_by = COALESCE(?, performed_by),
      performed_at = COALESCE(?, performed_at)
    WHERE id = ?
  `);
  
  stmt.run(
    data.type,
    data.description,
    data.performedBy,
    data.performedAt,
    id
  );
  
  return getDealActivity(id);
}

/**
 * Delete a deal activity
 */
export function deleteDealActivity(id: string): boolean {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.prepare('DELETE FROM deal_activities WHERE id = ?').run(id);
  return result.changes > 0;
}

// =============================================================================
// ACTIVITY SOURCE OPERATIONS (Document Citations)
// =============================================================================

/**
 * Add a source/citation to an activity
 */
export function addActivitySource(activityId: string, source: ActivitySource): ActivitySource {
  if (!db) throw new Error('Database not initialized');
  
  const id = generateId();
  
  const stmt = db.prepare(`
    INSERT INTO activity_sources (id, activity_id, file_name, file_path, section, page_number, source, onedrive_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    activityId,
    source.fileName,
    source.filePath,
    source.section || null,
    source.pageNumber || null,
    source.source || null,
    source.oneDriveId || null
  );
  
  return { ...source, id };
}

/**
 * Get all sources for an activity
 */
export function getActivitySources(activityId: string): ActivitySource[] {
  if (!db) throw new Error('Database not initialized');
  
  const rows = db.prepare('SELECT * FROM activity_sources WHERE activity_id = ? ORDER BY created_at').all(activityId) as any[];
  return rows.map(mapRowToSource);
}

/**
 * Remove a source from an activity
 */
export function removeActivitySource(sourceId: string): boolean {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.prepare('DELETE FROM activity_sources WHERE id = ?').run(sourceId);
  return result.changes > 0;
}

/**
 * Get activities with their sources for a deal (for export)
 */
export function getActivitiesWithSources(dealId: string): DealActivity[] {
  if (!db) throw new Error('Database not initialized');
  
  const activities = getActivitiesForDeal(dealId);
  
  // Load sources for each activity
  return activities.map(activity => ({
    ...activity,
    sources: activity.id ? getActivitySources(activity.id) : []
  }));
}

/**
 * Map database row to ActivitySource
 */
function mapRowToSource(row: any): ActivitySource {
  return {
    id: row.id,
    fileName: row.file_name,
    filePath: row.file_path,
    section: row.section || undefined,
    pageNumber: row.page_number || undefined,
    source: row.source || undefined,
    oneDriveId: row.onedrive_id || undefined
  };
}

// =============================================================================
// PIPELINE ANALYTICS
// =============================================================================

/**
 * Calculate pipeline analytics
 */
export function calculatePipelineAnalytics(): PipelineAnalytics {
  if (!db) throw new Error('Database not initialized');
  
  const stages: DealStage[] = ['lead', 'application', 'underwriting', 'approved', 'funded', 'closed', 'declined'];
  
  const byStage: Record<DealStage, { count: number; totalValue: number }> = {} as any;
  let totalDeals = 0;
  let totalPipelineValue = 0;
  
  for (const stage of stages) {
    const result = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(loan_amount), 0) as total
      FROM deals WHERE stage = ?
    `).get(stage) as { count: number; total: number };
    
    byStage[stage] = { count: result.count, totalValue: result.total };
    totalDeals += result.count;
    
    // Pipeline value excludes closed and declined
    if (!['closed', 'declined'].includes(stage)) {
      totalPipelineValue += result.total;
    }
  }
  
  // Average deal size (excluding closed and declined)
  const activeResult = db.prepare(`
    SELECT AVG(loan_amount) as avg
    FROM deals WHERE stage NOT IN ('closed', 'declined') AND loan_amount > 0
  `).get() as { avg: number | null };
  
  const averageDealSize = activeResult.avg || 0;
  
  // Recent activity count (last 7 days)
  const recentActivityResult = db.prepare(`
    SELECT COUNT(*) as count
    FROM deal_activities 
    WHERE datetime(created_at) >= datetime('now', '-7 days')
  `).get() as { count: number };
  
  const recentActivityCount = recentActivityResult.count || 0;
  
  // Deals added this month
  const dealsThisMonthResult = db.prepare(`
    SELECT COUNT(*) as count
    FROM deals 
    WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
  `).get() as { count: number };
  
  const dealsAddedThisMonth = dealsThisMonthResult.count || 0;
  
  return {
    totalDeals,
    totalPipelineValue,
    averageDealSize,
    byStage,
    recentActivityCount,
    dealsAddedThisMonth
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function mapRowToDeal(row: any): Deal {
  return {
    id: row.id,
    dealNumber: row.deal_number,
    borrowerName: row.borrower_name,
    borrowerContact: row.borrower_contact,
    loanAmount: row.loan_amount,
    interestRate: row.interest_rate,
    termMonths: row.term_months,
    collateralDescription: row.collateral_description,
    stage: row.stage as DealStage,
    priority: row.priority,
    assignedTo: row.assigned_to,
    documentPath: row.document_path,
    notes: row.notes,
    expectedCloseDate: row.expected_close_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRowToActivity(row: any): DealActivity {
  const activityId = row.id;
  return {
    id: activityId,
    dealId: row.deal_id,
    type: row.type as DealActivityType,
    description: row.description,
    performedBy: row.performed_by,
    performedAt: row.performed_at,
    createdAt: row.created_at,
    sources: activityId ? getActivitySources(activityId) : []
  };
}

// =============================================================================
// CHAT SESSION OPERATIONS
// =============================================================================

/**
 * Create a new chat session
 */
export function createChatSession(data: {
  title?: string;
  dealId?: string;
  dealName?: string;
  sources?: ChatSessionSource[];
  firstMessage?: string;
}): ChatSession {
  if (!db) throw new Error('Database not initialized');
  
  const id = generateId();
  const now = new Date().toISOString();
  const title = data.title || 'New Chat';
  const sources = JSON.stringify(data.sources || []);
  
  const stmt = db.prepare(`
    INSERT INTO chat_sessions (id, title, deal_id, deal_name, sources, message_count, first_message, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
  `);
  
  stmt.run(id, title, data.dealId || null, data.dealName || null, sources, data.firstMessage || null, now, now);
  
  return getChatSession(id)!;
}

/**
 * Get a chat session by ID (without messages)
 */
export function getChatSession(id: string): ChatSession | null {
  if (!db) throw new Error('Database not initialized');
  
  const row = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as any;
  if (!row) return null;
  
  return mapRowToChatSession(row);
}

/**
 * Get a chat session with all messages
 */
export function getChatSessionFull(id: string): ChatSessionFull | null {
  if (!db) throw new Error('Database not initialized');
  
  const session = getChatSession(id);
  if (!session) return null;
  
  const messages = getChatSessionMessages(id);
  
  return { ...session, messages };
}

/**
 * Get all chat sessions (without messages)
 */
export function getAllChatSessions(): ChatSession[] {
  if (!db) throw new Error('Database not initialized');
  
  const rows = db.prepare('SELECT * FROM chat_sessions ORDER BY updated_at DESC').all() as any[];
  return rows.map(mapRowToChatSession);
}

/**
 * Update a chat session
 */
export function updateChatSession(id: string, data: Partial<{
  title: string;
  dealId: string | null;
  dealName: string | null;
  sources: ChatSessionSource[];
}>): ChatSession | null {
  if (!db) throw new Error('Database not initialized');
  
  const existing = getChatSession(id);
  if (!existing) return null;
  
  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = ?'];
  const values: any[] = [now];
  
  if (data.title !== undefined) {
    updates.push('title = ?');
    values.push(data.title);
  }
  if (data.dealId !== undefined) {
    updates.push('deal_id = ?');
    values.push(data.dealId);
  }
  if (data.dealName !== undefined) {
    updates.push('deal_name = ?');
    values.push(data.dealName);
  }
  if (data.sources !== undefined) {
    updates.push('sources = ?');
    values.push(JSON.stringify(data.sources));
  }
  
  values.push(id);
  
  db.prepare(`UPDATE chat_sessions SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  
  return getChatSession(id);
}

/**
 * Delete a chat session and all its messages
 */
export function deleteChatSession(id: string): boolean {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Add a message to a chat session
 */
export function addChatMessage(sessionId: string, message: ChatMessage): ChatMessage {
  if (!db) throw new Error('Database not initialized');
  
  const id = message.id || generateId();
  const ragSources = JSON.stringify(message.ragSources || []);
  
  const stmt = db.prepare(`
    INSERT INTO chat_messages (id, session_id, role, content, timestamp, rag_sources)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(id, sessionId, message.role, message.content, message.timestamp, ragSources);
  
  // Update session message count and first message if needed
  const session = getChatSession(sessionId);
  if (session) {
    const updateStmt = db.prepare(`
      UPDATE chat_sessions 
      SET message_count = message_count + 1,
          first_message = COALESCE(first_message, ?),
          updated_at = datetime('now')
      WHERE id = ?
    `);
    updateStmt.run(message.role === 'user' ? message.content.slice(0, 100) : null, sessionId);
  }
  
  return { ...message, id };
}

/**
 * Get all messages for a chat session
 */
export function getChatSessionMessages(sessionId: string): ChatMessage[] {
  if (!db) throw new Error('Database not initialized');
  
  const rows = db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY timestamp ASC').all(sessionId) as any[];
  return rows.map(mapRowToChatMessage);
}

/**
 * Generate title from first message using simple extraction
 */
export function generateSessionTitle(firstMessage: string): string {
  // Take first 50 chars, trim, and add ellipsis if needed
  const cleaned = firstMessage.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 50) return cleaned;
  return cleaned.slice(0, 47) + '...';
}

// =============================================================================
// CHAT SESSION HELPERS
// =============================================================================

function mapRowToChatSession(row: any): ChatSession {
  return {
    id: row.id,
    title: row.title,
    dealId: row.deal_id,
    dealName: row.deal_name,
    sources: JSON.parse(row.sources || '[]'),
    messageCount: row.message_count,
    firstMessage: row.first_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRowToChatMessage(row: any): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    timestamp: row.timestamp,
    ragSources: JSON.parse(row.rag_sources || '[]')
  };
}

// =============================================================================
// KNOWLEDGE PROFILE OPERATIONS
// =============================================================================

/**
 * Initialize default knowledge profiles if none exist
 */
export function initializeDefaultProfiles(): void {
  if (!db) throw new Error('Database not initialized');
  
  // Check if any profiles exist
  const count = db.prepare('SELECT COUNT(*) as count FROM knowledge_profiles').get() as { count: number };
  if (count.count > 0) return;
  
  // Import defaults at runtime to avoid circular dependency
  const { DEFAULT_KNOWLEDGE_PROFILES, DEFAULT_DOCUMENT_TEMPLATES } = require('@drasill/shared');
  
  // Insert default profiles
  const profileStmt = db.prepare(`
    INSERT INTO knowledge_profiles (id, name, type, description, parent_id, guidelines, terminology, compliance_checks, is_active, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  
  for (const profile of DEFAULT_KNOWLEDGE_PROFILES) {
    const id = generateId();
    profileStmt.run(
      id,
      profile.name,
      profile.type,
      profile.description || null,
      profile.parentId || null,
      profile.guidelines,
      profile.terminology || null,
      profile.complianceChecks || null,
      profile.isActive ? 1 : 0,
      profile.sortOrder
    );
  }
  
  // Insert default templates
  const templateStmt = db.prepare(`
    INSERT INTO document_templates (id, name, template_type, profile_id, content, file_path, required_sections, ai_instructions, default_fields, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  
  for (const template of DEFAULT_DOCUMENT_TEMPLATES) {
    const id = generateId();
    templateStmt.run(
      id,
      template.name,
      template.templateType,
      template.profileId || null,
      template.content || null,
      template.filePath || null,
      JSON.stringify(template.requiredSections || []),
      template.aiInstructions || null,
      JSON.stringify(template.defaultFields || []),
      template.isActive ? 1 : 0
    );
  }
  
  console.log('Initialized default knowledge profiles and templates');
}

/**
 * Create a knowledge profile
 */
export function createKnowledgeProfile(data: Partial<KnowledgeProfile>): KnowledgeProfile {
  if (!db) throw new Error('Database not initialized');
  
  const id = generateId();
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO knowledge_profiles (id, name, type, description, parent_id, guidelines, terminology, compliance_checks, is_active, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    data.name || 'New Profile',
    data.type || 'custom',
    data.description || null,
    data.parentId || null,
    data.guidelines || '',
    data.terminology || null,
    data.complianceChecks || null,
    data.isActive ? 1 : 0,
    data.sortOrder || 0,
    now,
    now
  );
  
  return getKnowledgeProfile(id)!;
}

/**
 * Get a knowledge profile by ID
 */
export function getKnowledgeProfile(id: string): KnowledgeProfile | null {
  if (!db) throw new Error('Database not initialized');
  
  const row = db.prepare('SELECT * FROM knowledge_profiles WHERE id = ?').get(id) as any;
  if (!row) return null;
  
  return mapRowToKnowledgeProfile(row);
}

/**
 * Get all knowledge profiles
 */
export function getAllKnowledgeProfiles(): KnowledgeProfile[] {
  if (!db) throw new Error('Database not initialized');
  
  const rows = db.prepare('SELECT * FROM knowledge_profiles ORDER BY sort_order ASC, name ASC').all() as any[];
  return rows.map(mapRowToKnowledgeProfile);
}

/**
 * Get the currently active knowledge profile
 */
export function getActiveKnowledgeProfile(): KnowledgeProfile | null {
  if (!db) throw new Error('Database not initialized');
  
  const row = db.prepare('SELECT * FROM knowledge_profiles WHERE is_active = 1').get() as any;
  if (!row) return null;
  
  return mapRowToKnowledgeProfile(row);
}

/**
 * Get the active profile with inherited guidelines from parent
 */
export function getActiveProfileWithInheritance(): { profile: KnowledgeProfile | null; fullGuidelines: string } {
  const active = getActiveKnowledgeProfile();
  if (!active) return { profile: null, fullGuidelines: '' };
  
  let guidelines = active.guidelines;
  
  // If there's a parent, prepend parent guidelines
  if (active.parentId) {
    const parent = getKnowledgeProfile(active.parentId);
    if (parent) {
      guidelines = `${parent.guidelines}\n\n--- ${active.name} Specific Guidelines ---\n${active.guidelines}`;
    }
  }
  
  return { profile: active, fullGuidelines: guidelines };
}

/**
 * Set a profile as the active one (deactivates others)
 */
export function setActiveKnowledgeProfile(id: string | null): boolean {
  if (!db) throw new Error('Database not initialized');
  
  // Deactivate all profiles first
  db.prepare('UPDATE knowledge_profiles SET is_active = 0').run();
  
  // If id provided, activate that profile
  if (id) {
    const result = db.prepare('UPDATE knowledge_profiles SET is_active = 1 WHERE id = ?').run(id);
    return result.changes > 0;
  }
  
  return true;
}

/**
 * Update a knowledge profile
 */
export function updateKnowledgeProfile(id: string, data: Partial<KnowledgeProfile>): KnowledgeProfile | null {
  if (!db) throw new Error('Database not initialized');
  
  const existing = getKnowledgeProfile(id);
  if (!existing) return null;
  
  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = ?'];
  const values: any[] = [now];
  
  if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
  if (data.type !== undefined) { updates.push('type = ?'); values.push(data.type); }
  if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
  if (data.parentId !== undefined) { updates.push('parent_id = ?'); values.push(data.parentId); }
  if (data.guidelines !== undefined) { updates.push('guidelines = ?'); values.push(data.guidelines); }
  if (data.terminology !== undefined) { updates.push('terminology = ?'); values.push(data.terminology); }
  if (data.complianceChecks !== undefined) { updates.push('compliance_checks = ?'); values.push(data.complianceChecks); }
  if (data.sortOrder !== undefined) { updates.push('sort_order = ?'); values.push(data.sortOrder); }
  
  values.push(id);
  
  db.prepare(`UPDATE knowledge_profiles SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  
  return getKnowledgeProfile(id);
}

/**
 * Delete a knowledge profile
 */
export function deleteKnowledgeProfile(id: string): boolean {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.prepare('DELETE FROM knowledge_profiles WHERE id = ?').run(id);
  return result.changes > 0;
}

function mapRowToKnowledgeProfile(row: any): KnowledgeProfile {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    parentId: row.parent_id,
    guidelines: row.guidelines,
    terminology: row.terminology,
    complianceChecks: row.compliance_checks,
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// =============================================================================
// KNOWLEDGE DOCUMENT OPERATIONS
// =============================================================================

/**
 * Add a document to a knowledge profile
 */
export function addKnowledgeDocument(data: Partial<KnowledgeDocument>): KnowledgeDocument {
  if (!db) throw new Error('Database not initialized');
  
  const id = generateId();
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO knowledge_documents (id, profile_id, file_name, file_path, category, description, is_indexed, source, onedrive_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    data.profileId,
    data.fileName || 'Unknown',
    data.filePath || '',
    data.category || 'other',
    data.description || null,
    data.isIndexed ? 1 : 0,
    data.source || 'local',
    data.oneDriveId || null,
    now
  );
  
  return getKnowledgeDocument(id)!;
}

/**
 * Get a knowledge document by ID
 */
export function getKnowledgeDocument(id: string): KnowledgeDocument | null {
  if (!db) throw new Error('Database not initialized');
  
  const row = db.prepare('SELECT * FROM knowledge_documents WHERE id = ?').get(id) as any;
  if (!row) return null;
  
  return mapRowToKnowledgeDocument(row);
}

/**
 * Get all documents for a profile
 */
export function getKnowledgeDocumentsByProfile(profileId: string): KnowledgeDocument[] {
  if (!db) throw new Error('Database not initialized');
  
  const rows = db.prepare('SELECT * FROM knowledge_documents WHERE profile_id = ? ORDER BY file_name ASC').all(profileId) as any[];
  return rows.map(mapRowToKnowledgeDocument);
}

/**
 * Update a knowledge document
 */
export function updateKnowledgeDocument(id: string, data: Partial<KnowledgeDocument>): KnowledgeDocument | null {
  if (!db) throw new Error('Database not initialized');
  
  const existing = getKnowledgeDocument(id);
  if (!existing) return null;
  
  const updates: string[] = [];
  const values: any[] = [];
  
  if (data.category !== undefined) { updates.push('category = ?'); values.push(data.category); }
  if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
  if (data.isIndexed !== undefined) { updates.push('is_indexed = ?'); values.push(data.isIndexed ? 1 : 0); }
  
  if (updates.length === 0) return existing;
  
  values.push(id);
  
  db.prepare(`UPDATE knowledge_documents SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  
  return getKnowledgeDocument(id);
}

/**
 * Remove a knowledge document
 */
export function removeKnowledgeDocument(id: string): boolean {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(id);
  return result.changes > 0;
}

function mapRowToKnowledgeDocument(row: any): KnowledgeDocument {
  return {
    id: row.id,
    profileId: row.profile_id,
    fileName: row.file_name,
    filePath: row.file_path,
    category: row.category,
    description: row.description,
    isIndexed: row.is_indexed === 1,
    source: row.source,
    oneDriveId: row.onedrive_id,
    createdAt: row.created_at
  };
}

// =============================================================================
// DOCUMENT TEMPLATE OPERATIONS
// =============================================================================

/**
 * Create a document template
 */
export function createDocumentTemplate(data: Partial<DocumentTemplate>): DocumentTemplate {
  if (!db) throw new Error('Database not initialized');
  
  const id = generateId();
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO document_templates (id, name, template_type, profile_id, content, file_path, required_sections, ai_instructions, default_fields, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    data.name || 'New Template',
    data.templateType || 'custom',
    data.profileId || null,
    data.content || null,
    data.filePath || null,
    JSON.stringify(data.requiredSections || []),
    data.aiInstructions || null,
    JSON.stringify(data.defaultFields || []),
    data.isActive ? 1 : 0,
    now,
    now
  );
  
  return getDocumentTemplate(id)!;
}

/**
 * Get a document template by ID
 */
export function getDocumentTemplate(id: string): DocumentTemplate | null {
  if (!db) throw new Error('Database not initialized');
  
  const row = db.prepare('SELECT * FROM document_templates WHERE id = ?').get(id) as any;
  if (!row) return null;
  
  return mapRowToDocumentTemplate(row);
}

/**
 * Get all document templates
 */
export function getAllDocumentTemplates(): DocumentTemplate[] {
  if (!db) throw new Error('Database not initialized');
  
  const rows = db.prepare('SELECT * FROM document_templates ORDER BY name ASC').all() as any[];
  return rows.map(mapRowToDocumentTemplate);
}

/**
 * Get templates for a specific profile (plus global templates)
 */
export function getTemplatesForProfile(profileId: string | null): DocumentTemplate[] {
  if (!db) throw new Error('Database not initialized');
  
  let query = 'SELECT * FROM document_templates WHERE is_active = 1 AND (profile_id IS NULL';
  const params: any[] = [];
  
  if (profileId) {
    query += ' OR profile_id = ?';
    params.push(profileId);
  }
  
  query += ') ORDER BY name ASC';
  
  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(mapRowToDocumentTemplate);
}

/**
 * Update a document template
 */
export function updateDocumentTemplate(id: string, data: Partial<DocumentTemplate>): DocumentTemplate | null {
  if (!db) throw new Error('Database not initialized');
  
  const existing = getDocumentTemplate(id);
  if (!existing) return null;
  
  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = ?'];
  const values: any[] = [now];
  
  if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
  if (data.templateType !== undefined) { updates.push('template_type = ?'); values.push(data.templateType); }
  if (data.profileId !== undefined) { updates.push('profile_id = ?'); values.push(data.profileId); }
  if (data.content !== undefined) { updates.push('content = ?'); values.push(data.content); }
  if (data.filePath !== undefined) { updates.push('file_path = ?'); values.push(data.filePath); }
  if (data.requiredSections !== undefined) { updates.push('required_sections = ?'); values.push(JSON.stringify(data.requiredSections)); }
  if (data.aiInstructions !== undefined) { updates.push('ai_instructions = ?'); values.push(data.aiInstructions); }
  if (data.defaultFields !== undefined) { updates.push('default_fields = ?'); values.push(JSON.stringify(data.defaultFields)); }
  if (data.isActive !== undefined) { updates.push('is_active = ?'); values.push(data.isActive ? 1 : 0); }
  
  values.push(id);
  
  db.prepare(`UPDATE document_templates SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  
  return getDocumentTemplate(id);
}

/**
 * Delete a document template
 */
export function deleteDocumentTemplate(id: string): boolean {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.prepare('DELETE FROM document_templates WHERE id = ?').run(id);
  return result.changes > 0;
}

function mapRowToDocumentTemplate(row: any): DocumentTemplate {
  return {
    id: row.id,
    name: row.name,
    templateType: row.template_type,
    profileId: row.profile_id,
    content: row.content,
    filePath: row.file_path,
    requiredSections: JSON.parse(row.required_sections || '[]'),
    aiInstructions: row.ai_instructions,
    defaultFields: JSON.parse(row.default_fields || '[]'),
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// =============================================================================
// GENERATED MEMO OPERATIONS
// =============================================================================

/**
 * Create a generated memo
 */
export function createGeneratedMemo(data: Partial<GeneratedMemo>): GeneratedMemo {
  if (!db) throw new Error('Database not initialized');
  
  const id = generateId();
  const now = new Date().toISOString();
  
  // Get template name if not provided
  let templateName = data.templateName;
  if (!templateName && data.templateId) {
    const template = getDocumentTemplate(data.templateId);
    templateName = template?.name;
  }
  
  const stmt = db.prepare(`
    INSERT INTO generated_memos (id, deal_id, template_id, template_name, profile_id, content, manual_fields, inferred_fields, status, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    data.dealId,
    data.templateId,
    templateName || null,
    data.profileId || null,
    data.content || '',
    JSON.stringify(data.manualFields || {}),
    JSON.stringify(data.inferredFields || {}),
    data.status || 'draft',
    data.version || 1,
    now,
    now
  );
  
  return getGeneratedMemo(id)!;
}

/**
 * Get a generated memo by ID
 */
export function getGeneratedMemo(id: string): GeneratedMemo | null {
  if (!db) throw new Error('Database not initialized');
  
  const row = db.prepare('SELECT * FROM generated_memos WHERE id = ?').get(id) as any;
  if (!row) return null;
  
  return mapRowToGeneratedMemo(row);
}

/**
 * Get all memos for a deal
 */
export function getMemosByDeal(dealId: string): GeneratedMemo[] {
  if (!db) throw new Error('Database not initialized');
  
  const rows = db.prepare('SELECT * FROM generated_memos WHERE deal_id = ? ORDER BY created_at DESC').all(dealId) as any[];
  return rows.map(mapRowToGeneratedMemo);
}

/**
 * Update a generated memo
 */
export function updateGeneratedMemo(id: string, data: Partial<GeneratedMemo>): GeneratedMemo | null {
  if (!db) throw new Error('Database not initialized');
  
  const existing = getGeneratedMemo(id);
  if (!existing) return null;
  
  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = ?'];
  const values: any[] = [now];
  
  if (data.content !== undefined) { updates.push('content = ?'); values.push(data.content); }
  if (data.manualFields !== undefined) { updates.push('manual_fields = ?'); values.push(JSON.stringify(data.manualFields)); }
  if (data.inferredFields !== undefined) { updates.push('inferred_fields = ?'); values.push(JSON.stringify(data.inferredFields)); }
  if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }
  if (data.version !== undefined) { updates.push('version = ?'); values.push(data.version); }
  
  values.push(id);
  
  db.prepare(`UPDATE generated_memos SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  
  return getGeneratedMemo(id);
}

/**
 * Delete a generated memo
 */
export function deleteGeneratedMemo(id: string): boolean {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.prepare('DELETE FROM generated_memos WHERE id = ?').run(id);
  return result.changes > 0;
}

function mapRowToGeneratedMemo(row: any): GeneratedMemo {
  return {
    id: row.id,
    dealId: row.deal_id,
    templateId: row.template_id,
    templateName: row.template_name,
    profileId: row.profile_id,
    content: row.content,
    manualFields: JSON.parse(row.manual_fields || '{}'),
    inferredFields: JSON.parse(row.inferred_fields || '{}'),
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
