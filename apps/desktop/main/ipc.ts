import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
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
  Deal,
  DealActivity,
  OneDriveItem,
  OneDriveAuthStatus,
  ChatSession,
  ChatSessionFull,
  ChatMessage,
  ChatSessionSource,
  ActivitySource,
  KnowledgeProfile,
  KnowledgeDocument,
  DocumentTemplate,
  GeneratedMemo,
  MemoGenerationRequest,
} from '@drasill/shared';
import { sendChatMessage, setApiKey, getApiKey, hasApiKey, cancelStream } from './chat';
import { indexWorkspace, indexOneDriveWorkspace, searchRAG, getIndexingStatus, clearVectorStore, resetOpenAI, tryLoadCachedVectorStore, setPdfExtractionReady } from './rag';
import { processSchematicToolCall, getSchematicImage } from './schematic';
import {
  startOneDriveAuth,
  getOneDriveAuthStatus,
  logoutOneDrive,
  listOneDriveFolder,
  readOneDriveFile,
  downloadOneDriveFile,
  getOneDriveFolderInfo,
} from './onedrive';
import {
  createEmailDraft,
  sendEmailDraft,
  sendEmailDirect,
  deleteEmailDraft,
  getEmailDrafts,
  type EmailDraft,
} from './outlook';
import {
  initSupabase,
  initAuthState,
  signUp,
  signIn,
  signOut,
  resetPassword,
  getCurrentUser,
  checkSubscription,
  createCheckoutSession,
} from './supabase';
import {
  getDatabase,
  createDeal,
  updateDeal,
  deleteDeal,
  getDeal,
  getAllDeals,
  createDealActivity,
  updateDealActivity,
  deleteDealActivity,
  getActivitiesForDeal,
  getAllActivities,
  calculatePipelineAnalytics,
  createChatSession,
  getChatSessionFull,
  getAllChatSessions,
  updateChatSession,
  deleteChatSession,
  addChatMessage,
  addActivitySource,
  removeActivitySource,
  getActivitiesWithSources,
  // Knowledge Base functions
  createKnowledgeProfile,
  getKnowledgeProfile,
  getAllKnowledgeProfiles,
  getActiveProfileWithInheritance,
  setActiveKnowledgeProfile,
  updateKnowledgeProfile,
  deleteKnowledgeProfile,
  addKnowledgeDocument,
  getKnowledgeDocumentsByProfile,
  removeKnowledgeDocument,
  createDocumentTemplate,
  getDocumentTemplate,
  getAllDocumentTemplates,
  updateDocumentTemplate,
  deleteDocumentTemplate,
  createGeneratedMemo,
  getGeneratedMemo,
  getMemosByDeal,
  updateGeneratedMemo,
  deleteGeneratedMemo,
} from './database';
import {
  exportDealToPDF,
  exportPipelineToPDF,
} from './pdfExport';
import {
  initUsageTracking,
  incrementUsage,
  getUsageStats,
  getUsageLimits,
  checkUsageLimits,
  getUsagePercentages,
  UsageStats,
  UsageLimits,
} from './usage';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit for reading files

/**
 * Validate and sanitize a file path to prevent path traversal attacks
 * Ensures the path doesn't escape the intended directory
 */
