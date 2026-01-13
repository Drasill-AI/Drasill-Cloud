/**
 * Represents a file or directory in the file tree
 */
export interface TreeNode {
  /** Unique identifier (full path) */
  id: string;
  /** Display name */
  name: string;
  /** Full path on disk */
  path: string;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** Child nodes (only populated for expanded directories) */
  children?: TreeNode[];
  /** Whether the directory is expanded in the UI */
  isExpanded?: boolean;
  /** File extension (for files only) */
  extension?: string;
}

/**
 * Represents an open tab in the editor
 */
export interface Tab {
  /** Unique identifier (file path or schematic ID) */
  id: string;
  /** Display name */
  name: string;
  /** Full file path (for file tabs) */
  path: string;
  /** File type for determining viewer */
  type: 'text' | 'markdown' | 'pdf' | 'word' | 'schematic' | 'image' | 'equipment' | 'workorder' | 'workorders-list' | 'unknown';
  /** Whether the tab has unsaved changes */
  isDirty?: boolean;
  /** Scroll position to restore */
  scrollPosition?: {
    scrollTop: number;
    scrollLeft: number;
  };
  /** Monaco view state for restoring cursor/selection */
  viewState?: unknown;
  /** Schematic data (only for schematic tabs) */
  schematicData?: SchematicData;
  /** Equipment ID (only for equipment tabs) */
  equipmentId?: string;
  /** Work order ID (only for work order tabs) */
  workOrderId?: string;
  /** Initial page number for PDF tabs */
  initialPage?: number;
}

/**
 * File stat information
 */
export interface FileStat {
  path: string;
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  mtime: number;
}

/**
 * Directory entry from readDir
 */
export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  extension?: string;
}

/**
 * Result of a file read operation
 */
export interface FileReadResult {
  path: string;
  content: string;
  encoding: string;
}

/**
 * Persisted app state
 */
export interface PersistedState {
  workspacePath: string | null;
  openTabs: Array<{
    id: string;
    name: string;
    path: string;
    type: 'text' | 'markdown' | 'pdf' | 'word' | 'schematic' | 'unknown';
  }>;
  activeTabId: string | null;
  sidebarWidth?: number;
  rightPanelWidth?: number;
  firstRunComplete?: boolean;
}

/**
 * IPC channel names
 */
