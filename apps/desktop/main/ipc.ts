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
  SchematicToolCall,
  SchematicToolResponse,
  CVDetectedRegion,
  LabelingResult,
  GenerateExplodedRequest,
  GenerateExplodedResult,
  CSVImportResult,
  CSVExportOptions,
} from '@drasill/shared';
import { sendChatMessage, setApiKey, getApiKey, hasApiKey, cancelStream } from './chat';
import { indexWorkspace, searchRAG, getIndexingStatus, clearVectorStore, resetOpenAI, initRAG, setPdfExtractionReady, tryLoadCachedVectorStore } from './rag';
import { processSchematicToolCall, getSchematicImage } from './schematic';
import { labelDetectedRegions, generateExplodedView } from './vision';
import { importEquipmentCSV, exportEquipmentCSV, exportLogsCSV, getEquipmentCSVTemplate } from './csv';
import {
  getDatabase,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  getEquipment,
  getAllEquipment,
  createMaintenanceLog,
  updateMaintenanceLog,
  deleteMaintenanceLog,
  getMaintenanceLogsForEquipment,
  getAllMaintenanceLogs,
  createFailureEvent,
  getFailureEventsForEquipment,
  calculateEquipmentAnalytics,
  addFileAssociation,
  removeFileAssociation,
  removeFileAssociationsByPath,
  getFileAssociationsForEquipment,
  getFileAssociationsForFile,
  generateSampleAnalyticsData,
  // Work Orders
  createWorkOrder,
  getWorkOrder,
  getAllWorkOrders,
  getWorkOrdersForEquipment,
  updateWorkOrder,
  deleteWorkOrder,
  completeWorkOrder,
  // Work Order Templates
  createWorkOrderTemplate,
  getWorkOrderTemplate,
  getAllWorkOrderTemplates,
  updateWorkOrderTemplate,
  deleteWorkOrderTemplate,

  Equipment,
  MaintenanceLog,
  FailureEvent,
  FileEquipmentAssociation,
  WorkOrder,
  WorkOrderTemplate,
} from './database';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit for reading files

// Current workspace path for path validation
let currentWorkspacePath: string | null = null;

/**
 * Validates that a file path is within the current workspace to prevent path traversal attacks.
 * @throws Error if path is outside workspace or workspace is not set
 */
function validatePathWithinWorkspace(filePath: string): void {
  if (!currentWorkspacePath) {
    throw new Error('No workspace is currently open');
  }
  
  const resolvedPath = path.resolve(filePath);
  const resolvedWorkspace = path.resolve(currentWorkspacePath);
  
  // Normalize paths for comparison (handles case sensitivity on Windows)
  const normalizedPath = resolvedPath.toLowerCase();
  const normalizedWorkspace = resolvedWorkspace.toLowerCase();
  
  if (!normalizedPath.startsWith(normalizedWorkspace + path.sep) && normalizedPath !== normalizedWorkspace) {
    throw new Error('Access denied: Path is outside the workspace');
  }
}

/**
 * Validates a string parameter is not empty and within reasonable length
 */
function validateStringParam(value: unknown, name: string, maxLength = 10000): string {
  if (typeof value !== 'string') {
    throw new Error(`${name} must be a string`);
  }
  if (value.length === 0) {
    throw new Error(`${name} cannot be empty`);
  }
  if (value.length > maxLength) {
    throw new Error(`${name} exceeds maximum length of ${maxLength} characters`);
  }
  return value;
}

/**
 * Validates a number parameter is within range
 */
