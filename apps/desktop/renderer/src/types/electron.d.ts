import type { 
  DirEntry, 
  FileStat, 
  FileReadResult, 
  ChatRequest, 
  ChatStreamChunk, 
  PersistedState,
  Deal,
  DealActivity,
  PipelineAnalytics,
  SchematicToolCall,
  SchematicToolResponse,
  OneDriveItem,
  OneDriveAuthStatus,
  ChatSession,
  ChatSessionFull,
  ChatMessage,
  ChatSessionSource,
  ActivitySource,
} from '@drasill/shared';

interface ElectronAPI {
  selectWorkspace: () => Promise<string | null>;
  readDir: (path: string) => Promise<DirEntry[]>;
  readFile: (path: string) => Promise<FileReadResult>;
  readFileBinary: (path: string) => Promise<{ path: string; data: string }>;
  readWordFile: (path: string) => Promise<{ path: string; content: string }>;
  readWordFileBuffer: (base64Data: string) => Promise<{ content: string }>;
  stat: (path: string) => Promise<FileStat>;
  addFiles: (workspacePath: string) => Promise<{ added: number; cancelled: boolean }>;
  deleteFile: (filePath: string) => Promise<{ success: boolean }>;
  deleteFolder: (folderPath: string) => Promise<{ success: boolean }>;
  createFile: (parentPath: string, fileName: string) => Promise<{ success: boolean; filePath: string | null }>;
  createFolder: (parentPath: string, folderName: string) => Promise<{ success: boolean; folderPath: string | null }>;
  renameFile: (oldPath: string, newName: string) => Promise<{ success: boolean; newPath: string | null }>;
  closeWorkspace: () => Promise<{ success: boolean }>;
  onMenuOpenWorkspace: (callback: () => void) => () => void;
  onMenuCloseTab: (callback: () => void) => () => void;
  onMenuCommandPalette: (callback: () => void) => () => void;
  // Chat API
  sendChatMessage: (request: ChatRequest) => Promise<void>;
  onChatStreamStart: (callback: (data: { messageId: string; ragSources: Array<{ fileName: string; filePath: string; section: string; source?: 'local' | 'onedrive'; oneDriveId?: string }> }) => void) => () => void;
  onChatStreamChunk: (callback: (chunk: ChatStreamChunk) => void) => () => void;
  onChatStreamEnd: (callback: (data: { id: string; cancelled?: boolean }) => void) => () => void;
  onChatStreamError: (callback: (data: { id?: string; error: string }) => void) => () => void;
  setApiKey: (apiKey: string) => Promise<boolean>;
  getApiKey: () => Promise<{ hasKey: boolean; maskedKey: string | null }>;
  cancelChat: () => Promise<void>;
  onChatToolExecuted: (callback: (data: { action: string; data: unknown }) => void) => () => void;
  // RAG API
  indexWorkspace: (workspacePath: string, forceReindex?: boolean) => Promise<{ success: boolean; chunksIndexed: number; error?: string; fromCache?: boolean }>;
  indexOneDriveWorkspace: (folderId: string, folderPath: string, forceReindex?: boolean) => Promise<{ success: boolean; chunksIndexed: number; error?: string; fromCache?: boolean }>;
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
  // Deal API
  getAllDeals: () => Promise<Deal[]>;
  getDeal: (id: string) => Promise<Deal | null>;
  addDeal: (deal: Omit<Deal, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Deal>;
  updateDeal: (id: string, deal: Partial<Deal>) => Promise<Deal | null>;
  deleteDeal: (id: string) => Promise<boolean>;
  importDealsFromCSV: () => Promise<{ imported: number; errors: string[] }>;
  exportDealsToCSV: () => Promise<{ exported: number; filePath: string | null }>;
  detectDealFromPath: (filePath: string) => Promise<Deal | null>;
  // Export API
  exportDealToPdf: (dealId: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  exportPipelineToPdf: () => Promise<{ success: boolean; filePath?: string; error?: string }>;
  // Usage Tracking API
  getUsageStats: () => Promise<{
    aiMessagesThisMonth: number;
    aiMessagesToday: number;
    dealsCreatedThisMonth: number;
    documentsIndexedThisMonth: number;
    lastResetDate: string;
  }>;
  getUsageLimits: () => Promise<{
    aiMessagesPerMonth: number;
    dealsPerMonth: number;
    documentsPerMonth: number;
  }>;
  checkUsageLimits: () => Promise<{
    withinLimits: boolean;
    warnings: string[];
    aiMessagesRemaining: number;
    dealsRemaining: number;
    documentsRemaining: number;
  }>;
  getUsagePercentages: () => Promise<{
    aiMessages: number;
    deals: number;
    documents: number;
  }>;
  trackAiMessage: () => Promise<void>;
  trackDealCreated: () => Promise<void>;
  trackDocumentIndexed: () => Promise<void>;
  // Deal Activities API
  addDealActivity: (activity: Omit<DealActivity, 'id' | 'createdAt'>) => Promise<DealActivity>;
  getActivitiesForDeal: (dealId: string, limit?: number) => Promise<DealActivity[]>;
  getAllActivities: (limit?: number) => Promise<DealActivity[]>;
  updateDealActivity: (id: string, data: Partial<Omit<DealActivity, 'id' | 'createdAt'>>) => Promise<DealActivity | null>;
  deleteDealActivity: (id: string) => Promise<boolean>;
  // Activity Sources (Document Citations) API
  addActivitySource: (activityId: string, source: ActivitySource) => Promise<ActivitySource>;
  removeActivitySource: (sourceId: string) => Promise<boolean>;
  exportActivitiesMarkdown: (dealId: string) => Promise<string>;
  // Pipeline Analytics API
  getPipelineAnalytics: () => Promise<PipelineAnalytics>;
  // Schematics API
  processSchematicToolCall: (toolCall: SchematicToolCall) => Promise<SchematicToolResponse>;
  getSchematicImage: (imagePath: string) => Promise<string>;
  // PDF Extraction API (for RAG)
  signalPdfExtractorReady: () => void;
  onPdfExtractRequest: (callback: (data: { requestId: string; filePath?: string; base64Data?: string; fileName?: string }) => void) => () => void;
  sendPdfExtractResult: (data: { requestId: string; text: string; error?: string }) => void;
  // OneDrive API
  startOneDriveAuth: () => Promise<{ success: boolean; error?: string }>;
  getOneDriveAuthStatus: () => Promise<OneDriveAuthStatus>;
  logoutOneDrive: () => Promise<boolean>;
  listOneDriveFolder: (folderId?: string) => Promise<OneDriveItem[]>;
  readOneDriveFile: (itemId: string) => Promise<{ content: string; mimeType: string }>;
  downloadOneDriveFile: (itemId: string, localPath: string) => Promise<{ success: boolean }>;
  getOneDriveFolderInfo: (folderId: string) => Promise<{ id: string; name: string; path: string }>;
  // Chat History API
  createChatSession: (data: {
    title?: string;
    dealId?: string;
    dealName?: string;
    sources?: ChatSessionSource[];
    firstMessage?: string;
  }) => Promise<ChatSession>;
  updateChatSession: (id: string, data: Partial<{
    title: string;
    dealId: string | null;
    dealName: string | null;
    sources: ChatSessionSource[];
  }>) => Promise<ChatSession | null>;
  deleteChatSession: (id: string) => Promise<boolean>;
  getChatSession: (id: string) => Promise<ChatSessionFull | null>;
  getAllChatSessions: () => Promise<ChatSession[]>;
  addChatMessage: (sessionId: string, message: ChatMessage) => Promise<ChatMessage>;
  // Authentication API
  authSignIn: (email: string, password: string) => Promise<{ success: boolean; user?: any; error?: string }>;
  authSignOut: () => Promise<{ success: boolean; error?: string }>;
  authResetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  authGetCurrentUser: () => Promise<{ user: any; session: any } | null>;
  authCheckSubscription: () => Promise<{ hasActiveSubscription: boolean; subscription: any; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
