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
  /** Unique identifier (file path) */
  id: string;
  /** Display name */
  name: string;
  /** Full file path */
  path: string;
  /** File type for determining viewer */
  type: 'text' | 'markdown' | 'pdf' | 'word' | 'unknown';
  /** Whether the tab has unsaved changes */
  isDirty?: boolean;
  /** Scroll position to restore */
  scrollPosition?: {
    scrollTop: number;
    scrollLeft: number;
  };
  /** Monaco view state for restoring cursor/selection */
  viewState?: unknown;
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
    type: 'text' | 'markdown' | 'pdf' | 'word' | 'unknown';
  }>;
  activeTabId: string | null;
  sidebarWidth?: number;
  rightPanelWidth?: number;
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
} as const;

/**
 * RAG source citation
 */
export interface RAGSource {
  fileName: string;
  filePath: string;
  section: string;
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
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.svg',
  '.webp',
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
