import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import Store from 'electron-store';
import { 
  IPC_CHANNELS, 
  DirEntry, 
  FileStat, 
  FileReadResult, 
  shouldIgnore, 
  getExtension, 
  BINARY_EXTENSIONS, 
  ChatRequest, 
  PersistedState,
} from '@drasill/shared';
import { sendChatMessage, setApiKey, getApiKey, hasApiKey, cancelStream } from './chat';
import { indexWorkspace, searchRAG, getIndexingStatus, clearVectorStore, resetOpenAI } from './rag';
import {
  getDatabase,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  getEquipment,
  getAllEquipment,
  createMaintenanceLog,
  getMaintenanceLogsForEquipment,
  getAllMaintenanceLogs,
  createFailureEvent,
  getFailureEventsForEquipment,
  calculateEquipmentAnalytics,
  Equipment,
  MaintenanceLog,
  FailureEvent,
} from './database';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit for reading files

// State persistence store
const stateStore = new Store<{ appState: PersistedState }>({
  name: 'app-state',
  defaults: {
    appState: {
      workspacePath: null,
      openTabs: [],
      activeTabId: null,
    }
  }
});

export function setupIpcHandlers(): void {
  // Select workspace folder
  ipcMain.handle(IPC_CHANNELS.SELECT_WORKSPACE, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Workspace Folder',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // Read directory contents
  ipcMain.handle(IPC_CHANNELS.READ_DIR, async (_event, dirPath: string): Promise<DirEntry[]> => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      const results: DirEntry[] = [];
      
      for (const entry of entries) {
        // Skip ignored files/directories
        if (shouldIgnore(entry.name)) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        const isDirectory = entry.isDirectory();
        const extension = isDirectory ? undefined : getExtension(entry.name);

        // Skip binary files
        if (!isDirectory && extension && BINARY_EXTENSIONS.includes(extension.toLowerCase())) {
          continue;
        }

        results.push({
          name: entry.name,
          path: fullPath,
          isDirectory,
          isFile: entry.isFile(),
          extension,
        });
      }

      // Sort: directories first, then files, alphabetically
      results.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      return results;
    } catch (error) {
      console.error('Error reading directory:', error);
      throw new Error(`Failed to read directory: ${dirPath}`);
    }
  });

  // Read file contents
  ipcMain.handle(IPC_CHANNELS.READ_FILE, async (_event, filePath: string): Promise<FileReadResult> => {
    try {
      // Check file size first
      const stats = await fs.stat(filePath);
      
      if (stats.size > MAX_FILE_SIZE) {
        throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
      }

      const content = await fs.readFile(filePath, 'utf-8');
      
      return {
        path: filePath,
        content,
        encoding: 'utf-8',
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to read file: ${filePath}`);
    }
  });

  // Read file as binary (Base64) for PDFs and other binary files
  ipcMain.handle(IPC_CHANNELS.READ_FILE_BINARY, async (_event, filePath: string): Promise<{ path: string; data: string }> => {
    try {
      const stats = await fs.stat(filePath);
      
      // 20MB limit for binary files
      const MAX_BINARY_SIZE = 20 * 1024 * 1024;
      if (stats.size > MAX_BINARY_SIZE) {
        throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB exceeds ${MAX_BINARY_SIZE / 1024 / 1024}MB limit`);
      }

      const buffer = await fs.readFile(filePath);
      const base64 = buffer.toString('base64');
      
      return {
        path: filePath,
        data: base64,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to read binary file: ${filePath}`);
    }
  });

  // Get file/directory stats
  ipcMain.handle(IPC_CHANNELS.STAT, async (_event, targetPath: string): Promise<FileStat> => {
    try {
      const stats = await fs.stat(targetPath);
      
      return {
        path: targetPath,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        mtime: stats.mtimeMs,
      };
    } catch (error) {
      throw new Error(`Failed to stat: ${targetPath}`);
    }
  });

  // Chat: Send message with streaming
  ipcMain.handle(IPC_CHANNELS.CHAT_SEND_MESSAGE, async (event, request: ChatRequest): Promise<void> => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      await sendChatMessage(window, request);
    }
  });

  // Chat: Set API key
  ipcMain.handle(IPC_CHANNELS.CHAT_SET_API_KEY, async (_event, apiKey: string): Promise<boolean> => {
    try {
      await setApiKey(apiKey);
      resetOpenAI(); // Reset OpenAI client in RAG module too
      return true;
    } catch (error) {
      return false;
    }
  });

  // Chat: Get API key (masked)
  ipcMain.handle(IPC_CHANNELS.CHAT_GET_API_KEY, async (): Promise<{ hasKey: boolean; maskedKey: string | null }> => {
    return {
      hasKey: await hasApiKey(),
      maskedKey: await getApiKey(),
    };
  });

  // Chat: Cancel stream
  ipcMain.handle(IPC_CHANNELS.CHAT_CANCEL, async (): Promise<void> => {
    cancelStream();
  });

  // RAG: Index workspace
  ipcMain.handle(IPC_CHANNELS.RAG_INDEX_WORKSPACE, async (event, workspacePath: string): Promise<{ success: boolean; chunksIndexed: number; error?: string }> => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      return await indexWorkspace(workspacePath, window);
    }
    return { success: false, chunksIndexed: 0, error: 'No window found' };
  });

  // RAG: Search
  ipcMain.handle(IPC_CHANNELS.RAG_SEARCH, async (_event, query: string): Promise<{ chunks: Array<{ content: string; fileName: string; filePath: string; score: number }> }> => {
    return await searchRAG(query);
  });

  // RAG: Get status
  ipcMain.handle(IPC_CHANNELS.RAG_GET_STATUS, async (): Promise<{ isIndexing: boolean; chunksCount: number }> => {
    return getIndexingStatus();
  });

  // RAG: Clear
  ipcMain.handle(IPC_CHANNELS.RAG_CLEAR, async (): Promise<void> => {
    clearVectorStore();
  });

  // State: Save persisted state
  ipcMain.handle(IPC_CHANNELS.STATE_SAVE, async (_event, state: PersistedState): Promise<void> => {
    stateStore.set('appState', state);
  });

  // State: Load persisted state
  ipcMain.handle(IPC_CHANNELS.STATE_LOAD, async (): Promise<PersistedState> => {
    return stateStore.get('appState');
  });

  // ==========================================
  // Equipment Management
  // ==========================================

  // Initialize database
  ipcMain.handle(IPC_CHANNELS.DB_INIT, async (): Promise<{ success: boolean; error?: string }> => {
    try {
      getDatabase(); // Initialize by getting the database instance
      return { success: true };
    } catch (error) {
      console.error('Database init error:', error);
      return { success: false, error: String(error) };
    }
  });

  // Get all equipment
  ipcMain.handle(IPC_CHANNELS.EQUIPMENT_GET_ALL, async (): Promise<Equipment[]> => {
    return getAllEquipment();
  });

  // Get single equipment
  ipcMain.handle(IPC_CHANNELS.EQUIPMENT_GET, async (_event, id: string): Promise<Equipment | null> => {
    return getEquipment(id);
  });

  // Add equipment
  ipcMain.handle(IPC_CHANNELS.EQUIPMENT_ADD, async (_event, equipment: Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Equipment> => {
    return createEquipment(equipment);
  });

  // Update equipment
  ipcMain.handle(IPC_CHANNELS.EQUIPMENT_UPDATE, async (_event, id: string, equipment: Partial<Equipment>): Promise<Equipment | null> => {
    return updateEquipment(id, equipment);
  });

  // Delete equipment
  ipcMain.handle(IPC_CHANNELS.EQUIPMENT_DELETE, async (_event, id: string): Promise<boolean> => {
    return deleteEquipment(id);
  });

  // Detect equipment from file path - match equipment by make/model patterns in path
  ipcMain.handle(IPC_CHANNELS.EQUIPMENT_DETECT_FROM_PATH, async (_event, filePath: string): Promise<Equipment | null> => {
    const allEquipment = getAllEquipment();
    const pathLower = filePath.toLowerCase();
    
    // Try to find equipment where make or model appears in the file path
    for (const eq of allEquipment) {
      const makeLower = eq.make.toLowerCase();
      const modelLower = eq.model.toLowerCase();
      
      if (pathLower.includes(makeLower) || pathLower.includes(modelLower)) {
        return eq;
      }
      
      // Also check manual path match
      if (eq.manualPath && filePath.startsWith(eq.manualPath)) {
        return eq;
      }
    }
    
    return null;
  });

  // ==========================================
  // Maintenance Logs
  // ==========================================

  // Add maintenance log
  ipcMain.handle(IPC_CHANNELS.LOGS_ADD, async (_event, log: Omit<MaintenanceLog, 'id' | 'createdAt'>): Promise<MaintenanceLog> => {
    return createMaintenanceLog(log);
  });

  // Get all maintenance logs
  ipcMain.handle(IPC_CHANNELS.LOGS_GET, async (_event, _limit?: number): Promise<MaintenanceLog[]> => {
    return getAllMaintenanceLogs();
  });

  // Get maintenance logs for specific equipment
  ipcMain.handle(IPC_CHANNELS.LOGS_GET_BY_EQUIPMENT, async (_event, equipmentId: string, _limit?: number): Promise<MaintenanceLog[]> => {
    return getMaintenanceLogsForEquipment(equipmentId);
  });

  // ==========================================
  // Failure Events
  // ==========================================

  // Add failure event
  ipcMain.handle(IPC_CHANNELS.FAILURE_ADD, async (_event, event: Omit<FailureEvent, 'id' | 'createdAt'>): Promise<FailureEvent> => {
    return createFailureEvent(event);
  });

  // Get failure events
  ipcMain.handle(IPC_CHANNELS.FAILURE_GET, async (_event, equipmentId?: string, _limit?: number): Promise<FailureEvent[]> => {
    if (equipmentId) {
      return getFailureEventsForEquipment(equipmentId);
    }
    // For all equipment, aggregate
    const allEquipment = getAllEquipment();
    const allFailures: FailureEvent[] = [];
    for (const eq of allEquipment) {
      const failures = getFailureEventsForEquipment(eq.id);
      allFailures.push(...failures);
    }
    return allFailures.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  });

  // ==========================================
  // Analytics
  // ==========================================

  // Get equipment analytics
  ipcMain.handle(IPC_CHANNELS.ANALYTICS_GET, async (_event, equipmentId?: string): Promise<ReturnType<typeof calculateEquipmentAnalytics>[]> => {
    if (equipmentId) {
      return [calculateEquipmentAnalytics(equipmentId)];
    }
    // Get analytics for all equipment
    const allEquipment = getAllEquipment();
    return allEquipment.map(eq => calculateEquipmentAnalytics(eq.id));
  });
}