function validateNumberParam(value: unknown, name: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(`${name} must be a valid number`);
  }
  if (value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

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
  // Initialize RAG system (PDF extraction IPC handlers)
  initRAG();
  
  // Handle PDF extraction ready signal from renderer
  ipcMain.on('pdf-extraction-ready', () => {
    console.log('[IPC] Received pdf-extraction-ready signal from renderer');
    setPdfExtractionReady(true);
  });

  // Select workspace folder
  ipcMain.handle(IPC_CHANNELS.SELECT_WORKSPACE, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Workspace Folder',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    // Store workspace path for path validation
    currentWorkspacePath = result.filePaths[0];
    return result.filePaths[0];
  });

  // Read directory contents
  ipcMain.handle(IPC_CHANNELS.READ_DIR, async (_event, dirPath: string): Promise<DirEntry[]> => {
    try {
      // Validate path is within workspace (allow workspace root)
      if (currentWorkspacePath) {
        validatePathWithinWorkspace(dirPath);
      }
      
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
      // Validate path is within workspace
      validatePathWithinWorkspace(filePath);
      
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
      // Validate path is within workspace
      validatePathWithinWorkspace(filePath);
      
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

  // Read Word document and extract text
  ipcMain.handle(IPC_CHANNELS.READ_WORD_FILE, async (_event, filePath: string): Promise<{ path: string; content: string }> => {
    try {
      // Validate path is within workspace
      validatePathWithinWorkspace(filePath);
      
      const mammoth = await import('mammoth');
      const buffer = await fs.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      
      return {
        path: filePath,
        content: result.value,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to read Word file: ${filePath}`);
    }
  });

  // Add files to workspace (copy selected files)
  ipcMain.handle(IPC_CHANNELS.ADD_FILES, async (_event, workspacePath: string): Promise<{ added: number; cancelled: boolean }> => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Add Files to Workspace',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'All Supported', extensions: ['pdf', 'md', 'txt', 'markdown', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'tif'] },
          { name: 'Documents', extensions: ['pdf', 'md', 'txt', 'markdown', 'doc', 'docx'] },
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'tif'] },
          { name: 'PDF Files', extensions: ['pdf'] },
          { name: 'Word Documents', extensions: ['doc', 'docx'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { added: 0, cancelled: true };
      }

      let addedCount = 0;
      const fsSync = await import('fs');
      
      for (const sourcePath of result.filePaths) {
        const fileName = path.basename(sourcePath);
        const destPath = path.join(workspacePath, fileName);
        
        // Check if file already exists
        try {
          await fs.access(destPath);
          // File exists, skip with a unique name
          const ext = path.extname(fileName);
          const baseName = path.basename(fileName, ext);
          const timestamp = Date.now();
          const newDestPath = path.join(workspacePath, `${baseName}_${timestamp}${ext}`);
          fsSync.copyFileSync(sourcePath, newDestPath);
          addedCount++;
        } catch {
          // File doesn't exist, copy normally
          fsSync.copyFileSync(sourcePath, destPath);
          addedCount++;
        }
      }

      return { added: addedCount, cancelled: false };
    } catch (error) {
      console.error('Failed to add files:', error);
      throw new Error(`Failed to add files: ${error}`);
    }
  });

  // Delete file from workspace
  ipcMain.handle(IPC_CHANNELS.DELETE_FILE, async (_event, filePath: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Security check - validate path is within workspace
      validatePathWithinWorkspace(filePath);
      
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) {
        // For directories, use recursive delete
        await fs.rm(filePath, { recursive: true, force: true });
      } else {
        await fs.unlink(filePath);
      }
      
      console.log('[IPC] Deleted:', filePath);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Delete failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to delete file' 
      };
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
  ipcMain.handle(IPC_CHANNELS.RAG_GET_STATUS, async (): Promise<{ isIndexing: boolean; chunksCount: number; lastUpdated: number | null; workspacePath: string | null }> => {
    return getIndexingStatus();
  });

  // RAG: Try to load cached embeddings for a workspace
  ipcMain.handle(IPC_CHANNELS.RAG_LOAD_CACHE, async (_event, workspacePath: string): Promise<boolean> => {
    return await tryLoadCachedVectorStore(workspacePath);
  });

  // RAG: Clear
  ipcMain.handle(IPC_CHANNELS.RAG_CLEAR, async (): Promise<void> => {
    clearVectorStore();
  });

  // State: Save persisted state
  ipcMain.handle(IPC_CHANNELS.STATE_SAVE, async (_event, state: PersistedState): Promise<void> => {
    stateStore.set('appState', state);
    // Update current workspace path when state is saved
    if (state.workspacePath) {
      currentWorkspacePath = state.workspacePath;
    }
  });

  // State: Load persisted state
  ipcMain.handle(IPC_CHANNELS.STATE_LOAD, async (): Promise<PersistedState> => {
    const state = stateStore.get('appState');
    // Restore current workspace path from persisted state
    if (state?.workspacePath) {
      currentWorkspacePath = state.workspacePath;
    }
    return state;
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
    // Validate required fields
    validateStringParam(equipment.name, 'Equipment name', 500);
    validateStringParam(equipment.make, 'Make', 200);
    validateStringParam(equipment.model, 'Model', 200);
    
    return createEquipment(equipment);
  });

  // Update equipment
  ipcMain.handle(IPC_CHANNELS.EQUIPMENT_UPDATE, async (_event, id: string, equipment: Partial<Equipment>): Promise<Equipment | null> => {
    validateStringParam(id, 'Equipment ID', 100);
    
    // Validate fields if provided
    if (equipment.name !== undefined) validateStringParam(equipment.name, 'Equipment name', 500);
    if (equipment.make !== undefined) validateStringParam(equipment.make, 'Make', 200);
    if (equipment.model !== undefined) validateStringParam(equipment.model, 'Model', 200);
    
    return updateEquipment(id, equipment);
  });

  // Delete equipment
  ipcMain.handle(IPC_CHANNELS.EQUIPMENT_DELETE, async (_event, id: string): Promise<boolean> => {
    validateStringParam(id, 'Equipment ID', 100);
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
    // Validate required fields
    validateStringParam(log.equipmentId, 'Equipment ID', 100);
    validateStringParam(log.type, 'Maintenance type', 50);
    // Notes is optional, but validate if provided
    if (log.notes) {
      validateStringParam(log.notes, 'Notes', 10000);
    }
    
    return createMaintenanceLog(log);
  });

  // Get all maintenance logs
  ipcMain.handle(IPC_CHANNELS.LOGS_GET, async (_event, _limit?: number): Promise<MaintenanceLog[]> => {
    return getAllMaintenanceLogs();
  });

  // Get maintenance logs for specific equipment
  ipcMain.handle(IPC_CHANNELS.LOGS_GET_BY_EQUIPMENT, async (_event, equipmentId: string, _limit?: number): Promise<MaintenanceLog[]> => {
    validateStringParam(equipmentId, 'Equipment ID', 100);
    return getMaintenanceLogsForEquipment(equipmentId);
  });

  // Update maintenance log
  ipcMain.handle(IPC_CHANNELS.LOGS_UPDATE, async (_event, id: string, data: Partial<Omit<MaintenanceLog, 'id' | 'createdAt'>>): Promise<MaintenanceLog | null> => {
    validateStringParam(id, 'Log ID', 100);
    return updateMaintenanceLog(id, data);
  });

  // Delete maintenance log
  ipcMain.handle(IPC_CHANNELS.LOGS_DELETE, async (_event, id: string): Promise<boolean> => {
    validateStringParam(id, 'Log ID', 100);
    return deleteMaintenanceLog(id);
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

  // ==========================================
  // Schematics
  // ==========================================

  // Process schematic tool call from OpenAI
  ipcMain.handle(
    IPC_CHANNELS.SCHEMATIC_PROCESS_TOOL_CALL,
    async (_event, toolCall: SchematicToolCall): Promise<SchematicToolResponse> => {
      try {
        console.log('[IPC] Processing schematic tool call:', toolCall);
        const response = await processSchematicToolCall(toolCall);
        console.log('[IPC] Schematic tool call response:', response);
        return response;
      } catch (error) {
        console.error('[IPC] Error processing schematic tool call:', error);
        return {
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // Get schematic image as base64 data URL
  ipcMain.handle(
    IPC_CHANNELS.SCHEMATIC_GET_IMAGE,
    async (_event, imagePath: string): Promise<string> => {
      try {
        console.log('[IPC] Getting schematic image:', imagePath);
        const dataUrl = await getSchematicImage(imagePath);
        return dataUrl;
      } catch (error) {
        console.error('[IPC] Error getting schematic image:', error);
        throw error;
      }
    }
  );

  // ==========================================
  // Vision (GPT-4V Labeling + Exploded View)
  // ==========================================

  // Label detected regions with GPT-4V
  ipcMain.handle(
    IPC_CHANNELS.VISION_LABEL_REGIONS,
    async (_event, request: { imageBase64: string; regions: CVDetectedRegion[]; context?: string }): Promise<LabelingResult> => {
      try {
        console.log('[IPC] Labeling regions with GPT-4V:', request.regions.length, 'regions');
        const result = await labelDetectedRegions(request.imageBase64, request.regions, request.context);
        return result;
      } catch (error) {
        console.error('[IPC] Error labeling regions:', error);
        return {
          success: false,
          components: [],
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // Generate exploded view diagram with DALL-E 3
  ipcMain.handle(
    IPC_CHANNELS.VISION_GENERATE_EXPLODED,
    async (_event, request: GenerateExplodedRequest): Promise<GenerateExplodedResult> => {
      try {
        console.log('[IPC] Generating exploded view for:', request.components.length, 'components');
        const result = await generateExplodedView(request.components, request.summary, {
          whiteBackground: request.whiteBackground,
          showLabels: request.showLabels,
          style: request.style,
        });
        return result;
      } catch (error) {
        console.error('[IPC] Error generating exploded view:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // ==========================================
  // CSV Import/Export
  // ==========================================

  // Import equipment from CSV
  ipcMain.handle(IPC_CHANNELS.CSV_IMPORT_EQUIPMENT, async (): Promise<CSVImportResult> => {
    try {
      console.log('[IPC] Importing equipment from CSV');
      const result = await importEquipmentCSV();
      console.log('[IPC] CSV import result:', result.imported, 'imported,', result.skipped, 'skipped');
      return result;
    } catch (error) {
      console.error('[IPC] Error importing CSV:', error);
      return {
        success: false,
        imported: 0,
        skipped: 0,
        errors: [{ row: 0, field: '', message: error instanceof Error ? error.message : 'Unknown error' }],
      };
    }
  });

  // Export equipment to CSV
  ipcMain.handle(IPC_CHANNELS.CSV_EXPORT_EQUIPMENT, async (_event, options?: CSVExportOptions): Promise<{ success: boolean; path?: string; error?: string }> => {
    try {
      console.log('[IPC] Exporting equipment to CSV');
      const result = await exportEquipmentCSV(options || {});
      return result;
    } catch (error) {
      console.error('[IPC] Error exporting equipment CSV:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Export maintenance logs to CSV
  ipcMain.handle(IPC_CHANNELS.CSV_EXPORT_LOGS, async (_event, equipmentId?: string, options?: CSVExportOptions): Promise<{ success: boolean; path?: string; error?: string }> => {
    try {
      console.log('[IPC] Exporting logs to CSV', equipmentId ? `for equipment ${equipmentId}` : 'for all equipment');
      const result = await exportLogsCSV(equipmentId, options || {});
      return result;
    } catch (error) {
      console.error('[IPC] Error exporting logs CSV:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Get equipment CSV template
  ipcMain.handle(IPC_CHANNELS.CSV_GET_TEMPLATE, async (): Promise<string> => {
    return getEquipmentCSVTemplate();
  });

  // ==========================================
  // File-Equipment Associations
  // ==========================================

  // Add file association
  ipcMain.handle(IPC_CHANNELS.FILE_ASSOC_ADD, async (
    _event, 
    data: Omit<FileEquipmentAssociation, 'id' | 'createdAt'>
  ): Promise<FileEquipmentAssociation> => {
    console.log('[IPC] Adding file association:', data.filePath, 'to equipment:', data.equipmentId);
    return addFileAssociation(data);
  });

  // Remove file association
  ipcMain.handle(IPC_CHANNELS.FILE_ASSOC_REMOVE, async (
    _event, 
    equipmentId: string, 
    filePath: string
  ): Promise<boolean> => {
    console.log('[IPC] Removing file association:', filePath, 'from equipment:', equipmentId);
    return removeFileAssociation(equipmentId, filePath);
  });

  // Remove all file associations for a file path (when file is deleted)
  ipcMain.handle(IPC_CHANNELS.FILE_ASSOC_REMOVE_BY_PATH, async (
    _event, 
    filePath: string
  ): Promise<number> => {
    console.log('[IPC] Removing all file associations for:', filePath);
    return removeFileAssociationsByPath(filePath);
  });

  // Get file associations for equipment
  ipcMain.handle(IPC_CHANNELS.FILE_ASSOC_GET_FOR_EQUIPMENT, async (
    _event, 
    equipmentId: string
  ): Promise<FileEquipmentAssociation[]> => {
    return getFileAssociationsForEquipment(equipmentId);
  });

  // Get file associations for file
  ipcMain.handle(IPC_CHANNELS.FILE_ASSOC_GET_FOR_FILE, async (
    _event, 
    filePath: string
  ): Promise<FileEquipmentAssociation[]> => {
    return getFileAssociationsForFile(filePath);
  });

  // ==========================================
  // Sample Data Generation
  // ==========================================

  // Generate sample analytics data for testing
  ipcMain.handle(IPC_CHANNELS.GENERATE_SAMPLE_ANALYTICS, async (
    _event,
    equipmentId: string
  ): Promise<{ failuresCreated: number; logsCreated: number }> => {
    console.log('[IPC] Generating sample analytics data for equipment:', equipmentId);
    const result = generateSampleAnalyticsData(equipmentId);
    console.log('[IPC] Generated', result.failuresCreated, 'failures and', result.logsCreated, 'logs');
    return result;
  });

  // ==========================================
  // Work Orders
  // ==========================================

  // Get all work orders
  ipcMain.handle(IPC_CHANNELS.WORK_ORDER_GET_ALL, async (): Promise<WorkOrder[]> => {
    return getAllWorkOrders();
  });

  // Get single work order
  ipcMain.handle(IPC_CHANNELS.WORK_ORDER_GET, async (_event, id: string): Promise<WorkOrder | null> => {
    validateStringParam(id, 'Work order ID', 100);
    return getWorkOrder(id);
  });

  // Add work order
  ipcMain.handle(IPC_CHANNELS.WORK_ORDER_ADD, async (
    _event, 
    workOrder: Omit<WorkOrder, 'id' | 'workOrderNumber' | 'maintenanceLogId' | 'createdAt' | 'updatedAt'>
  ): Promise<WorkOrder> => {
    // Validate required fields
    validateStringParam(workOrder.title, 'Title', 500);
    validateStringParam(workOrder.type, 'Type', 50);
    validateStringParam(workOrder.priority, 'Priority', 50);
    validateStringParam(workOrder.status, 'Status', 50);
    
    console.log('[IPC] Creating work order:', workOrder.title);
    return createWorkOrder(workOrder);
  });

  // Update work order
  ipcMain.handle(IPC_CHANNELS.WORK_ORDER_UPDATE, async (
    _event, 
    id: string, 
    data: Partial<Omit<WorkOrder, 'id' | 'workOrderNumber' | 'createdAt' | 'updatedAt'>>
  ): Promise<WorkOrder | null> => {
    validateStringParam(id, 'Work order ID', 100);
    
    // Validate fields if provided
    if (data.title !== undefined) validateStringParam(data.title, 'Title', 500);
    if (data.type !== undefined) validateStringParam(data.type, 'Type', 50);
    if (data.priority !== undefined) validateStringParam(data.priority, 'Priority', 50);
    if (data.status !== undefined) validateStringParam(data.status, 'Status', 50);
    
    console.log('[IPC] Updating work order:', id);
    return updateWorkOrder(id, data);
  });

  // Delete work order
  ipcMain.handle(IPC_CHANNELS.WORK_ORDER_DELETE, async (_event, id: string): Promise<boolean> => {
    validateStringParam(id, 'Work order ID', 100);
    console.log('[IPC] Deleting work order:', id);
    return deleteWorkOrder(id);
  });

  // Get work orders for equipment
  ipcMain.handle(IPC_CHANNELS.WORK_ORDER_GET_BY_EQUIPMENT, async (
    _event, 
    equipmentId: string
  ): Promise<WorkOrder[]> => {
    validateStringParam(equipmentId, 'Equipment ID', 100);
    return getWorkOrdersForEquipment(equipmentId);
  });

  // Complete work order (with auto maintenance log creation)
  ipcMain.handle(IPC_CHANNELS.WORK_ORDER_COMPLETE, async (
    _event,
    id: string,
    actualHours: number,
    notes?: string | null,
    createLog?: boolean
  ): Promise<{ workOrder: WorkOrder; maintenanceLog?: MaintenanceLog } | null> => {
    validateStringParam(id, 'Work order ID', 100);
    validateNumberParam(actualHours, 'Actual hours', 0, 10000);
    
    console.log('[IPC] Completing work order:', id, 'with', actualHours, 'hours');
    const result = completeWorkOrder(id, actualHours, notes, createLog !== false);
    if (result) {
      console.log('[IPC] Work order completed, maintenance log created:', result.maintenanceLog?.id);
    }
    return result;
  });

  // ==========================================
  // Work Order Templates
  // ==========================================

  // Get all templates
  ipcMain.handle(IPC_CHANNELS.WORK_ORDER_TEMPLATE_GET_ALL, async (): Promise<WorkOrderTemplate[]> => {
    return getAllWorkOrderTemplates();
  });

  // Get single template
  ipcMain.handle(IPC_CHANNELS.WORK_ORDER_TEMPLATE_GET, async (_event, id: string): Promise<WorkOrderTemplate | null> => {
    validateStringParam(id, 'Template ID', 100);
    return getWorkOrderTemplate(id);
  });

  // Add template
  ipcMain.handle(IPC_CHANNELS.WORK_ORDER_TEMPLATE_ADD, async (
    _event, 
    template: Omit<WorkOrderTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<WorkOrderTemplate> => {
    // Validate required fields
    validateStringParam(template.name, 'Template name', 500);
    validateStringParam(template.type, 'Type', 50);
    validateStringParam(template.priority, 'Priority', 50);
    
    console.log('[IPC] Creating work order template:', template.name);
    return createWorkOrderTemplate(template);
  });

  // Update template
  ipcMain.handle(IPC_CHANNELS.WORK_ORDER_TEMPLATE_UPDATE, async (
    _event, 
    id: string, 
    data: Partial<Omit<WorkOrderTemplate, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<WorkOrderTemplate | null> => {
    validateStringParam(id, 'Template ID', 100);
    
    // Validate fields if provided
    if (data.name !== undefined) validateStringParam(data.name, 'Template name', 500);
    if (data.type !== undefined) validateStringParam(data.type, 'Type', 50);
    if (data.priority !== undefined) validateStringParam(data.priority, 'Priority', 50);
    
    console.log('[IPC] Updating work order template:', id);
    return updateWorkOrderTemplate(id, data);
  });

  // Delete template
  ipcMain.handle(IPC_CHANNELS.WORK_ORDER_TEMPLATE_DELETE, async (_event, id: string): Promise<boolean> => {
    validateStringParam(id, 'Template ID', 100);
    console.log('[IPC] Deleting work order template:', id);
    return deleteWorkOrderTemplate(id);
  });
}