export const IPC_CHANNELS = {
  SELECT_WORKSPACE: 'select-workspace',
  READ_DIR: 'read-dir',
  READ_FILE: 'read-file',
  READ_FILE_BINARY: 'read-file-binary',
  READ_WORD_FILE: 'read-word-file',
  STAT: 'stat',
  // Chat
  CHAT_SEND_MESSAGE: 'chat-send-message',
  CHAT_STREAM_START: 'chat-stream-start',
  CHAT_STREAM_CHUNK: 'chat-stream-chunk',
  CHAT_STREAM_END: 'chat-stream-end',
  CHAT_STREAM_ERROR: 'chat-stream-error',
  CHAT_SET_API_KEY: 'chat-set-api-key',
  CHAT_GET_API_KEY: 'chat-get-api-key',
  CHAT_CANCEL: 'chat-cancel',
  CHAT_TOOL_EXECUTED: 'chat-tool-executed',
  // RAG
  RAG_INDEX_WORKSPACE: 'rag-index-workspace',
  RAG_INDEX_PROGRESS: 'rag-index-progress',
  RAG_INDEX_COMPLETE: 'rag-index-complete',
  RAG_SEARCH: 'rag-search',
  RAG_GET_STATUS: 'rag-get-status',
  RAG_LOAD_CACHE: 'rag-load-cache',
  RAG_CLEAR: 'rag-clear',
  // State persistence
  STATE_SAVE: 'state-save',
  STATE_LOAD: 'state-load',
  // Equipment Management
  EQUIPMENT_GET_ALL: 'equipment-get-all',
  EQUIPMENT_GET: 'equipment-get',
  EQUIPMENT_ADD: 'equipment-add',
  EQUIPMENT_UPDATE: 'equipment-update',
  EQUIPMENT_DELETE: 'equipment-delete',
  EQUIPMENT_DETECT_FROM_PATH: 'equipment-detect-from-path',
  // Maintenance Logs
  LOGS_ADD: 'logs-add',
  LOGS_GET: 'logs-get',
  LOGS_GET_BY_EQUIPMENT: 'logs-get-by-equipment',
  LOGS_UPDATE: 'logs-update',
  LOGS_DELETE: 'logs-delete',
  // Failure Events
  FAILURE_ADD: 'failure-add',
  FAILURE_GET: 'failure-get',
  // Analytics
  ANALYTICS_GET: 'analytics-get',
  // Database
  DB_INIT: 'db-init',
  // File Operations
  ADD_FILES: 'add-files',
  DELETE_FILE: 'delete-file',
  // Schematics
  SCHEMATIC_PROCESS_TOOL_CALL: 'schematic-process-tool-call',
  SCHEMATIC_GET_IMAGE: 'schematic-get-image',
  // Vision - CV + GPT Hybrid
  VISION_LABEL_REGIONS: 'vision-label-regions',
  VISION_GENERATE_EXPLODED: 'vision-generate-exploded',
  // CSV Import/Export
  CSV_IMPORT_EQUIPMENT: 'csv-import-equipment',
  CSV_EXPORT_EQUIPMENT: 'csv-export-equipment',
  CSV_EXPORT_LOGS: 'csv-export-logs',
  CSV_GET_TEMPLATE: 'csv-get-template',
  // File-Equipment Associations
  FILE_ASSOC_ADD: 'file-assoc-add',
  FILE_ASSOC_REMOVE: 'file-assoc-remove',
  FILE_ASSOC_REMOVE_BY_PATH: 'file-assoc-remove-by-path',
  FILE_ASSOC_GET_FOR_EQUIPMENT: 'file-assoc-get-for-equipment',
  FILE_ASSOC_GET_FOR_FILE: 'file-assoc-get-for-file',
  // Sample Data Generation
  GENERATE_SAMPLE_ANALYTICS: 'generate-sample-analytics',
  // Work Orders
  WORK_ORDER_GET_ALL: 'work-order-get-all',
  WORK_ORDER_GET: 'work-order-get',
  WORK_ORDER_ADD: 'work-order-add',
  WORK_ORDER_UPDATE: 'work-order-update',
  WORK_ORDER_DELETE: 'work-order-delete',
  WORK_ORDER_GET_BY_EQUIPMENT: 'work-order-get-by-equipment',
  WORK_ORDER_COMPLETE: 'work-order-complete',
  // Work Order Templates
  WORK_ORDER_TEMPLATE_GET_ALL: 'work-order-template-get-all',
  WORK_ORDER_TEMPLATE_GET: 'work-order-template-get',
  WORK_ORDER_TEMPLATE_ADD: 'work-order-template-add',
  WORK_ORDER_TEMPLATE_UPDATE: 'work-order-template-update',
  WORK_ORDER_TEMPLATE_DELETE: 'work-order-template-delete',
  // PDF Text Extraction (via renderer for DOM support)
  PDF_EXTRACT_TEXT_REQUEST: 'pdf-extract-text-request',
  PDF_EXTRACT_TEXT_RESPONSE: 'pdf-extract-text-response',
} as const;

/**
 * RAG source citation
 */
export interface RAGSource {
  fileName: string;
  filePath: string;
  section: string;
  pageNumber?: number; // For PDFs, the page where content was found
}

/**
 * Chat message interface
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  ragSources?: RAGSource[];
}

/**
 * File context for chat
 */
export interface FileContext {
  fileName: string;
  filePath: string;
  fileType: string;
  content: string;
}

/**
 * Chat request payload
 */
export interface ChatRequest {
  message: string;
  context?: FileContext;
  history: ChatMessage[];
}

/**
 * Chat streaming chunk
 */
export interface ChatStreamChunk {
  id: string;
  delta: string;
  done: boolean;
}

/**
 * Ignored directories and files for the file explorer
 */
export const IGNORED_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.cache',
  'coverage',
  '__pycache__',
  '.DS_Store',
  'Thumbs.db',
];

/**
 * File extensions considered as text/code files
 */
export const TEXT_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.yaml',
  '.yml',
  '.xml',
  '.html',
  '.css',
  '.scss',
  '.less',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.rs',
  '.go',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.bat',
  '.cmd',
  '.sql',
  '.graphql',
  '.env',
  '.gitignore',
  '.dockerignore',
  '.editorconfig',
  '.prettierrc',
  '.eslintrc',
  '.csv',
  '.log',
  '.rtf',
];

/**
 * Document file extensions (shown but with special viewers)
 */
