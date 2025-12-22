import type { 
  DirEntry, 
  FileStat, 
  FileReadResult, 
  ChatRequest, 
  ChatStreamChunk, 
  PersistedState,
  Equipment,
  MaintenanceLog,
  FailureEvent,
  EquipmentAnalytics,
} from '@drasill/shared';

interface ElectronAPI {
  selectWorkspace: () => Promise<string | null>;
  readDir: (path: string) => Promise<DirEntry[]>;
  readFile: (path: string) => Promise<FileReadResult>;
  readFileBinary: (path: string) => Promise<{ path: string; data: string }>;
  readWordFile: (path: string) => Promise<{ path: string; content: string }>;
  stat: (path: string) => Promise<FileStat>;
  addFiles: (workspacePath: string) => Promise<{ added: number; cancelled: boolean }>;
  onMenuOpenWorkspace: (callback: () => void) => () => void;
  onMenuCloseTab: (callback: () => void) => () => void;
  onMenuCommandPalette: (callback: () => void) => () => void;
  // Chat API
  sendChatMessage: (request: ChatRequest) => Promise<void>;
  onChatStreamStart: (callback: (data: { messageId: string; ragSources: Array<{ fileName: string; filePath: string; section: string }> }) => void) => () => void;
  onChatStreamChunk: (callback: (chunk: ChatStreamChunk) => void) => () => void;
  onChatStreamEnd: (callback: (data: { id: string; cancelled?: boolean }) => void) => () => void;
  onChatStreamError: (callback: (data: { id?: string; error: string }) => void) => () => void;
  setApiKey: (apiKey: string) => Promise<boolean>;
  getApiKey: () => Promise<{ hasKey: boolean; maskedKey: string | null }>;
  cancelChat: () => Promise<void>;
  onChatToolExecuted: (callback: (data: { action: string; data: unknown }) => void) => () => void;
  // RAG API
  indexWorkspace: (workspacePath: string) => Promise<{ success: boolean; chunksIndexed: number; error?: string }>;
  onRagIndexProgress: (callback: (data: { current: number; total: number; fileName: string; percentage: number }) => void) => () => void;
  onRagIndexComplete: (callback: (data: { chunksIndexed: number; filesIndexed: number }) => void) => () => void;
  getRagStatus: () => Promise<{ isIndexing: boolean; chunksCount: number }>;
  clearRagIndex: () => Promise<void>;
  // State persistence
  saveState: (state: PersistedState) => Promise<void>;
  loadState: () => Promise<PersistedState>;
  // Database
  initDatabase: () => Promise<{ success: boolean; error?: string }>;
  // Equipment API
  getAllEquipment: () => Promise<Equipment[]>;
  getEquipment: (id: string) => Promise<Equipment | null>;
  addEquipment: (equipment: Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Equipment>;
  updateEquipment: (id: string, equipment: Partial<Equipment>) => Promise<Equipment | null>;
  deleteEquipment: (id: string) => Promise<boolean>;
  detectEquipmentFromPath: (filePath: string) => Promise<Equipment | null>;
  // Maintenance Logs API
  addMaintenanceLog: (log: Omit<MaintenanceLog, 'id' | 'createdAt'>) => Promise<MaintenanceLog>;
  getMaintenanceLogs: (limit?: number) => Promise<MaintenanceLog[]>;
  getMaintenanceLogsByEquipment: (equipmentId: string, limit?: number) => Promise<MaintenanceLog[]>;
  updateMaintenanceLog: (id: string, data: Partial<Omit<MaintenanceLog, 'id' | 'createdAt'>>) => Promise<MaintenanceLog | null>;
  deleteMaintenanceLog: (id: string) => Promise<boolean>;
  // Failure Events API
  addFailureEvent: (event: Omit<FailureEvent, 'id' | 'createdAt'>) => Promise<FailureEvent>;
  getFailureEvents: (equipmentId?: string, limit?: number) => Promise<FailureEvent[]>;
  // Analytics API
  getEquipmentAnalytics: (equipmentId?: string) => Promise<EquipmentAnalytics[]>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
