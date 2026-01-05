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
  SchematicToolCall,
  SchematicToolResponse,
  CVDetectedRegion,
  LabelingResult,
  GenerateExplodedRequest,
  GenerateExplodedResult,
  CSVImportResult,
  CSVExportOptions,
  FileEquipmentAssociation,
  WorkOrder,
  WorkOrderFormData,
  WorkOrderCompletionData,
  WorkOrderTemplate,
} from '@drasill/shared';

interface ElectronAPI {
  selectWorkspace: () => Promise<string | null>;
  readDir: (path: string) => Promise<DirEntry[]>;
  readFile: (path: string) => Promise<FileReadResult>;
  readFileBinary: (path: string) => Promise<{ path: string; data: string }>;
  readWordFile: (path: string) => Promise<{ path: string; content: string }>;
  stat: (path: string) => Promise<FileStat>;
  addFiles: (workspacePath: string) => Promise<{ added: number; cancelled: boolean }>;
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  onMenuOpenWorkspace: (callback: () => void) => () => void;
  onMenuCloseTab: (callback: () => void) => () => void;
  onMenuCommandPalette: (callback: () => void) => () => void;
  // Chat API
  sendChatMessage: (request: ChatRequest) => Promise<void>;
  onChatStreamStart: (callback: (data: { messageId: string; ragSources: Array<{ fileName: string; filePath: string; section: string; pageNumber?: number }> }) => void) => () => void;
  onChatStreamChunk: (callback: (chunk: ChatStreamChunk) => void) => () => void;
  onChatStreamEnd: (callback: (data: { id: string; cancelled?: boolean }) => void) => () => void;
  onChatStreamError: (callback: (data: { id?: string; error: string }) => void) => () => void;
  setApiKey: (apiKey: string) => Promise<boolean>;
  getApiKey: () => Promise<{ hasKey: boolean; maskedKey: string | null }>;
  cancelChat: () => Promise<void>;
  onChatToolExecuted: (callback: (data: { action: string; data: unknown }) => void) => () => void;
  // RAG API
  indexWorkspace: (workspacePath: string) => Promise<{ success: boolean; chunksIndexed: number; error?: string; fromCache?: boolean }>;
  onRagIndexProgress: (callback: (data: { current: number; total: number; fileName: string; percentage: number }) => void) => () => void;
  onRagIndexComplete: (callback: (data: { chunksIndexed: number; filesIndexed: number; fromCache?: boolean }) => void) => () => void;
  getRagStatus: () => Promise<{ isIndexing: boolean; chunksCount: number; lastUpdated: number | null; workspacePath: string | null }>;
  loadRagCache: (workspacePath: string) => Promise<boolean>;
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
  // Schematics API
  processSchematicToolCall: (toolCall: SchematicToolCall) => Promise<SchematicToolResponse>;
  getSchematicImage: (imagePath: string) => Promise<string>;
  // Vision API (CV Labeling + Exploded View)
  labelDetectedRegions: (imageBase64: string, regions: CVDetectedRegion[], context?: string) => Promise<LabelingResult>;
  generateExplodedView: (request: GenerateExplodedRequest) => Promise<GenerateExplodedResult>;
  // CSV Import/Export API
  importEquipmentCSV: () => Promise<CSVImportResult>;
  exportEquipmentCSV: (options?: CSVExportOptions) => Promise<{ success: boolean; path?: string; error?: string }>;
  exportLogsCSV: (equipmentId?: string, options?: CSVExportOptions) => Promise<{ success: boolean; path?: string; error?: string }>;
  getEquipmentCSVTemplate: () => Promise<string>;
  // File-Equipment Associations API
  addFileAssociation: (data: Omit<FileEquipmentAssociation, 'id' | 'createdAt'>) => Promise<FileEquipmentAssociation>;
  removeFileAssociation: (equipmentId: string, filePath: string) => Promise<boolean>;
  removeFileAssociationsByPath: (filePath: string) => Promise<number>;
  getFileAssociationsForEquipment: (equipmentId: string) => Promise<FileEquipmentAssociation[]>;
  getFileAssociationsForFile: (filePath: string) => Promise<FileEquipmentAssociation[]>;
  // Sample Data Generation API
  generateSampleAnalyticsData: (equipmentId: string) => Promise<{ failuresCreated: number; logsCreated: number }>;
  // Work Orders API
  getAllWorkOrders: () => Promise<WorkOrder[]>;
  getWorkOrder: (id: string) => Promise<WorkOrder | null>;
  addWorkOrder: (data: WorkOrderFormData) => Promise<WorkOrder>;
  updateWorkOrder: (id: string, data: Partial<WorkOrderFormData>) => Promise<WorkOrder | null>;
  deleteWorkOrder: (id: string) => Promise<boolean>;
  getWorkOrdersByEquipment: (equipmentId: string) => Promise<WorkOrder[]>;
  completeWorkOrder: (id: string, data: WorkOrderCompletionData) => Promise<{ workOrder: WorkOrder; maintenanceLog?: MaintenanceLog }>;
  // Work Order Templates API
  getAllWorkOrderTemplates: () => Promise<WorkOrderTemplate[]>;
  getWorkOrderTemplate: (id: string) => Promise<WorkOrderTemplate | null>;
  addWorkOrderTemplate: (data: Omit<WorkOrderTemplate, 'id' | 'created_at' | 'updated_at'>) => Promise<WorkOrderTemplate>;
  updateWorkOrderTemplate: (id: string, data: Partial<Omit<WorkOrderTemplate, 'id' | 'created_at' | 'updated_at'>>) => Promise<WorkOrderTemplate | null>;
  deleteWorkOrderTemplate: (id: string) => Promise<boolean>;
  createWorkOrderFromTemplate: (templateId: string, equipmentId: string) => Promise<WorkOrder>;
  // PDF Text Extraction API (for RAG)
  onPdfExtractRequest: (callback: (data: { requestId: string; filePath: string }) => void) => () => void;
  sendPdfExtractResult: (data: { requestId: string; text: string; error?: string }) => void;
  signalPdfExtractionReady: () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