export const DOCUMENT_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
];

/**
 * Image file extensions
 */
export const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.svg',
  '.webp',
  '.tiff',
  '.tif',
];

/**
 * Binary file extensions to skip
 */
export const BINARY_EXTENSIONS = [
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.dat',
  '.db',
  '.sqlite',
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  '.mp3',
  '.mp4',
  '.wav',
  '.avi',
  '.mov',
  '.wmv',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
];

/**
 * Determine file type from extension
 */
export function getFileType(path: string): Tab['type'] {
  const ext = path.toLowerCase().split('.').pop();
  if (!ext) return 'text';
  
  if (ext === 'pdf') return 'pdf';
  if (ext === 'doc' || ext === 'docx') return 'word';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (IMAGE_EXTENSIONS.some((e) => e.endsWith(ext))) return 'image';
  if (TEXT_EXTENSIONS.some((e) => e.endsWith(ext))) return 'text';
  if (BINARY_EXTENSIONS.some((e) => e.endsWith(ext))) return 'unknown';
  
  return 'text';
}

/**
 * Check if a file/directory should be ignored
 */
export function shouldIgnore(name: string): boolean {
  return IGNORED_PATTERNS.includes(name);
}

/**
 * Get file extension from path
 */
export function getExtension(path: string): string {
  const parts = path.split('.');
  return parts.length > 1 ? `.${parts.pop()}` : '';
}

/**
 * Debounce utility
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// ==========================================
// Equipment & Maintenance Log Types
// ==========================================

/**
 * Equipment record
 */