function validateFilePath(filePath: string, workspacePath?: string): string {
  // Resolve to absolute path
  const resolvedPath = path.resolve(filePath);
  
  // Check for path traversal attempts
  if (filePath.includes('..')) {
    // After resolving, ensure we're still within allowed boundaries
    if (workspacePath) {
      const resolvedWorkspace = path.resolve(workspacePath);
      if (!resolvedPath.startsWith(resolvedWorkspace)) {
        throw new Error('Access denied: Path traversal detected');
      }
    }
  }
  
  return resolvedPath;
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
  // PDF Extractor Ready signal from renderer
  ipcMain.on(IPC_CHANNELS.PDF_EXTRACTOR_READY, () => {
    console.log('[IPC] PDF extractor ready signal received from renderer');
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

    return result.filePaths[0];
  });

  // Select files
  ipcMain.handle(IPC_CHANNELS.SELECT_FILES, async (_event, options: {
    title?: string;
    filters?: { name: string; extensions: string[] }[];
    properties?: ('openFile' | 'multiSelections')[];
  }): Promise<string[] | null> => {
    const result = await dialog.showOpenDialog({
      title: options.title || 'Select Files',
      filters: options.filters,
      properties: options.properties || ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths;
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
      console.error('Error reading directory:', dirPath, error);
      throw new Error('Failed to read directory');
    }
  });

  // Read file contents
  ipcMain.handle(IPC_CHANNELS.READ_FILE, async (_event, filePath: string): Promise<FileReadResult> => {
    try {
      // Validate path
      const safePath = validateFilePath(filePath);
      
      // Check file size first
      const stats = await fs.stat(safePath);
      
      if (stats.size > MAX_FILE_SIZE) {
        throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
      }

      const content = await fs.readFile(safePath, 'utf-8');
      
      return {
        path: safePath,
        content,
        encoding: 'utf-8',
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to read file`);
    }
  });

  // Read file as binary (Base64) for PDFs and other binary files
  ipcMain.handle(IPC_CHANNELS.READ_FILE_BINARY, async (_event, filePath: string): Promise<{ path: string; data: string }> => {
    try {
      // Validate path
      const safePath = validateFilePath(filePath);
      
      const stats = await fs.stat(safePath);
      
      // 20MB limit for binary files
      const MAX_BINARY_SIZE = 20 * 1024 * 1024;
      if (stats.size > MAX_BINARY_SIZE) {
        throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB exceeds ${MAX_BINARY_SIZE / 1024 / 1024}MB limit`);
      }

      const buffer = await fs.readFile(safePath);
      const base64 = buffer.toString('base64');
      
      return {
        path: safePath,
        data: base64,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to read binary file`);
    }
  });

  // Read Word document and extract text
  ipcMain.handle(IPC_CHANNELS.READ_WORD_FILE, async (_event, filePath: string): Promise<{ path: string; content: string }> => {
    try {
      const mammoth = await import('mammoth');
      const buffer = await fs.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      
      return {
        path: filePath,
        content: result.value,
      };
    } catch (error) {
      console.error('Error reading Word file:', filePath, error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to read Word file');
    }
  });

  // Read Word document from base64 buffer and extract text
  ipcMain.handle(IPC_CHANNELS.READ_WORD_FILE_BUFFER, async (_event, base64Data: string): Promise<{ content: string }> => {
    try {
      const mammoth = await import('mammoth');
      const buffer = Buffer.from(base64Data, 'base64');
      const result = await mammoth.extractRawText({ buffer });
      
      return {
        content: result.value,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to read Word file from buffer');
    }
  });

  // Add files to workspace (copy selected files)
  ipcMain.handle(IPC_CHANNELS.ADD_FILES, async (_event, workspacePath: string): Promise<{ added: number; cancelled: boolean }> => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Add Files to Workspace',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Documents', extensions: ['pdf', 'md', 'txt', 'markdown', 'doc', 'docx', 'xls', 'xlsx'] },
          { name: 'PDF Files', extensions: ['pdf'] },
          { name: 'Word Files', extensions: ['doc', 'docx'] },
          { name: 'Excel Files', extensions: ['xls', 'xlsx'] },
          { name: 'Text Files', extensions: ['txt', 'md', 'markdown'] },
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

  // Delete file
  ipcMain.handle(IPC_CHANNELS.DELETE_FILE, async (_event, filePath: string): Promise<{ success: boolean }> => {
    try {
      const result = await dialog.showMessageBox({
        type: 'warning',
        title: 'Delete File',
        message: `Are you sure you want to delete this file?`,
        detail: filePath,
        buttons: ['Cancel', 'Delete'],
        defaultId: 0,
        cancelId: 0,
      });

      if (result.response === 1) {
        await fs.unlink(filePath);
        return { success: true };
      }
      return { success: false };
    } catch (error) {
      console.error('Failed to delete file:', error);
      throw new Error(`Failed to delete file: ${error}`);
    }
  });

  // Delete folder
  ipcMain.handle(IPC_CHANNELS.DELETE_FOLDER, async (_event, folderPath: string): Promise<{ success: boolean }> => {
    try {
      const result = await dialog.showMessageBox({
        type: 'warning',
        title: 'Delete Folder',
        message: `Are you sure you want to delete this folder and all its contents?`,
        detail: folderPath,
        buttons: ['Cancel', 'Delete'],
        defaultId: 0,
        cancelId: 0,
      });

      if (result.response === 1) {
        await fs.rm(folderPath, { recursive: true, force: true });
        return { success: true };
      }
      return { success: false };
    } catch (error) {
      console.error('Failed to delete folder:', error);
      throw new Error(`Failed to delete folder: ${error}`);
    }
  });

  // Create file
  ipcMain.handle(IPC_CHANNELS.CREATE_FILE, async (_event, parentPath: string, fileName: string): Promise<{ success: boolean; filePath: string | null }> => {
    try {
      const filePath = path.join(parentPath, fileName);
      
      // Check if file already exists
      try {
        await fs.access(filePath);
        throw new Error('File already exists');
      } catch (e) {
        // File doesn't exist, which is what we want
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      
      await fs.writeFile(filePath, '', 'utf-8');
      return { success: true, filePath };
    } catch (error) {
      console.error('Failed to create file:', error);
      throw new Error(`Failed to create file: ${error}`);
    }
  });

  // Create folder
  ipcMain.handle(IPC_CHANNELS.CREATE_FOLDER, async (_event, parentPath: string, folderName: string): Promise<{ success: boolean; folderPath: string | null }> => {
    try {
      const folderPath = path.join(parentPath, folderName);
      
      // Check if folder already exists
      try {
        await fs.access(folderPath);
        throw new Error('Folder already exists');
      } catch (e) {
        // Folder doesn't exist, which is what we want
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      
      await fs.mkdir(folderPath);
      return { success: true, folderPath };
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw new Error(`Failed to create folder: ${error}`);
    }
  });

  // Rename file or folder
  ipcMain.handle(IPC_CHANNELS.RENAME_FILE, async (_event, oldPath: string, newName: string): Promise<{ success: boolean; newPath: string | null }> => {
    try {
      const parentDir = path.dirname(oldPath);
      const newPath = path.join(parentDir, newName);
      
      // Check if target already exists
      try {
        await fs.access(newPath);
        throw new Error('A file or folder with that name already exists');
      } catch (e) {
        // Target doesn't exist, which is what we want
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      
      await fs.rename(oldPath, newPath);
      return { success: true, newPath };
    } catch (error) {
      console.error('Failed to rename:', error);
      throw new Error(`Failed to rename: ${error}`);
    }
  });

  // Close workspace
  ipcMain.handle(IPC_CHANNELS.CLOSE_WORKSPACE, async (): Promise<{ success: boolean }> => {
    return { success: true };
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
      console.error('Error getting file stats:', targetPath, error);
      throw new Error('Failed to get file info');
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
  ipcMain.handle(IPC_CHANNELS.RAG_INDEX_WORKSPACE, async (event, workspacePath: string, forceReindex = false): Promise<{ success: boolean; chunksIndexed: number; error?: string }> => {
    console.log('[IPC] RAG_INDEX_WORKSPACE called:', { workspacePath, forceReindex });
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      return await indexWorkspace(workspacePath, window, forceReindex);
    }
    return { success: false, chunksIndexed: 0, error: 'No window found' };
  });

  // RAG: Index OneDrive workspace
  ipcMain.handle(IPC_CHANNELS.RAG_INDEX_ONEDRIVE, async (event, folderId: string, folderPath: string, forceReindex = false): Promise<{ success: boolean; chunksIndexed: number; error?: string }> => {
    console.log('[IPC] RAG_INDEX_ONEDRIVE called:', { folderId, folderPath, forceReindex });
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      return await indexOneDriveWorkspace(folderId, folderPath, window, forceReindex);
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
  });

  // State: Load persisted state
  ipcMain.handle(IPC_CHANNELS.STATE_LOAD, async (): Promise<PersistedState> => {
    return stateStore.get('appState');
  });

  // ==========================================
  // Deal Management
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

  // Get all deals
  ipcMain.handle(IPC_CHANNELS.DEAL_GET_ALL, async (): Promise<Deal[]> => {
    return getAllDeals();
  });

  // Get single deal
  ipcMain.handle(IPC_CHANNELS.DEAL_GET, async (_event, id: string): Promise<Deal | null> => {
    return getDeal(id);
  });

  // Add deal
  ipcMain.handle(IPC_CHANNELS.DEAL_ADD, async (_event, deal: Omit<Deal, 'id' | 'createdAt' | 'updatedAt'>): Promise<Deal> => {
    const newDeal = createDeal(deal);
    incrementUsage('deals_created');
    return newDeal;
  });

  // Import deals from CSV
  ipcMain.handle(IPC_CHANNELS.DEAL_IMPORT_CSV, async (): Promise<{ imported: number; errors: string[] }> => {
    const result = await dialog.showOpenDialog({
      title: 'Import Deals from CSV',
      properties: ['openFile'],
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { imported: 0, errors: [] };
    }

    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    
    if (lines.length < 2) {
      return { imported: 0, errors: ['CSV file is empty or has no data rows'] };
    }

    // Parse header row
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[\s_-]+/g, ''));
    
    // Map common header variations to our fields
    const headerMap: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (['borrowername', 'borrower', 'name', 'company', 'client'].includes(h)) headerMap['borrowerName'] = String(i);
      else if (['borrowercontact', 'contact', 'email', 'phone'].includes(h)) headerMap['borrowerContact'] = String(i);
      else if (['loanamount', 'loan', 'amount', 'principal', 'value'].includes(h)) headerMap['loanAmount'] = String(i);
      else if (['interestrate', 'rate', 'interest', 'apr'].includes(h)) headerMap['interestRate'] = String(i);
      else if (['termmonths', 'term', 'months', 'duration'].includes(h)) headerMap['termMonths'] = String(i);
      else if (['collateral', 'collateraldescription', 'security'].includes(h)) headerMap['collateralDescription'] = String(i);
      else if (['stage', 'status'].includes(h)) headerMap['stage'] = String(i);
      else if (['priority'].includes(h)) headerMap['priority'] = String(i);
      else if (['assignedto', 'assigned', 'owner', 'lender'].includes(h)) headerMap['assignedTo'] = String(i);
      else if (['notes', 'comments', 'description'].includes(h)) headerMap['notes'] = String(i);
      else if (['expectedclosedate', 'closedate', 'duedate', 'expectedclose'].includes(h)) headerMap['expectedCloseDate'] = String(i);
    });

    if (!headerMap['borrowerName'] && !headerMap['loanAmount']) {
      return { imported: 0, errors: ['CSV must have at least a "Borrower Name" or "Loan Amount" column'] };
    }

    const errors: string[] = [];
    let imported = 0;

    // Process data rows
    for (let i = 1; i < lines.length; i++) {
      try {
        // Parse CSV line (handle quoted fields with commas)
        const values: string[] = [];
        let current = '';
        let inQuotes = false;
        for (const char of lines[i]) {
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim());

        const getValue = (field: string): string => {
          const idx = headerMap[field];
          return idx !== undefined ? (values[parseInt(idx)] || '') : '';
        };

        const borrowerName = getValue('borrowerName');
        const loanAmountStr = getValue('loanAmount').replace(/[$,]/g, '');
        const loanAmount = parseFloat(loanAmountStr) || 0;

        if (!borrowerName && !loanAmount) {
          errors.push(`Row ${i + 1}: Missing borrower name and loan amount`);
          continue;
        }

        // Validate and map stage
        let stage = getValue('stage').toLowerCase();
        const validStages = ['lead', 'application', 'underwriting', 'approved', 'funded', 'closed', 'declined'];
        if (!validStages.includes(stage)) stage = 'lead';

        // Validate and map priority
        let priority = getValue('priority').toLowerCase();
        const validPriorities = ['low', 'medium', 'high'];
        if (!validPriorities.includes(priority)) priority = 'medium';

        createDeal({
          borrowerName: borrowerName || 'Unknown',
          borrowerContact: getValue('borrowerContact') || null,
          loanAmount,
          interestRate: parseFloat(getValue('interestRate')) || null,
          termMonths: parseInt(getValue('termMonths')) || null,
          collateralDescription: getValue('collateralDescription') || null,
          stage: stage as any,
          priority: priority as any,
          assignedTo: getValue('assignedTo') || null,
          notes: getValue('notes') || null,
          expectedCloseDate: getValue('expectedCloseDate') || null,
        });
        imported++;
      } catch (err) {
        errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return { imported, errors };
  });

  // Export deals to CSV
  ipcMain.handle(IPC_CHANNELS.DEAL_EXPORT_CSV, async (): Promise<{ exported: number; filePath: string | null }> => {
    const deals = getAllDeals();
    
    if (deals.length === 0) {
      return { exported: 0, filePath: null };
    }

    const result = await dialog.showSaveDialog({
      title: 'Export Deals to CSV',
      defaultPath: `deals-export-${new Date().toISOString().split('T')[0]}.csv`,
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { exported: 0, filePath: null };
    }

    // Build CSV content
    const headers = [
      'Deal Number',
      'Borrower Name',
      'Borrower Contact',
      'Loan Amount',
      'Interest Rate',
      'Term (Months)',
      'Collateral Description',
      'Stage',
      'Priority',
      'Assigned To',
      'Expected Close Date',
      'Notes',
      'Created At',
      'Updated At',
    ];

    const escapeCSV = (value: string | number | null | undefined): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = deals.map(deal => [
      deal.dealNumber,
      deal.borrowerName,
      deal.borrowerContact,
      deal.loanAmount,
      deal.interestRate,
      deal.termMonths,
      deal.collateralDescription,
      deal.stage,
      deal.priority,
      deal.assignedTo,
      deal.expectedCloseDate,
      deal.notes,
      deal.createdAt,
      deal.updatedAt,
    ].map(escapeCSV).join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    
    await fs.writeFile(result.filePath, csvContent, 'utf-8');
    
    return { exported: deals.length, filePath: result.filePath };
  });

  // Update deal
  ipcMain.handle(IPC_CHANNELS.DEAL_UPDATE, async (_event, id: string, deal: Partial<Deal>): Promise<Deal | null> => {
    return updateDeal(id, deal);
  });

  // Delete deal
  ipcMain.handle(IPC_CHANNELS.DEAL_DELETE, async (_event, id: string): Promise<boolean> => {
    return deleteDeal(id);
  });

  // Export deal to PDF
  ipcMain.handle('export:dealToPdf', async (_event, dealId: string): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) {
      return { success: false, error: 'No window available' };
    }
    
    const deal = getDeal(dealId);
    if (!deal) {
      return { success: false, error: 'Deal not found' };
    }
    
    const activities = getActivitiesForDeal(dealId);
    return await exportDealToPDF(mainWindow, deal, activities);
  });

  // Export pipeline to PDF
  ipcMain.handle('export:pipelineToPdf', async (): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) {
      return { success: false, error: 'No window available' };
    }
    
    const deals = getAllDeals();
    return await exportPipelineToPDF(mainWindow, deals);
  });

  // ==========================================
  // Usage Tracking
  // ==========================================

  // Initialize usage tracking on startup
  initUsageTracking();

  // Get usage stats
  ipcMain.handle('usage:getStats', async (): Promise<UsageStats> => {
    return getUsageStats();
  });

  // Get usage limits
  ipcMain.handle('usage:getLimits', async (): Promise<UsageLimits> => {
    return getUsageLimits();
  });

  // Check usage limits
  ipcMain.handle('usage:checkLimits', async (): Promise<{
    withinLimits: boolean;
    warnings: string[];
    aiMessagesRemaining: number;
    dealsRemaining: number;
    documentsRemaining: number;
  }> => {
    return checkUsageLimits();
  });

  // Get usage percentages for display
  ipcMain.handle('usage:getPercentages', async (): Promise<{
    aiMessages: number;
    deals: number;
    documents: number;
  }> => {
    return getUsagePercentages();
  });

  // Track AI message (called from chat)
  ipcMain.handle('usage:trackAiMessage', async (): Promise<void> => {
    incrementUsage('ai_messages');
  });

  // Track deal created
  ipcMain.handle('usage:trackDealCreated', async (): Promise<void> => {
    incrementUsage('deals_created');
  });

  // Track document indexed
  ipcMain.handle('usage:trackDocumentIndexed', async (): Promise<void> => {
    incrementUsage('documents_indexed');
  });

  // Detect deal from file path - match deal by borrower name patterns in path
  ipcMain.handle(IPC_CHANNELS.DEAL_DETECT_FROM_PATH, async (_event, filePath: string): Promise<Deal | null> => {
    const allDeals = getAllDeals();
    const pathLower = filePath.toLowerCase();
    
    // Try to find deal where borrower name appears in the file path
    for (const deal of allDeals) {
      const borrowerLower = deal.borrowerName.toLowerCase();
      
      // Check if borrower name (or parts of it) appear in path
      if (pathLower.includes(borrowerLower)) {
        return deal;
      }
      
      // Try matching first word of borrower name
      const firstWord = borrowerLower.split(/\s+/)[0];
      if (firstWord.length > 3 && pathLower.includes(firstWord)) {
        return deal;
      }
      
      // Also check document path match if stored
      if (deal.documentPath && filePath.startsWith(deal.documentPath)) {
        return deal;
      }
    }
    
    return null;
  });

  // ==========================================
  // Deal Activities
  // ==========================================

  // Add deal activity
  ipcMain.handle(IPC_CHANNELS.ACTIVITY_ADD, async (_event, activity: Omit<DealActivity, 'id' | 'createdAt'>): Promise<DealActivity> => {
    return createDealActivity(activity);
  });

  // Get deal activities
  ipcMain.handle(IPC_CHANNELS.ACTIVITY_GET, async (_event, dealId?: string, _limit?: number): Promise<DealActivity[]> => {
    if (dealId) {
      return getActivitiesForDeal(dealId);
    }
    return getAllActivities();
  });

  // Update deal activity
  ipcMain.handle(IPC_CHANNELS.ACTIVITY_UPDATE, async (_event, id: string, data: Partial<Omit<DealActivity, 'id' | 'createdAt'>>): Promise<DealActivity | null> => {
    return updateDealActivity(id, data);
  });

  // Delete deal activity
  ipcMain.handle(IPC_CHANNELS.ACTIVITY_DELETE, async (_event, id: string): Promise<boolean> => {
    return deleteDealActivity(id);
  });

  // ==========================================
  // Activity Sources (Document Citations)
  // ==========================================

  // Add source to activity
  ipcMain.handle(IPC_CHANNELS.ACTIVITY_ADD_SOURCE, async (_event, activityId: string, source: ActivitySource): Promise<ActivitySource> => {
    return addActivitySource(activityId, source);
  });

  // Remove source from activity
  ipcMain.handle(IPC_CHANNELS.ACTIVITY_REMOVE_SOURCE, async (_event, sourceId: string): Promise<boolean> => {
    return removeActivitySource(sourceId);
  });

  // Export activities with sources as Markdown
  ipcMain.handle(IPC_CHANNELS.ACTIVITY_EXPORT_MARKDOWN, async (_event, dealId: string): Promise<string> => {
    const deal = getDeal(dealId);
    if (!deal) {
      throw new Error('Deal not found');
    }
    
    const activities = getActivitiesWithSources(dealId);
    return generateActivitiesMarkdown(deal, activities);
  });

  // ==========================================
  // Pipeline Analytics
  // ==========================================

  // Get pipeline analytics
  ipcMain.handle(IPC_CHANNELS.PIPELINE_GET, async (): Promise<ReturnType<typeof calculatePipelineAnalytics>> => {
    return calculatePipelineAnalytics();
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
  // Supabase Authentication
  // ==========================================

  // Initialize auth state (restore session)
  ipcMain.handle('auth:init', async () => {
    try {
      initSupabase();
      const result = await initAuthState();
      if (result) {
        return { success: true, user: result.user };
      }
      return { success: false, user: null };
    } catch (error) {
      console.error('[IPC] Auth init error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Sign up
  ipcMain.handle('auth:signUp', async (_event, email: string, password: string, fullName?: string) => {
    try {
      return await signUp(email, password, fullName);
    } catch (error) {
      console.error('[IPC] Sign up error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Sign in
  ipcMain.handle('auth:signIn', async (_event, email: string, password: string) => {
    try {
      return await signIn(email, password);
    } catch (error) {
      console.error('[IPC] Sign in error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Sign out
  ipcMain.handle('auth:signOut', async () => {
    try {
      return await signOut();
    } catch (error) {
      console.error('[IPC] Sign out error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Reset password
  ipcMain.handle('auth:resetPassword', async (_event, email: string) => {
    try {
      return await resetPassword(email);
    } catch (error) {
      console.error('[IPC] Reset password error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Get current user
  ipcMain.handle('auth:getCurrentUser', async () => {
    try {
      return await getCurrentUser();
    } catch (error) {
      console.error('[IPC] Get current user error:', error);
      return null;
    }
  });

  // Check subscription status
  ipcMain.handle('auth:checkSubscription', async () => {
    try {
      return await checkSubscription();
    } catch (error) {
      console.error('[IPC] Check subscription error:', error);
      return { hasActiveSubscription: false, subscription: null, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Open Stripe checkout
  ipcMain.handle('auth:openCheckout', async () => {
    try {
      const { url, error } = await createCheckoutSession();
      if (error || !url) {
        console.error('[IPC] Checkout error:', error);
        return { success: false, error };
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Checkout error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // ==========================================
  // OneDrive Integration
  // ==========================================

  // Start OneDrive OAuth flow
  ipcMain.handle(IPC_CHANNELS.ONEDRIVE_AUTH_START, async (): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('[IPC] Starting OneDrive authentication...');
      const result = await startOneDriveAuth();
      console.log('[IPC] OneDrive auth result:', result.success);
      return result;
    } catch (error) {
      console.error('[IPC] OneDrive auth error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Get OneDrive authentication status
  ipcMain.handle(IPC_CHANNELS.ONEDRIVE_AUTH_STATUS, async (): Promise<OneDriveAuthStatus> => {
    try {
      return await getOneDriveAuthStatus();
    } catch (error) {
      console.error('[IPC] OneDrive status error:', error);
      return { isAuthenticated: false };
    }
  });

  // Logout from OneDrive
  ipcMain.handle(IPC_CHANNELS.ONEDRIVE_LOGOUT, async (): Promise<boolean> => {
    try {
      console.log('[IPC] Logging out from OneDrive...');
      return await logoutOneDrive();
    } catch (error) {
      console.error('[IPC] OneDrive logout error:', error);
      return false;
    }
  });

  // List OneDrive folder contents
  ipcMain.handle(IPC_CHANNELS.ONEDRIVE_LIST_FOLDER, async (_event, folderId?: string): Promise<OneDriveItem[]> => {
    try {
      console.log('[IPC] Listing OneDrive folder:', folderId || 'root');
      return await listOneDriveFolder(folderId);
    } catch (error) {
      console.error('[IPC] OneDrive list folder error:', error);
      throw error;
    }
  });

  // Read OneDrive file content
  ipcMain.handle(IPC_CHANNELS.ONEDRIVE_READ_FILE, async (_event, itemId: string): Promise<{ content: string; mimeType: string }> => {
    try {
      console.log('[IPC] Reading OneDrive file:', itemId);
      return await readOneDriveFile(itemId);
    } catch (error) {
      console.error('[IPC] OneDrive read file error:', error);
      throw error;
    }
  });

  // Download OneDrive file to local path
  ipcMain.handle(IPC_CHANNELS.ONEDRIVE_DOWNLOAD_FILE, async (_event, itemId: string, localPath: string): Promise<{ success: boolean }> => {
    try {
      console.log('[IPC] Downloading OneDrive file:', itemId, 'to', localPath);
      return await downloadOneDriveFile(itemId, localPath);
    } catch (error) {
      console.error('[IPC] OneDrive download error:', error);
      throw error;
    }
  });

  // Get OneDrive folder info
  ipcMain.handle(IPC_CHANNELS.ONEDRIVE_GET_FOLDER_INFO, async (_event, folderId: string): Promise<{ id: string; name: string; path: string }> => {
    try {
      console.log('[IPC] Getting OneDrive folder info:', folderId);
      return await getOneDriveFolderInfo(folderId);
    } catch (error) {
      console.error('[IPC] OneDrive folder info error:', error);
      throw error;
    }
  });

  // ==========================================
  // Outlook Email Integration
  // ==========================================

  // Create email draft
  ipcMain.handle(IPC_CHANNELS.OUTLOOK_CREATE_DRAFT, async (_event, draft: EmailDraft): Promise<{ success: boolean; data?: { id: string; webLink: string; subject: string; createdDateTime: string }; error?: string }> => {
    try {
      console.log('[IPC] Creating email draft:', draft.subject);
      return await createEmailDraft(draft);
    } catch (error) {
      console.error('[IPC] Create email draft error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Send email draft
  ipcMain.handle(IPC_CHANNELS.OUTLOOK_SEND_DRAFT, async (_event, draftId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('[IPC] Sending email draft:', draftId);
      return await sendEmailDraft(draftId);
    } catch (error) {
      console.error('[IPC] Send email draft error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Send email directly (without creating draft first)
  ipcMain.handle(IPC_CHANNELS.OUTLOOK_SEND_DIRECT, async (_event, draft: EmailDraft): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('[IPC] Sending email directly to:', draft.to);
      return await sendEmailDirect(draft);
    } catch (error) {
      console.error('[IPC] Send email direct error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Delete email draft
  ipcMain.handle(IPC_CHANNELS.OUTLOOK_DELETE_DRAFT, async (_event, draftId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('[IPC] Deleting email draft:', draftId);
      return await deleteEmailDraft(draftId);
    } catch (error) {
      console.error('[IPC] Delete email draft error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Get email drafts
  ipcMain.handle(IPC_CHANNELS.OUTLOOK_GET_DRAFTS, async (_event, limit?: number): Promise<{ success: boolean; drafts?: Array<{ id: string; webLink: string; subject: string; createdDateTime: string }>; error?: string }> => {
    try {
      console.log('[IPC] Getting email drafts');
      return await getEmailDrafts(limit);
    } catch (error) {
      console.error('[IPC] Get email drafts error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // ==========================================
  // Chat History
  // ==========================================

  // Create new chat session
  ipcMain.handle(IPC_CHANNELS.CHAT_SESSION_CREATE, async (_event, data: {
    title?: string;
    dealId?: string;
    dealName?: string;
    sources?: ChatSessionSource[];
    firstMessage?: string;
  }): Promise<ChatSession> => {
    try {
      console.log('[IPC] Creating chat session:', data);
      return createChatSession(data);
    } catch (error) {
      console.error('[IPC] Create chat session error:', error);
      throw error;
    }
  });

  // Update chat session
  ipcMain.handle(IPC_CHANNELS.CHAT_SESSION_UPDATE, async (_event, id: string, data: Partial<{
    title: string;
    dealId: string | null;
    dealName: string | null;
    sources: ChatSessionSource[];
  }>): Promise<ChatSession | null> => {
    try {
      console.log('[IPC] Updating chat session:', id, data);
      return updateChatSession(id, data);
    } catch (error) {
      console.error('[IPC] Update chat session error:', error);
      throw error;
    }
  });

  // Delete chat session
  ipcMain.handle(IPC_CHANNELS.CHAT_SESSION_DELETE, async (_event, id: string): Promise<boolean> => {
    try {
      console.log('[IPC] Deleting chat session:', id);
      return deleteChatSession(id);
    } catch (error) {
      console.error('[IPC] Delete chat session error:', error);
      throw error;
    }
  });

  // Get chat session with messages
  ipcMain.handle(IPC_CHANNELS.CHAT_SESSION_GET, async (_event, id: string): Promise<ChatSessionFull | null> => {
    try {
      console.log('[IPC] Getting chat session:', id);
      return getChatSessionFull(id);
    } catch (error) {
      console.error('[IPC] Get chat session error:', error);
      throw error;
    }
  });

  // Get all chat sessions
  ipcMain.handle(IPC_CHANNELS.CHAT_SESSION_GET_ALL, async (): Promise<ChatSession[]> => {
    try {
      console.log('[IPC] Getting all chat sessions');
      return getAllChatSessions();
    } catch (error) {
      console.error('[IPC] Get all chat sessions error:', error);
      throw error;
    }
  });

  // Add message to chat session
  ipcMain.handle(IPC_CHANNELS.CHAT_SESSION_ADD_MESSAGE, async (_event, sessionId: string, message: ChatMessage): Promise<ChatMessage> => {
    try {
      console.log('[IPC] Adding message to session:', sessionId);
      return addChatMessage(sessionId, message);
    } catch (error) {
      console.error('[IPC] Add chat message error:', error);
      throw error;
    }
  });

  // =============================================================================
  // KNOWLEDGE PROFILE HANDLERS
  // =============================================================================

  // Get all knowledge profiles
  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_PROFILE_GET_ALL, async (): Promise<KnowledgeProfile[]> => {
    try {
      console.log('[IPC] Getting all knowledge profiles');
      return getAllKnowledgeProfiles();
    } catch (error) {
      console.error('[IPC] Get all knowledge profiles error:', error);
      throw error;
    }
  });

  // Get a single knowledge profile
  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_PROFILE_GET, async (_event, id: string): Promise<KnowledgeProfile | null> => {
    try {
      console.log('[IPC] Getting knowledge profile:', id);
      return getKnowledgeProfile(id);
    } catch (error) {
      console.error('[IPC] Get knowledge profile error:', error);
      throw error;
    }
  });

  // Create a new knowledge profile
  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_PROFILE_CREATE, async (_event, data: Partial<KnowledgeProfile>): Promise<KnowledgeProfile> => {
    try {
      console.log('[IPC] Creating knowledge profile:', data.name);
      return createKnowledgeProfile(data);
    } catch (error) {
      console.error('[IPC] Create knowledge profile error:', error);
      throw error;
    }
  });

  // Update a knowledge profile
  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_PROFILE_UPDATE, async (_event, id: string, data: Partial<KnowledgeProfile>): Promise<KnowledgeProfile | null> => {
    try {
      console.log('[IPC] Updating knowledge profile:', id);
      return updateKnowledgeProfile(id, data);
    } catch (error) {
      console.error('[IPC] Update knowledge profile error:', error);
      throw error;
    }
  });

  // Delete a knowledge profile
  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_PROFILE_DELETE, async (_event, id: string): Promise<boolean> => {
    try {
      console.log('[IPC] Deleting knowledge profile:', id);
      return deleteKnowledgeProfile(id);
    } catch (error) {
      console.error('[IPC] Delete knowledge profile error:', error);
      throw error;
    }
  });

  // Set active knowledge profile
  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_PROFILE_SET_ACTIVE, async (_event, id: string | null): Promise<boolean> => {
    try {
      console.log('[IPC] Setting active knowledge profile:', id);
      return setActiveKnowledgeProfile(id);
    } catch (error) {
      console.error('[IPC] Set active knowledge profile error:', error);
      throw error;
    }
  });

  // Get active knowledge profile with inherited guidelines
  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_PROFILE_GET_ACTIVE, async (): Promise<{ profile: KnowledgeProfile | null; fullGuidelines: string }> => {
    try {
      console.log('[IPC] Getting active knowledge profile with inheritance');
      return getActiveProfileWithInheritance();
    } catch (error) {
      console.error('[IPC] Get active knowledge profile error:', error);
      throw error;
    }
  });

  // =============================================================================
  // KNOWLEDGE DOCUMENT HANDLERS
  // =============================================================================

  // Add document to a profile
  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_DOC_ADD, async (_event, data: Partial<KnowledgeDocument>): Promise<KnowledgeDocument> => {
    try {
      console.log('[IPC] Adding knowledge document:', data.fileName);
      return addKnowledgeDocument(data);
    } catch (error) {
      console.error('[IPC] Add knowledge document error:', error);
      throw error;
    }
  });

  // Remove document from a profile
  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_DOC_REMOVE, async (_event, id: string): Promise<boolean> => {
    try {
      console.log('[IPC] Removing knowledge document:', id);
      return removeKnowledgeDocument(id);
    } catch (error) {
      console.error('[IPC] Remove knowledge document error:', error);
      throw error;
    }
  });

  // Get documents for a profile
  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_DOC_GET_BY_PROFILE, async (_event, profileId: string): Promise<KnowledgeDocument[]> => {
    try {
      console.log('[IPC] Getting knowledge documents for profile:', profileId);
      return getKnowledgeDocumentsByProfile(profileId);
    } catch (error) {
      console.error('[IPC] Get knowledge documents error:', error);
      throw error;
    }
  });

  // =============================================================================
  // DOCUMENT TEMPLATE HANDLERS
  // =============================================================================

  // Get all templates
  ipcMain.handle(IPC_CHANNELS.TEMPLATE_GET_ALL, async (): Promise<DocumentTemplate[]> => {
    try {
      console.log('[IPC] Getting all document templates');
      return getAllDocumentTemplates();
    } catch (error) {
      console.error('[IPC] Get all templates error:', error);
      throw error;
    }
  });

  // Get a single template
  ipcMain.handle(IPC_CHANNELS.TEMPLATE_GET, async (_event, id: string): Promise<DocumentTemplate | null> => {
    try {
      console.log('[IPC] Getting document template:', id);
      return getDocumentTemplate(id);
    } catch (error) {
      console.error('[IPC] Get template error:', error);
      throw error;
    }
  });

  // Create a new template
  ipcMain.handle(IPC_CHANNELS.TEMPLATE_CREATE, async (_event, data: Partial<DocumentTemplate>): Promise<DocumentTemplate> => {
    try {
      console.log('[IPC] Creating document template:', data.name);
      return createDocumentTemplate(data);
    } catch (error) {
      console.error('[IPC] Create template error:', error);
      throw error;
    }
  });

  // Update a template
  ipcMain.handle(IPC_CHANNELS.TEMPLATE_UPDATE, async (_event, id: string, data: Partial<DocumentTemplate>): Promise<DocumentTemplate | null> => {
    try {
      console.log('[IPC] Updating document template:', id);
      return updateDocumentTemplate(id, data);
    } catch (error) {
      console.error('[IPC] Update template error:', error);
      throw error;
    }
  });

  // Delete a template
  ipcMain.handle(IPC_CHANNELS.TEMPLATE_DELETE, async (_event, id: string): Promise<boolean> => {
    try {
      console.log('[IPC] Deleting document template:', id);
      return deleteDocumentTemplate(id);
    } catch (error) {
      console.error('[IPC] Delete template error:', error);
      throw error;
    }
  });

  // =============================================================================
  // GENERATED MEMO HANDLERS
  // =============================================================================

  // Generate a memo (AI-powered)
  ipcMain.handle(IPC_CHANNELS.MEMO_GENERATE, async (_event, request: MemoGenerationRequest): Promise<GeneratedMemo> => {
    try {
      console.log('[IPC] Generating memo for deal:', request.dealId);
      
      // Get the template
      const template = getDocumentTemplate(request.templateId);
      if (!template) {
        throw new Error('Template not found');
      }
      
      // Get the deal
      const deal = getDeal(request.dealId);
      if (!deal) {
        throw new Error('Deal not found');
      }
      
      // Get active profile for context
      const { profile } = getActiveProfileWithInheritance();
      
      // For now, create a memo with placeholder content that will be filled by the AI
      // The actual AI generation will be triggered from the renderer after this memo is created
      const memo = createGeneratedMemo({
        dealId: request.dealId,
        templateId: request.templateId,
        templateName: template.name,
        profileId: profile?.id || request.profileId,
        content: template.content || '',
        manualFields: request.fieldValues || {},
        inferredFields: {},
        status: 'draft',
        version: 1,
      });
      
      return memo;
    } catch (error) {
      console.error('[IPC] Generate memo error:', error);
      throw error;
    }
  });

  // Get memos for a deal
  ipcMain.handle(IPC_CHANNELS.MEMO_GET_BY_DEAL, async (_event, dealId: string): Promise<GeneratedMemo[]> => {
    try {
      console.log('[IPC] Getting memos for deal:', dealId);
      return getMemosByDeal(dealId);
    } catch (error) {
      console.error('[IPC] Get memos by deal error:', error);
      throw error;
    }
  });

  // Get a single memo
  ipcMain.handle(IPC_CHANNELS.MEMO_GET, async (_event, id: string): Promise<GeneratedMemo | null> => {
    try {
      console.log('[IPC] Getting memo:', id);
      return getGeneratedMemo(id);
    } catch (error) {
      console.error('[IPC] Get memo error:', error);
      throw error;
    }
  });

  // Update a memo
  ipcMain.handle(IPC_CHANNELS.MEMO_UPDATE, async (_event, id: string, data: Partial<GeneratedMemo>): Promise<GeneratedMemo | null> => {
    try {
      console.log('[IPC] Updating memo:', id);
      return updateGeneratedMemo(id, data);
    } catch (error) {
      console.error('[IPC] Update memo error:', error);
      throw error;
    }
  });

  // Delete a memo
  ipcMain.handle(IPC_CHANNELS.MEMO_DELETE, async (_event, id: string): Promise<boolean> => {
    try {
      console.log('[IPC] Deleting memo:', id);
      return deleteGeneratedMemo(id);
    } catch (error) {
      console.error('[IPC] Delete memo error:', error);
      throw error;
    }
  });

  // Export memo to file
  ipcMain.handle(IPC_CHANNELS.MEMO_EXPORT, async (_event, id: string, format: 'md' | 'txt' | 'pdf'): Promise<string | null> => {
    try {
      console.log('[IPC] Exporting memo:', id, 'as', format);
      
      const memo = getGeneratedMemo(id);
      if (!memo) {
        throw new Error('Memo not found');
      }
      
      const deal = getDeal(memo.dealId);
      const defaultFileName = `${deal?.borrowerName || 'memo'}_${memo.templateName || 'document'}_${new Date().toISOString().split('T')[0]}`;
      
      const result = await dialog.showSaveDialog({
        defaultPath: `${defaultFileName}.${format === 'pdf' ? 'md' : format}`,
        filters: [
          { name: format.toUpperCase(), extensions: [format === 'pdf' ? 'md' : format] },
        ],
      });
      
      if (result.canceled || !result.filePath) {
        return null;
      }
      
      await fs.writeFile(result.filePath, memo.content, 'utf-8');
      
      // Update memo status to exported
      updateGeneratedMemo(id, { status: 'exported' });
      
      return result.filePath;
    } catch (error) {
      console.error('[IPC] Export memo error:', error);
      throw error;
    }
  });
}

/**
 * Generate Markdown export of activities with citations
 */
function generateActivitiesMarkdown(deal: Deal, activities: DealActivity[]): string {
  const lines: string[] = [];
  const allSources: Array<{ index: number; source: ActivitySource }> = [];
  let sourceIndex = 1;
  
  // Header
  lines.push(`# Deal Activity Report`);
  lines.push(``);
  lines.push(`**Deal:** ${deal.dealNumber}`);
  lines.push(`**Borrower:** ${deal.borrowerName}`);
  lines.push(`**Loan Amount:** $${deal.loanAmount.toLocaleString()}`);
  lines.push(`**Stage:** ${deal.stage}`);
  lines.push(`**Generated:** ${new Date().toLocaleDateString()}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  
  // Activities
  lines.push(`## Activities`);
  lines.push(``);
  
  if (activities.length === 0) {
    lines.push(`*No activities recorded.*`);
  } else {
    for (const activity of activities) {
      const date = new Date(activity.performedAt).toLocaleDateString();
      const time = new Date(activity.performedAt).toLocaleTimeString();
      const typeLabel = activity.type.charAt(0).toUpperCase() + activity.type.slice(1);
      
      lines.push(`### ${typeLabel} - ${date} ${time}`);
      if (activity.performedBy) {
        lines.push(`*By: ${activity.performedBy}*`);
      }
      lines.push(``);
      
      // Description with inline citations
      let description = activity.description;
      const activitySources = activity.sources || [];
      
      if (activitySources.length > 0) {
        // Add citation numbers to the end of description
        const citations = activitySources.map(source => {
          const idx = sourceIndex++;
          allSources.push({ index: idx, source });
          return `[${idx}]`;
        }).join('');
        description += ` ${citations}`;
      }
      
      lines.push(description);
      lines.push(``);
    }
  }
  
  // References section
  if (allSources.length > 0) {
    lines.push(`---`);
    lines.push(``);
    lines.push(`## References`);
    lines.push(``);
    
    for (const { index, source } of allSources) {
      let citation = `**[${index}]** ${source.fileName}`;
      
      if (source.pageNumber) {
        citation += `, page ${source.pageNumber}`;
      }
      if (source.section) {
        citation += `, "${source.section}"`;
      }
      
      lines.push(citation);
      lines.push(`  - Path: \`${source.filePath}\``);
      lines.push(``);
    }
  }
  
  return lines.join('\n');
}
