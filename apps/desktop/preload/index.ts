import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { 
  IPC_CHANNELS, 
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

/**
 * API exposed to the renderer process via contextBridge
 */
const api = {
  /**
   * Select a workspace folder via system dialog
   */
  selectWorkspace: (): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SELECT_WORKSPACE);
  },

  /**
   * Read directory contents
   */
  readDir: (path: string): Promise<DirEntry[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.READ_DIR, path);
  },

  /**
   * Read file contents
   */
  readFile: (path: string): Promise<FileReadResult> => {
    return ipcRenderer.invoke(IPC_CHANNELS.READ_FILE, path);
  },

  /**
   * Read file as binary (Base64) for PDFs and other binary files
   */
  readFileBinary: (path: string): Promise<{ path: string; data: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.READ_FILE_BINARY, path);
  },

  /**
   * Read Word document and extract text
   */
  readWordFile: (path: string): Promise<{ path: string; content: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.READ_WORD_FILE, path);
  },

  /**
   * Get file/directory stats
   */
  stat: (path: string): Promise<FileStat> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STAT, path);
  },

  /**
   * Add files to workspace (copy selected files)
   */
  addFiles: (workspacePath: string): Promise<{ added: number; cancelled: boolean }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.ADD_FILES, workspacePath);
  },

  /**
   * Subscribe to menu events from main process
   */
  onMenuOpenWorkspace: (callback: () => void): (() => void) => {
    const handler = (_event: IpcRendererEvent) => callback();
    ipcRenderer.on('menu:open-workspace', handler);
    return () => ipcRenderer.removeListener('menu:open-workspace', handler);
  },

  onMenuCloseTab: (callback: () => void): (() => void) => {
    const handler = (_event: IpcRendererEvent) => callback();
    ipcRenderer.on('menu:close-tab', handler);
    return () => ipcRenderer.removeListener('menu:close-tab', handler);
  },

  onMenuCommandPalette: (callback: () => void): (() => void) => {
    const handler = (_event: IpcRendererEvent) => callback();
    ipcRenderer.on('menu:command-palette', handler);
    return () => ipcRenderer.removeListener('menu:command-palette', handler);
  },

  // Chat API
  /**
   * Send a chat message (initiates streaming response)
   */
  sendChatMessage: (request: ChatRequest): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND_MESSAGE, request);
  },

  /**
   * Subscribe to chat stream start (includes RAG sources)
   */
  onChatStreamStart: (callback: (data: { messageId: string; ragSources: Array<{ fileName: string; filePath: string; section: string }> }) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: { messageId: string; ragSources: Array<{ fileName: string; filePath: string; section: string }> }) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_START, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_START, handler);
  },

  /**
   * Subscribe to chat stream chunks
   */
  onChatStreamChunk: (callback: (chunk: ChatStreamChunk) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, chunk: ChatStreamChunk) => callback(chunk);
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_CHUNK, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_CHUNK, handler);
  },

  /**
   * Subscribe to chat stream end
   */
  onChatStreamEnd: (callback: (data: { id: string; cancelled?: boolean }) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: { id: string; cancelled?: boolean }) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_END, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_END, handler);
  },

  /**
   * Subscribe to chat stream errors
   */
  onChatStreamError: (callback: (data: { id?: string; error: string }) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: { id?: string; error: string }) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_ERROR, handler);
  },

  /**
   * Set OpenAI API key
   */
  setApiKey: (apiKey: string): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CHAT_SET_API_KEY, apiKey);
  },

  /**
   * Get API key info
   */
  getApiKey: (): Promise<{ hasKey: boolean; maskedKey: string | null }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CHAT_GET_API_KEY);
  },

  /**
   * Cancel ongoing chat stream
   */
  cancelChat: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CHAT_CANCEL);
  },

  /**
   * Subscribe to chat tool execution events
   */
  onChatToolExecuted: (callback: (data: { action: string; data: unknown }) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: { action: string; data: unknown }) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.CHAT_TOOL_EXECUTED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_TOOL_EXECUTED, handler);
  },

  // RAG API
  /**
   * Index workspace for RAG
   */
  indexWorkspace: (workspacePath: string): Promise<{ success: boolean; chunksIndexed: number; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.RAG_INDEX_WORKSPACE, workspacePath);
  },

  /**
   * Subscribe to RAG indexing progress
   */
  onRagIndexProgress: (callback: (data: { current: number; total: number; fileName: string; percentage: number }) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: { current: number; total: number; fileName: string; percentage: number }) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.RAG_INDEX_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RAG_INDEX_PROGRESS, handler);
  },

  /**
   * Subscribe to RAG indexing complete
   */
  onRagIndexComplete: (callback: (data: { chunksIndexed: number; filesIndexed: number }) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: { chunksIndexed: number; filesIndexed: number }) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.RAG_INDEX_COMPLETE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RAG_INDEX_COMPLETE, handler);
  },

  /**
   * Get RAG status
   */
  getRagStatus: (): Promise<{ isIndexing: boolean; chunksCount: number }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.RAG_GET_STATUS);
  },

  /**
   * Clear RAG index
   */
  clearRagIndex: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.RAG_CLEAR);
  },

  // State persistence
  /**
   * Save app state for persistence
   */
  saveState: (state: PersistedState): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STATE_SAVE, state);
  },

  /**
   * Load persisted app state
   */
  loadState: (): Promise<PersistedState> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STATE_LOAD);
  },

  // ==========================================
  // Database & Equipment API
  // ==========================================

  /**
   * Initialize the database
   */
  initDatabase: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.DB_INIT);
  },

  /**
   * Get all equipment
   */
  getAllEquipment: (): Promise<Equipment[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.EQUIPMENT_GET_ALL);
  },

  /**
   * Get single equipment by ID
   */
  getEquipment: (id: string): Promise<Equipment | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.EQUIPMENT_GET, id);
  },

  /**
   * Add new equipment
   */
  addEquipment: (equipment: Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Equipment> => {
    return ipcRenderer.invoke(IPC_CHANNELS.EQUIPMENT_ADD, equipment);
  },

  /**
   * Update equipment
   */
  updateEquipment: (id: string, equipment: Partial<Equipment>): Promise<Equipment | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.EQUIPMENT_UPDATE, id, equipment);
  },

  /**
   * Delete equipment
   */
  deleteEquipment: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.EQUIPMENT_DELETE, id);
  },

  /**
   * Detect equipment from file path
   */
  detectEquipmentFromPath: (filePath: string): Promise<Equipment | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.EQUIPMENT_DETECT_FROM_PATH, filePath);
  },

  // ==========================================
  // Maintenance Logs API
  // ==========================================

  /**
   * Add maintenance log
   */
  addMaintenanceLog: (log: Omit<MaintenanceLog, 'id' | 'createdAt'>): Promise<MaintenanceLog> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LOGS_ADD, log);
  },

  /**
   * Get all maintenance logs
   */
  getMaintenanceLogs: (limit?: number): Promise<MaintenanceLog[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LOGS_GET, limit);
  },

  /**
   * Get maintenance logs for specific equipment
   */
  getMaintenanceLogsByEquipment: (equipmentId: string, limit?: number): Promise<MaintenanceLog[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LOGS_GET_BY_EQUIPMENT, equipmentId, limit);
  },

  /**
   * Update maintenance log
   */
  updateMaintenanceLog: (id: string, data: Partial<Omit<MaintenanceLog, 'id' | 'createdAt'>>): Promise<MaintenanceLog | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LOGS_UPDATE, id, data);
  },

  /**
   * Delete maintenance log
   */
  deleteMaintenanceLog: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LOGS_DELETE, id);
  },

  // ==========================================
  // Failure Events API
  // ==========================================

  /**
   * Add failure event
   */
  addFailureEvent: (event: Omit<FailureEvent, 'id' | 'createdAt'>): Promise<FailureEvent> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FAILURE_ADD, event);
  },

  /**
   * Get failure events
   */
  getFailureEvents: (equipmentId?: string, limit?: number): Promise<FailureEvent[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FAILURE_GET, equipmentId, limit);
  },

  // ==========================================
  // Analytics API
  // ==========================================

  /**
   * Get equipment analytics (MTBF, MTTR, availability)
   */
  getEquipmentAnalytics: (equipmentId?: string): Promise<EquipmentAnalytics[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_GET, equipmentId);
  },
};

// Expose the API to the renderer
contextBridge.exposeInMainWorld('electronAPI', api);

// Type declaration for the API
export type ElectronAPI = typeof api;