export interface Equipment {
  id?: string;
  name: string;
  make: string;
  model: string;
  serialNumber?: string | null;
  installDate?: string | null;
  location?: string | null;
  status?: 'operational' | 'maintenance' | 'down' | 'retired';
  hourlyCost?: number;
  manualPath?: string | null;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Maintenance log entry
 */
export interface MaintenanceLog {
  id?: string;
  equipmentId: string;
  type: 'preventive' | 'corrective' | 'emergency' | 'inspection';
  startedAt: string;
  completedAt?: string | null;
  durationMinutes?: number | null;
  technician?: string | null;
  partsUsed?: string | null;
  notes?: string | null;
  createdAt?: string;
}

/**
 * Failure event record
 */
export interface FailureEvent {
  id?: string;
  equipmentId: string;
  occurredAt: string;
  resolvedAt?: string | null;
  rootCause?: string | null;
  maintenanceLogId?: string | null;
  createdAt?: string;
}

/**
 * Equipment analytics data
 */
export interface EquipmentAnalytics {
  equipmentId: string;
  mtbf: number | null; // Mean Time Between Failures (hours)
  mttr: number | null; // Mean Time To Repair (hours)
  availability: number | null; // Percentage (0-100)
  totalFailures: number;
  totalMaintenanceLogs: number;
  lastMaintenanceDate: string | null;
  lastMaintenanceType: string | null;
  predictedNextMaintenance: string | null;
  healthScore?: number; // 0-100 (computed on frontend)
}

/**
 * Log entry form data
 */
export interface LogEntryFormData {
  equipmentId: string;
  type: MaintenanceLog['type'];
  startedAt: string;
  completedAt?: string | null;
  durationMinutes?: number | null;
  technician?: string | null;
  partsUsed?: string | null;
  notes?: string | null;
}

/**
 * Failure event form data
 */
export interface FailureFormData {
  equipmentId: string;
  occurredAt: string;
  resolvedAt?: string | null;
  rootCause?: string | null;
}

/**
 * Bottom panel state for persistence
 */
export interface BottomPanelState {
  isOpen: boolean;
  height: number;
  activeTab: 'logs' | 'analytics';
}

/**
 * File-Equipment Association
 * Links files (manuals, images, etc.) to equipment
 */
export interface FileEquipmentAssociation {
  id: string;
  equipmentId: string;
  filePath: string;
  fileName: string;
  fileType: 'manual' | 'image' | 'schematic' | 'document' | 'other';
  notes?: string | null;
  createdAt: string;
}

// ==========================================
// Work Order Types
// ==========================================

/**
 * Work order status values
 */
export type WorkOrderStatus = 'draft' | 'open' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';

/**
 * Work order priority values
 */
export type WorkOrderPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Work order type values (same as maintenance log types)
 */
export type WorkOrderType = 'preventive' | 'corrective' | 'emergency' | 'inspection';

/**
 * Work order record
 */
export interface WorkOrder {
  id?: string;
  workOrderNumber: string;
  equipmentId: string;
  templateId?: string | null;
  title: string;
  description?: string | null;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  technician?: string | null;
  partsRequired?: string | null; // JSON array (simple for now)
  notes?: string | null;
  maintenanceLogId?: string | null; // Linked log created on completion
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Work order form data (for creating/editing)
 */
export interface WorkOrderFormData {
  equipmentId: string;
  templateId?: string | null;
  title: string;
  description?: string | null;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  estimatedHours?: number | null;
  technician?: string | null;
  partsRequired?: string | null;
  notes?: string | null;
}

/**
 * Work order completion data
 */
export interface WorkOrderCompletionData {
  actualHours: number;
  notes?: string | null;
  createMaintenanceLog?: boolean; // Default true
}

/**
 * Checklist item for templates
 */
export interface ChecklistItem {
  id: string;
  text: string;
  required: boolean;
}

/**
 * Work order template record
 */
export interface WorkOrderTemplate {
  id?: string;
  name: string;
  description?: string | null;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  estimatedHours?: number | null;
  partsRequired?: string | null; // JSON array
  checklist?: string | null; // JSON array of ChecklistItem
  equipmentType?: string | null; // Optional filter (e.g., "CAT D9")
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Work order template form data
 */
export interface WorkOrderTemplateFormData {
  name: string;
  description?: string | null;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  estimatedHours?: number | null;
  partsRequired?: string | null;
  checklist?: ChecklistItem[];
  equipmentType?: string | null;
}

// ==========================================
// Schematic Visualizer Types
// ==========================================

/**
 * OpenAI tool call for schematic retrieval
 */
export interface SchematicToolCall {
  component_name: string;
  machine_model?: string;
  additional_context?: string;
}

/**
 * Response from Java schematic handler
 */
export interface SchematicToolResponse {
  status: 'success' | 'error';
  message?: string;
  image_path?: string;
  manual_context?: string;
  component_id?: string;
  component_name?: string;
  machine_model?: string;
}

/**
 * Schematic data stored in tab
 */
export interface SchematicData {
  componentId: string;
  componentName: string;
  machineModel?: string;
  imagePath: string;
  manualContext: string;
  timestamp: number;
}

// ==========================================
// Vision - CV + GPT Hybrid Types
// ==========================================

/**
 * Region detected by local CV (geometry only)
 */
export interface CVDetectedRegion {
  id: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  area: number;
  centroid: { x: number; y: number };
}

/**
 * Component category for vision detection
 */
export type VisionComponentCategory = 'structure' | 'mechanical' | 'electrical' | 'body' | 'interior' | 'other';

/**
 * Labeled component (CV bbox + GPT label)
 */
export interface LabeledComponent {
  id: string;
  name: string;
  category: VisionComponentCategory;
  confidence: number;
  description: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Request to label detected regions
 */
export interface LabelRegionsRequest {
  imageBase64: string;
  regions: CVDetectedRegion[];
  context?: string;
}

/**
 * Result of labeling operation
 */
export interface LabelingResult {
  success: boolean;
  components: LabeledComponent[];
  summary?: string;
  error?: string;
}

/**
 * Request to generate exploded view
 */
export interface GenerateExplodedRequest {
  components: LabeledComponent[];
  summary: string;
  whiteBackground?: boolean;
  showLabels?: boolean;
  style?: 'technical' | 'artistic';
}

/**
 * Result of exploded view generation
 */
export interface GenerateExplodedResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

// ==========================================
// CSV Import/Export Types
// ==========================================

/**
 * CSV import result
 */
export interface CSVImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

/**
 * CSV export options
 */
export interface CSVExportOptions {
  includeHeaders?: boolean;
  delimiter?: ',' | ';' | '\t';
  dateFormat?: string;
}

/**
 * Equipment CSV row for import
 */
export interface EquipmentCSVRow {
  name: string;
  make: string;
  model: string;
  serialNumber?: string;
  location?: string;
  installDate?: string;
  status?: 'operational' | 'maintenance' | 'down' | 'retired';
  hourlyCost?: number;
}


/**
 * Request to process OpenAI tool call
 */
export interface ProcessSchematicRequest {
  toolCall: SchematicToolCall;
  conversationId?: string;
}
