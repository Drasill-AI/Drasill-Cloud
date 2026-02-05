import { create } from 'zustand';
import { Tab, TreeNode, getFileType, ChatMessage, FileContext, PersistedState, Deal, DealActivity, BottomPanelState, SchematicToolCall, SchematicData, OneDriveAuthStatus, OneDriveItem, ChatSession, ChatSessionFull, ChatSessionSource } from '@drasill/shared';

interface ToastMessage {
  id: string;
  type: 'error' | 'success' | 'info';
  message: string;
}

// Split view types
type SplitPaneId = 'primary' | 'secondary';

interface AppState {
  // Workspace
  workspacePath: string | null;
  tree: TreeNode[];
  isLoadingTree: boolean;

  // Chat
  chatMessages: ChatMessage[];
  isChatLoading: boolean;
  chatError: string | null;
  
  // Chat History
  chatSessions: ChatSession[];
  currentSessionId: string | null;
  isHistoryOpen: boolean;

  // RAG
  isIndexing: boolean;
  indexingProgress: { current: number; total: number; fileName: string; percentage: number } | null;
  ragChunksCount: number;

  // Tabs (primary pane)
  tabs: Tab[];
  activeTabId: string | null;
  
  // Split View
  splitViewEnabled: boolean;
  secondaryTabs: Tab[];
  secondaryActiveTabId: string | null;
  activePaneId: SplitPaneId;
  
  // File content cache
  fileContents: Map<string, string>;
  loadingFiles: Set<string>;

  // UI state
  isCommandPaletteOpen: boolean;
  toasts: ToastMessage[];

  // Tab view states (for Monaco)
  tabViewStates: Map<string, unknown>;

  // Deals & Activities
  deals: Deal[];
  selectedDealId: string | null;
  detectedDeal: Deal | null;
  isActivityModalOpen: boolean;
  isDealModalOpen: boolean;
  activitiesRefreshTrigger: number;
  editingActivity: DealActivity | null;
  editingDeal: Deal | null;

  // Bottom Panel
  bottomPanelState: BottomPanelState;

  // OneDrive
  oneDriveStatus: OneDriveAuthStatus;
  workspaceSource: 'local' | 'onedrive';
  oneDriveFolderId: string | null;
  isOneDrivePickerOpen: boolean;

  // Onboarding
  hasCompletedOnboarding: boolean;
  isOnboardingOpen: boolean;

  // Recent Files
  recentFiles: Array<{
    path: string;
    name: string;
    source: 'local' | 'onedrive';
    oneDriveId?: string;
    timestamp: number;
  }>;

  // Actions
  openWorkspace: () => Promise<void>;
  closeWorkspace: () => Promise<void>;
  setWorkspacePath: (path: string | null) => void;
  loadDirectory: (path: string) => Promise<TreeNode[]>;
  toggleDirectory: (node: TreeNode) => Promise<void>;
  refreshTree: () => Promise<void>;
  deleteFile: (filePath: string) => Promise<boolean>;
  deleteFolder: (folderPath: string) => Promise<boolean>;
  createFile: (parentPath: string, fileName: string) => Promise<boolean>;
  createFolder: (parentPath: string, folderName: string) => Promise<boolean>;
  renameItem: (oldPath: string, newName: string) => Promise<boolean>;
  
  openFile: (path: string, name: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  closeActiveTab: () => void;
  setActiveTab: (tabId: string) => void;
  saveTabViewState: (tabId: string, viewState: unknown) => void;
  getTabViewState: (tabId: string) => unknown | undefined;
  
  // Split view actions
  openFileInSplitView: (path: string, name: string, source?: 'local' | 'onedrive', oneDriveId?: string, initialPage?: number) => Promise<void>;
  toggleSplitView: () => void;
  closeSplitView: () => void;
  setActivePaneId: (paneId: SplitPaneId) => void;
  closeSecondaryTab: (tabId: string) => void;
  setSecondaryActiveTab: (tabId: string) => void;

  toggleCommandPalette: () => void;
  
  showToast: (type: ToastMessage['type'], message: string) => void;
  dismissToast: (id: string) => void;

  // Chat actions
  sendMessage: (content: string, fileContext?: FileContext) => Promise<void>;
  clearChat: () => void;
  cancelChat: () => void;
  
  // Chat History actions
  loadChatSessions: () => Promise<void>;
  startNewSession: (dealId?: string, dealName?: string) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  toggleHistory: () => void;
  updateSessionSources: (sources: ChatSessionSource[]) => Promise<void>;

  // RAG actions
  indexWorkspace: (forceReindex?: boolean) => Promise<void>;
  checkRagStatus: () => Promise<void>;
  loadRagCache: (workspacePath: string) => Promise<boolean>;
  clearRagIndex: () => Promise<void>;

  // State persistence
  savePersistedState: () => Promise<void>;
  loadPersistedState: () => Promise<void>;
  restoreWorkspace: (path: string) => Promise<void>;

  // Deal actions
  loadDeals: () => Promise<void>;
  setSelectedDeal: (id: string | null) => void;
  detectDealFromFile: (path: string) => Promise<void>;
  setActivityModalOpen: (open: boolean) => void;
  setDealModalOpen: (open: boolean) => void;
  setEditingActivity: (activity: DealActivity | null) => void;
  setEditingDeal: (deal: Deal | null) => void;
  refreshActivities: () => void;
  exportDealToPdf: (dealId: string) => Promise<void>;
  exportPipelineToPdf: () => Promise<void>;

  // Bottom panel actions
  setBottomPanelOpen: (open: boolean) => void;
  setBottomPanelHeight: (height: number) => void;
  toggleBottomPanel: () => void;

  // Schematic actions
  openSchematicTab: (toolCall: SchematicToolCall) => Promise<void>;

  // OneDrive actions
  checkOneDriveStatus: () => Promise<void>;
  loginOneDrive: () => Promise<void>;
  logoutOneDrive: () => Promise<void>;
  openOneDriveWorkspace: (folderId: string, folderName: string, folderPath: string) => Promise<void>;
  loadOneDriveDirectory: (folderId?: string) => Promise<TreeNode[]>;
  toggleOneDriveDirectory: (node: TreeNode) => Promise<void>;
  openOneDriveFile: (node: TreeNode, initialPage?: number) => Promise<void>;
  setOneDrivePickerOpen: (open: boolean) => void;
  
  // Onboarding actions
  setOnboardingOpen: (open: boolean) => void;
  completeOnboarding: () => void;
  
  // Recent files actions
  addToRecentFiles: (path: string, name: string, source: 'local' | 'onedrive', oneDriveId?: string) => void;
  clearRecentFiles: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  workspacePath: null,
  tree: [],
  isLoadingTree: false,
  tabs: [],
  activeTabId: null,
  fileContents: new Map(),
  loadingFiles: new Set(),
  isCommandPaletteOpen: false,
  toasts: [],
  tabViewStates: new Map(),
  
  // Split view state
  splitViewEnabled: false,
  secondaryTabs: [],
  secondaryActiveTabId: null,
  activePaneId: 'primary',
  
  // Chat state
  chatMessages: [],
  isChatLoading: false,
  chatError: null,
  
  // Chat History state
  chatSessions: [],
  currentSessionId: null,
  isHistoryOpen: false,

  // RAG state
  isIndexing: false,
  indexingProgress: null,
  ragChunksCount: 0,

  // Deals & Activities state
  deals: [],
  selectedDealId: null,
  detectedDeal: null,
  isActivityModalOpen: false,
  isDealModalOpen: false,
  activitiesRefreshTrigger: 0,
  editingActivity: null,
  editingDeal: null,

  // Bottom panel state
  bottomPanelState: {
    isOpen: false,
    height: 200,
    activeTab: 'activities',
  },

  // OneDrive state
  oneDriveStatus: { isAuthenticated: false },
  workspaceSource: 'local',
  oneDriveFolderId: null,
  isOneDrivePickerOpen: false,

  // Onboarding state
  hasCompletedOnboarding: false,
  isOnboardingOpen: false,

  // Recent files state
  recentFiles: [],

  // Actions
  openWorkspace: async () => {
    try {
      const path = await window.electronAPI.selectWorkspace();
      if (path) {
        set({ workspacePath: path, tree: [], tabs: [], activeTabId: null, fileContents: new Map() });
        const children = await get().loadDirectory(path);
        set({
          tree: [{
            id: path,
            name: path.split(/[\\/]/).pop() || path,
            path: path,
            isDirectory: true,
            isExpanded: true,
            children,
          }],
        });
        // Persist state
        get().savePersistedState();
      }
    } catch (error) {
      get().showToast('error', `Failed to open workspace: ${error}`);
    }
  },

  closeWorkspace: async () => {
    try {
      await window.electronAPI.closeWorkspace();
      set({ 
        workspacePath: null, 
        tree: [], 
        tabs: [], 
        activeTabId: null, 
        fileContents: new Map(),
        selectedDealId: null,
        detectedDeal: null,
      });
      get().savePersistedState();
      get().showToast('info', 'Workspace closed');
    } catch (error) {
      get().showToast('error', `Failed to close workspace: ${error}`);
    }
  },

  setWorkspacePath: (path) => {
    set({ workspacePath: path });
  },

  loadDirectory: async (path: string): Promise<TreeNode[]> => {
    try {
      const entries = await window.electronAPI.readDir(path);
      return entries.map((entry) => ({
        id: entry.path,
        name: entry.name,
        path: entry.path,
        isDirectory: entry.isDirectory,
        extension: entry.extension,
        isExpanded: false,
        children: entry.isDirectory ? undefined : undefined,
      }));
    } catch (error) {
      get().showToast('error', `Failed to read directory: ${error}`);
      return [];
    }
  },

  refreshTree: async () => {
    const { workspacePath, loadDirectory } = get();
    if (!workspacePath) return;
    
    try {
      const children = await loadDirectory(workspacePath);
      set({
        tree: [{
          id: workspacePath,
          name: workspacePath.split(/[\\/]/).pop() || workspacePath,
          path: workspacePath,
          isDirectory: true,
          isExpanded: true,
          children,
        }],
      });
    } catch (error) {
      get().showToast('error', `Failed to refresh tree: ${error}`);
    }
  },

  deleteFile: async (filePath: string): Promise<boolean> => {
    try {
      const result = await window.electronAPI.deleteFile(filePath);
      if (result.success) {
        // Close any open tabs for this file
        const { tabs, activeTabId } = get();
        const tabToClose = tabs.find(t => t.path === filePath);
        if (tabToClose) {
          get().closeTab(tabToClose.id);
        }
        await get().refreshTree();
        get().showToast('success', 'File deleted');
      }
      return result.success;
    } catch (error) {
      get().showToast('error', `Failed to delete file: ${error}`);
      return false;
    }
  },

  deleteFolder: async (folderPath: string): Promise<boolean> => {
    try {
      const result = await window.electronAPI.deleteFolder(folderPath);
      if (result.success) {
        // Close any open tabs for files in this folder
        const { tabs } = get();
        const tabsToClose = tabs.filter(t => t.path.startsWith(folderPath));
        tabsToClose.forEach(tab => get().closeTab(tab.id));
        await get().refreshTree();
        get().showToast('success', 'Folder deleted');
      }
      return result.success;
    } catch (error) {
      get().showToast('error', `Failed to delete folder: ${error}`);
      return false;
    }
  },

  createFile: async (parentPath: string, fileName: string): Promise<boolean> => {
    try {
      const result = await window.electronAPI.createFile(parentPath, fileName);
      if (result.success) {
        await get().refreshTree();
        // Open the newly created file
        if (result.filePath) {
          get().openFile(result.filePath, fileName);
        }
        get().showToast('success', 'File created');
      }
      return result.success;
    } catch (error) {
      get().showToast('error', `Failed to create file: ${error}`);
      return false;
    }
  },

  createFolder: async (parentPath: string, folderName: string): Promise<boolean> => {
    try {
      const result = await window.electronAPI.createFolder(parentPath, folderName);
      if (result.success) {
        await get().refreshTree();
        get().showToast('success', 'Folder created');
      }
      return result.success;
    } catch (error) {
      get().showToast('error', `Failed to create folder: ${error}`);
      return false;
    }
  },

  renameItem: async (oldPath: string, newName: string): Promise<boolean> => {
    try {
      const result = await window.electronAPI.renameFile(oldPath, newName);
      if (result.success) {
        // Update any open tabs with the old path
        const { tabs } = get();
        const affectedTab = tabs.find(t => t.path === oldPath || t.path.startsWith(oldPath + '/') || t.path.startsWith(oldPath + '\\'));
        if (affectedTab && result.newPath) {
          // Update tab path
          set((state) => ({
            tabs: state.tabs.map(t => {
              if (t.path === oldPath) {
                return { ...t, path: result.newPath!, name: newName };
              }
              // Handle files inside a renamed folder
              if (t.path.startsWith(oldPath + '/') || t.path.startsWith(oldPath + '\\')) {
                const newTabPath = result.newPath + t.path.slice(oldPath.length);
                return { ...t, path: newTabPath };
              }
              return t;
            }),
          }));
        }
        await get().refreshTree();
        get().showToast('success', 'Renamed successfully');
      }
      return result.success;
    } catch (error) {
      get().showToast('error', `Failed to rename: ${error}`);
      return false;
    }
  },

  toggleDirectory: async (node: TreeNode) => {
    const updateNode = (nodes: TreeNode[], targetId: string, updater: (n: TreeNode) => TreeNode): TreeNode[] => {
      return nodes.map((n) => {
        if (n.id === targetId) {
          return updater(n);
        }
        if (n.children) {
          return { ...n, children: updateNode(n.children, targetId, updater) };
        }
        return n;
      });
    };

    if (node.isExpanded) {
      // Collapse
      set((state) => ({
        tree: updateNode(state.tree, node.id, (n) => ({ ...n, isExpanded: false })),
      }));
    } else {
      // Expand and load children
      const children = await get().loadDirectory(node.path);
      set((state) => ({
        tree: updateNode(state.tree, node.id, (n) => ({
          ...n,
          isExpanded: true,
          children,
        })),
      }));
    }
  },

  openFile: async (path: string, name: string) => {
    const { tabs, loadingFiles, addToRecentFiles } = get();

    // Check if already open
    const existingTab = tabs.find((t) => t.path === path);
    if (existingTab) {
      set({ activeTabId: existingTab.id });
      // Still track as recent file
      addToRecentFiles(path, name, 'local');
      return;
    }

    const fileType = getFileType(path);

    // For PDF, just create a tab without loading content (PDF viewer handles it)
    if (fileType === 'pdf') {
      const newTab: Tab = {
        id: path,
        name,
        path,
        type: 'pdf',
      };
      set((state) => ({
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
      }));
      // Track recent file
      addToRecentFiles(path, name, 'local');
      // Persist state
      get().savePersistedState();
      return;
    }

    // For Word files, just create a tab without loading content (Word viewer handles it)
    if (fileType === 'word') {
      const newTab: Tab = {
        id: path,
        name,
        path,
        type: 'word',
      };
      set((state) => ({
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
      }));
      // Track recent file
      addToRecentFiles(path, name, 'local');
      // Persist state
      get().savePersistedState();
      return;
    }

    // Skip if already loading
    if (loadingFiles.has(path)) return;

    // Load file content
    set((state) => ({
      loadingFiles: new Set(state.loadingFiles).add(path),
    }));

    try {
      const result = await window.electronAPI.readFile(path);
      
      const newTab: Tab = {
        id: path,
        name,
        path,
        type: fileType,
      };

      const newContents = new Map(get().fileContents);
      newContents.set(path, result.content);

      const newLoading = new Set(get().loadingFiles);
      newLoading.delete(path);

      set((state) => ({
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
        fileContents: newContents,
        loadingFiles: newLoading,
      }));
      // Track recent file
      addToRecentFiles(path, name, 'local');
      // Persist state
      get().savePersistedState();
    } catch (error) {
      const newLoading = new Set(get().loadingFiles);
      newLoading.delete(path);
      set({ loadingFiles: newLoading });
      get().showToast('error', `Failed to open file: ${error}`);
    }
  },

  closeTab: (tabId: string) => {
    set((state) => {
      const tabIndex = state.tabs.findIndex((t) => t.id === tabId);
      const newTabs = state.tabs.filter((t) => t.id !== tabId);
      
      // Clean up file content
      const newContents = new Map(state.fileContents);
      newContents.delete(tabId);

      // Clean up view state
      const newViewStates = new Map(state.tabViewStates);
      newViewStates.delete(tabId);

      // Determine new active tab
      let newActiveTabId = state.activeTabId;
      if (state.activeTabId === tabId) {
        if (newTabs.length === 0) {
          newActiveTabId = null;
        } else if (tabIndex >= newTabs.length) {
          newActiveTabId = newTabs[newTabs.length - 1].id;
        } else {
          newActiveTabId = newTabs[tabIndex].id;
        }
      }

      return {
        tabs: newTabs,
        activeTabId: newActiveTabId,
        fileContents: newContents,
        tabViewStates: newViewStates,
      };
    });
    // Persist state after closing tab
    get().savePersistedState();
  },

  closeActiveTab: () => {
    const { activeTabId, closeTab } = get();
    if (activeTabId) {
      closeTab(activeTabId);
    }
  },

  setActiveTab: (tabId: string) => {
    set({ activeTabId: tabId });
    // Persist active tab change
    get().savePersistedState();
  },

  // Split view actions
  openFileInSplitView: async (path: string, name: string, source?: 'local' | 'onedrive', oneDriveId?: string, initialPage?: number) => {
    const { secondaryTabs, fileContents } = get();
    
    // Enable split view if not already
    set({ splitViewEnabled: true, activePaneId: 'secondary' });

    // Check if already open in secondary pane
    const existingTab = secondaryTabs.find((t) => t.path === path);
    if (existingTab) {
      // If it's a PDF with a new initial page, update it
      if (initialPage !== undefined && existingTab.type === 'pdf') {
        set((state) => ({
          secondaryTabs: state.secondaryTabs.map(t => 
            t.id === existingTab.id ? { ...t, initialPage } : t
          ),
          secondaryActiveTabId: existingTab.id,
        }));
      } else {
        set({ secondaryActiveTabId: existingTab.id });
      }
      return;
    }

    const fileType = getFileType(path);

    // Create new tab for secondary pane
    const newTab: Tab = {
      id: `secondary-${path}`,
      name,
      path,
      type: fileType,
      source: source,
      oneDriveId: oneDriveId,
      initialPage: initialPage,
    };

    // For PDF/Word, just create tab (viewers handle loading)
    if (fileType === 'pdf' || fileType === 'word') {
      set((state) => ({
        secondaryTabs: [...state.secondaryTabs, newTab],
        secondaryActiveTabId: newTab.id,
      }));
      return;
    }

    // For text files, load content if not already cached
    if (!fileContents.has(path)) {
      try {
        let content: string;
        if (source === 'onedrive' && oneDriveId) {
          const result = await window.electronAPI.readOneDriveFile(oneDriveId);
          content = result.content;
        } else {
          const result = await window.electronAPI.readFile(path);
          content = result.content;
        }
        
        const newContents = new Map(get().fileContents);
        newContents.set(path, content);
        set({ fileContents: newContents });
      } catch (error) {
        get().showToast('error', `Failed to open file in split view: ${error}`);
        return;
      }
    }

    set((state) => ({
      secondaryTabs: [...state.secondaryTabs, newTab],
      secondaryActiveTabId: newTab.id,
    }));
  },

  toggleSplitView: () => {
    set((state) => ({ splitViewEnabled: !state.splitViewEnabled }));
  },

  closeSplitView: () => {
    set({
      splitViewEnabled: false,
      secondaryTabs: [],
      secondaryActiveTabId: null,
      activePaneId: 'primary',
    });
  },

  setActivePaneId: (paneId) => {
    set({ activePaneId: paneId });
  },

  closeSecondaryTab: (tabId: string) => {
    set((state) => {
      const tabIndex = state.secondaryTabs.findIndex((t) => t.id === tabId);
      const newTabs = state.secondaryTabs.filter((t) => t.id !== tabId);

      // Determine new active tab
      let newActiveTabId = state.secondaryActiveTabId;
      if (state.secondaryActiveTabId === tabId) {
        if (newTabs.length === 0) {
          newActiveTabId = null;
        } else if (tabIndex >= newTabs.length) {
          newActiveTabId = newTabs[newTabs.length - 1].id;
        } else {
          newActiveTabId = newTabs[tabIndex].id;
        }
      }

      // If no tabs left, close split view
      if (newTabs.length === 0) {
        return {
          splitViewEnabled: false,
          secondaryTabs: [],
          secondaryActiveTabId: null,
          activePaneId: 'primary',
        };
      }

      return {
        secondaryTabs: newTabs,
        secondaryActiveTabId: newActiveTabId,
      };
    });
  },

  setSecondaryActiveTab: (tabId: string) => {
    set({ secondaryActiveTabId: tabId, activePaneId: 'secondary' });
  },

  saveTabViewState: (tabId: string, viewState: unknown) => {
    set((state) => {
      const newViewStates = new Map(state.tabViewStates);
      newViewStates.set(tabId, viewState);
      return { tabViewStates: newViewStates };
    });
  },

  getTabViewState: (tabId: string) => {
    return get().tabViewStates.get(tabId);
  },

  toggleCommandPalette: () => {
    set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen }));
  },

  showToast: (type, message) => {
    const id = Math.random().toString(36).slice(2);
    set((state) => ({
      toasts: [...state.toasts, { id, type, message }],
    }));

    // Auto dismiss after 5 seconds
    setTimeout(() => {
      get().dismissToast(id);
    }, 5000);
  },

  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  // Chat actions

  sendMessage: async (content: string, fileContext?: FileContext) => {
    // Auto-create session if needed
    let { currentSessionId, detectedDeal } = get();
    if (!currentSessionId) {
      try {
        const session = await window.electronAPI.createChatSession({
          dealId: detectedDeal?.id,
          dealName: detectedDeal?.borrowerName,
          firstMessage: content.slice(0, 100),
        });
        currentSessionId = session.id;
        set((state) => ({
          currentSessionId: session.id,
          chatSessions: [session, ...state.chatSessions],
        }));
      } catch (error) {
        console.error('Failed to create chat session:', error);
      }
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    // Save user message to database
    if (currentSessionId) {
      try {
        await window.electronAPI.addChatMessage(currentSessionId, userMessage);
      } catch (error) {
        console.error('Failed to save user message:', error);
      }
    }

    set((state) => ({
      chatMessages: [...state.chatMessages, userMessage],
      isChatLoading: true,
      chatError: null,
    }));

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    set((state) => ({
      chatMessages: [...state.chatMessages, assistantMessage],
    }));

    // Set up stream listeners
    // Listen for stream start to capture RAG sources
    const removeStartListener = window.electronAPI.onChatStreamStart((data) => {
      if (data.ragSources && data.ragSources.length > 0) {
        set((state) => {
          const messages = [...state.chatMessages];
          const lastMsg = messages[messages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            messages[messages.length - 1] = {
              ...lastMsg,
              ragSources: data.ragSources,
            };
          }
          return { chatMessages: messages };
        });
        
        // Update session sources
        const sources: ChatSessionSource[] = data.ragSources.map(s => ({
          type: 'document' as const,
          name: s.fileName,
          path: s.filePath,
          oneDriveId: s.oneDriveId,
        }));
        get().updateSessionSources(sources);
      }
    });

    const removeChunkListener = window.electronAPI.onChatStreamChunk((chunk) => {
      set((state) => {
        const messages = [...state.chatMessages];
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          messages[messages.length - 1] = {
            ...lastMsg,
            content: lastMsg.content + chunk.delta,
          };
        }
        return { chatMessages: messages };
      });
    });

    const removeEndListener = window.electronAPI.onChatStreamEnd(async () => {
      set({ isChatLoading: false });
      removeStartListener();
      removeChunkListener();
      removeEndListener();
      removeErrorListener();
      
      // Save assistant message to database
      const finalMessages = get().chatMessages;
      const finalAssistant = finalMessages.find(m => m.id === assistantMessage.id);
      if (finalAssistant && currentSessionId) {
        try {
          await window.electronAPI.addChatMessage(currentSessionId, finalAssistant);
          // Refresh sessions to update message count
          get().loadChatSessions();
        } catch (error) {
          console.error('Failed to save assistant message:', error);
        }
      }
    });

    const removeErrorListener = window.electronAPI.onChatStreamError((data) => {
      set((state) => {
        // Remove the empty assistant message on error
        const messages = state.chatMessages.filter(m => m.id !== assistantMessage.id);
        return { 
          chatMessages: messages, 
          isChatLoading: false, 
          chatError: data.error 
        };
      });
      removeStartListener();
      removeChunkListener();
      removeEndListener();
      removeErrorListener();
    });

    // Send the message
    try {
      const history = get().chatMessages.filter(m => m.id !== assistantMessage.id);
      const { detectedDeal } = get();
      await window.electronAPI.sendChatMessage({
        message: content,
        context: fileContext,
        history,
        dealId: detectedDeal?.id,
      });
    } catch (error) {
      set({ isChatLoading: false, chatError: 'Failed to send message' });
      removeChunkListener();
      removeEndListener();
      removeErrorListener();
    }
  },

  clearChat: () => {
    set({ chatMessages: [], chatError: null, currentSessionId: null });
  },

  cancelChat: () => {
    window.electronAPI.cancelChat();
    set({ isChatLoading: false });
  },

  // Chat History actions
  loadChatSessions: async () => {
    try {
      const sessions = await window.electronAPI.getAllChatSessions();
      set({ chatSessions: sessions });
    } catch (error) {
      console.error('Failed to load chat sessions:', error);
    }
  },

  startNewSession: async (dealId?: string, dealName?: string) => {
    try {
      const session = await window.electronAPI.createChatSession({
        dealId,
        dealName,
      });
      set((state) => ({
        chatSessions: [session, ...state.chatSessions],
        currentSessionId: session.id,
        chatMessages: [],
        chatError: null,
      }));
    } catch (error) {
      get().showToast('error', 'Failed to start new chat session');
    }
  },

  loadSession: async (sessionId: string) => {
    try {
      const session = await window.electronAPI.getChatSession(sessionId);
      if (session) {
        set({
          currentSessionId: session.id,
          chatMessages: session.messages,
          chatError: null,
          isHistoryOpen: false,
        });
      }
    } catch (error) {
      get().showToast('error', 'Failed to load chat session');
    }
  },

  deleteSession: async (sessionId: string) => {
    try {
      const success = await window.electronAPI.deleteChatSession(sessionId);
      if (success) {
        set((state) => ({
          chatSessions: state.chatSessions.filter(s => s.id !== sessionId),
          // Clear current session if it was deleted
          currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
          chatMessages: state.currentSessionId === sessionId ? [] : state.chatMessages,
        }));
        get().showToast('success', 'Chat deleted');
      }
    } catch (error) {
      get().showToast('error', 'Failed to delete chat session');
    }
  },

  toggleHistory: () => {
    set((state) => ({ isHistoryOpen: !state.isHistoryOpen }));
  },

  updateSessionSources: async (sources: ChatSessionSource[]) => {
    const { currentSessionId } = get();
    if (!currentSessionId) return;
    
    try {
      await window.electronAPI.updateChatSession(currentSessionId, { sources });
      set((state) => ({
        chatSessions: state.chatSessions.map(s => 
          s.id === currentSessionId ? { ...s, sources } : s
        ),
      }));
    } catch (error) {
      console.error('Failed to update session sources:', error);
    }
  },

  // RAG actions
  indexWorkspace: async (forceReindex = false) => {
    const { workspacePath, workspaceSource, oneDriveFolderId } = get();
    console.log('[Store] indexWorkspace called:', { workspacePath, workspaceSource, oneDriveFolderId, forceReindex });
    
    if (!workspacePath) {
      get().showToast('error', 'No workspace open');
      return;
    }

    set({ isIndexing: true, indexingProgress: null });

    // Set up progress listener
    const removeProgressListener = window.electronAPI.onRagIndexProgress((data) => {
      console.log('[Store] RAG progress:', data);
      set({ indexingProgress: data });
    });

    const removeCompleteListener = window.electronAPI.onRagIndexComplete((data) => {
      console.log('[Store] RAG complete:', data);
      set({ 
        isIndexing: false, 
        indexingProgress: null, 
        ragChunksCount: data.chunksIndexed 
      });
      get().showToast('success', `Indexed ${data.filesIndexed} files (${data.chunksIndexed} chunks)`);
      removeProgressListener();
      removeCompleteListener();
    });

    try {
      let result;
      
      // Use appropriate indexer based on workspace source
      if (workspaceSource === 'onedrive' && oneDriveFolderId) {
        console.log('[Store] Calling indexOneDriveWorkspace');
        result = await window.electronAPI.indexOneDriveWorkspace(oneDriveFolderId, workspacePath, forceReindex);
      } else {
        console.log('[Store] Calling indexWorkspace (local)');
        result = await window.electronAPI.indexWorkspace(workspacePath, forceReindex);
      }
      
      console.log('[Store] Index result:', result);
      
      if (!result.success) {
        set({ isIndexing: false, indexingProgress: null });
        get().showToast('error', result.error || 'Indexing failed');
        removeProgressListener();
        removeCompleteListener();
      }
    } catch (error) {
      console.error('[Store] Index error:', error);
      set({ isIndexing: false, indexingProgress: null });
      get().showToast('error', 'Failed to index workspace');
      removeProgressListener();
      removeCompleteListener();
    }
  },

  checkRagStatus: async () => {
    try {
      const status = await window.electronAPI.getRagStatus();
      set({ 
        isIndexing: status.isIndexing, 
        ragChunksCount: status.chunksCount,
      });
    } catch {
      // Ignore errors
    }
  },

  // Try to load cached RAG embeddings for a workspace
  loadRagCache: async (workspacePath: string) => {
    try {
      const loaded = await window.electronAPI.loadRagCache(workspacePath);
      if (loaded) {
        const status = await window.electronAPI.getRagStatus();
        set({ ragChunksCount: status.chunksCount });
        if (status.lastUpdated) {
          const date = new Date(status.lastUpdated).toLocaleString();
          console.log(`[Store] Loaded RAG cache: ${status.chunksCount} chunks (indexed: ${date})`);
        }
        return true;
      }
    } catch {
      // Ignore errors
    }
    return false;
  },

  clearRagIndex: async () => {
    try {
      await window.electronAPI.clearRagIndex();
      set({ ragChunksCount: 0 });
      get().showToast('info', 'Knowledge base cleared');
    } catch {
      get().showToast('error', 'Failed to clear knowledge base');
    }
  },

  // State persistence
  savePersistedState: async () => {
    const { workspacePath, tabs, activeTabId, workspaceSource, oneDriveFolderId } = get();
    const state: PersistedState = {
      workspacePath,
      openTabs: tabs.map(t => ({
        id: t.id,
        name: t.name,
        path: t.path,
        type: t.type,
      })),
      activeTabId,
      workspaceSource,
      oneDriveFolderId: oneDriveFolderId || undefined,
    };
    try {
      await window.electronAPI.saveState(state);
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  },

  loadPersistedState: async () => {
    try {
      const state = await window.electronAPI.loadState();
      
      // Load onboarding state
      if (state?.hasCompletedOnboarding !== undefined) {
        set({ hasCompletedOnboarding: state.hasCompletedOnboarding });
      }
      
      // Load recent files
      if (state?.recentFiles && Array.isArray(state.recentFiles)) {
        set({ recentFiles: state.recentFiles });
      }
      
      if (state?.workspacePath) {
        // Check if this was an OneDrive workspace
        if (state.workspaceSource === 'onedrive' && state.oneDriveFolderId) {
          // Restore OneDrive workspace
          await get().restoreOneDriveWorkspace(state.oneDriveFolderId, state.workspacePath);
        } else {
          // Restore local workspace
          await get().restoreWorkspace(state.workspacePath);
        }
        
        // Restore tabs
        if (state.openTabs && state.openTabs.length > 0) {
          for (const tab of state.openTabs) {
            await get().openFile(tab.path, tab.name);
          }
          // Set active tab
          if (state.activeTabId) {
            set({ activeTabId: state.activeTabId });
          }
        }
      }
    } catch (error) {
      console.error('Failed to load persisted state:', error);
    }
  },

  restoreOneDriveWorkspace: async (folderId: string, folderPath: string) => {
    try {
      // Check if still authenticated
      const authStatus = await window.electronAPI.getOneDriveAuthStatus();
      if (!authStatus.isAuthenticated) {
        console.log('[Store] OneDrive not authenticated, skipping workspace restore');
        return;
      }

      set({ 
        workspacePath: folderPath,
        workspaceSource: 'onedrive',
        oneDriveFolderId: folderId,
        tree: [],
        tabs: [],
        activeTabId: null,
        fileContents: new Map(),
      });
      
      const children = await get().loadOneDriveDirectory(folderId);
      const folderName = folderPath.split(/[\/]/).pop() || 'OneDrive';
      set({
        tree: [{
          id: folderId,
          name: folderName,
          path: folderPath,
          isDirectory: true,
          isExpanded: true,
          children,
          source: 'onedrive',
          oneDriveId: folderId,
        }],
      });
      
      // Try to load cached RAG embeddings for the workspace
      const loaded = await get().loadRagCache(folderPath);
      if (loaded) {
        console.log('[Store] Successfully loaded cached RAG embeddings for OneDrive workspace');
      }
    } catch (error) {
      console.error('[Store] Failed to restore OneDrive workspace:', error);
      // Clear state on error
      set({ workspacePath: null, workspaceSource: 'local', oneDriveFolderId: null });
    }
  },

  restoreWorkspace: async (workspacePath: string) => {
    try {
      set({ workspacePath, tree: [], tabs: [], activeTabId: null, fileContents: new Map() });
      const children = await get().loadDirectory(workspacePath);
      set({
        tree: [{
          id: workspacePath,
          name: workspacePath.split(/[\\/]/).pop() || workspacePath,
          path: workspacePath,
          isDirectory: true,
          isExpanded: true,
          children,
        }],
      });
      
      // Try to load cached RAG embeddings for the workspace
      const loaded = await get().loadRagCache(workspacePath);
      if (loaded) {
        console.log('[Store] Successfully loaded cached RAG embeddings');
      }
    } catch (error) {
      get().showToast('error', `Failed to restore workspace: ${error}`);
    }
  },

  // Deal actions
  loadDeals: async () => {
    try {
      const dealsList = await window.electronAPI.getAllDeals();
      set({ deals: dealsList });
    } catch (error) {
      get().showToast('error', 'Failed to load deals');
    }
  },

  setSelectedDeal: (id: string | null) => {
    set({ selectedDealId: id });
  },

  detectDealFromFile: async (path: string) => {
    try {
      const detected = await window.electronAPI.detectDealFromPath(path);
      set({ detectedDeal: detected });
      // Auto-select if no deal currently selected
      if (detected && !get().selectedDealId) {
        set({ selectedDealId: detected.id ?? null });
      }
    } catch {
      // Silently fail - detection is optional
    }
  },

  setActivityModalOpen: (open: boolean) => {
    set({ isActivityModalOpen: open });
  },

  setEditingActivity: (activity: DealActivity | null) => {
    set({ editingActivity: activity });
  },

  setDealModalOpen: (open: boolean) => {
    set({ isDealModalOpen: open });
    // Clear editing deal when closing modal
    if (!open) {
      set({ editingDeal: null });
    }
  },

  setEditingDeal: (deal: Deal | null) => {
    set({ editingDeal: deal });
  },

  refreshActivities: () => {
    set((state) => ({ activitiesRefreshTrigger: state.activitiesRefreshTrigger + 1 }));
  },

  exportDealToPdf: async (dealId: string) => {
    try {
      const result = await window.electronAPI.exportDealToPdf(dealId);
      if (result.success && result.filePath) {
        get().showToast('success', `Exported to ${result.filePath}`);
      } else if (result.error && result.error !== 'Export cancelled') {
        get().showToast('error', `Export failed: ${result.error}`);
      }
    } catch (error) {
      get().showToast('error', 'Failed to export deal to PDF');
    }
  },

  exportPipelineToPdf: async () => {
    try {
      const result = await window.electronAPI.exportPipelineToPdf();
      if (result.success && result.filePath) {
        get().showToast('success', `Pipeline exported to ${result.filePath}`);
      } else if (result.error && result.error !== 'Export cancelled') {
        get().showToast('error', `Export failed: ${result.error}`);
      }
    } catch (error) {
      get().showToast('error', 'Failed to export pipeline to PDF');
    }
  },

  // Bottom panel actions
  setBottomPanelOpen: (open: boolean) => {
    set((state) => ({
      bottomPanelState: { ...state.bottomPanelState, isOpen: open },
    }));
    get().savePersistedState();
  },

  setBottomPanelHeight: (height: number) => {
    set((state) => ({
      bottomPanelState: { ...state.bottomPanelState, height },
    }));
    get().savePersistedState();
  },

  toggleBottomPanel: () => {
    set((state) => ({
      bottomPanelState: { ...state.bottomPanelState, isOpen: !state.bottomPanelState.isOpen },
    }));
    get().savePersistedState();
  },

  // Schematic actions
  openSchematicTab: async (toolCall: SchematicToolCall) => {
    try {
      console.log('[Store] Opening schematic tab for:', toolCall);
      
      // Process the tool call via IPC
      const response = await window.electronAPI.processSchematicToolCall(toolCall);
      
      if (response.status === 'error') {
        throw new Error(response.message || 'Failed to retrieve schematic');
      }

      // Create schematic data
      const schematicData: SchematicData = {
        componentId: response.component_id || `schematic-${Date.now()}`,
        componentName: response.component_name || toolCall.component_name,
        machineModel: response.machine_model || toolCall.machine_model,
        imagePath: response.image_path || '',
        manualContext: response.manual_context || '',
        timestamp: Date.now(),
      };

      // Check if tab already exists
      const existingTab = get().tabs.find((t) => 
        t.type === 'schematic' && 
        t.schematicData?.componentId === schematicData.componentId
      );

      if (existingTab) {
        set({ activeTabId: existingTab.id });
        return;
      }

      // Create new schematic tab
      const tabId = `schematic-${schematicData.componentId}`;
      const newTab: Tab = {
        id: tabId,
        name: `🔧 ${schematicData.componentName}`,
        path: schematicData.imagePath,
        type: 'schematic',
        schematicData,
      };

      set((state) => ({
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
      }));

      get().showToast('success', `Opened schematic for ${schematicData.componentName}`);
      get().savePersistedState();
    } catch (error) {
      console.error('[Store] Error opening schematic tab:', error);
      get().showToast('error', `Failed to open schematic: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // OneDrive actions
  checkOneDriveStatus: async () => {
    try {
      const status = await window.electronAPI.getOneDriveAuthStatus();
      set({ oneDriveStatus: status });
    } catch (error) {
      console.error('[Store] Failed to check OneDrive status:', error);
    }
  },

  loginOneDrive: async () => {
    try {
      get().showToast('info', 'Opening Microsoft login...');
      const result = await window.electronAPI.startOneDriveAuth();
      if (result.success) {
        const status = await window.electronAPI.getOneDriveAuthStatus();
        set({ oneDriveStatus: status });
        get().showToast('success', `Connected to OneDrive as ${status.userName || status.userEmail}`);
      } else {
        get().showToast('error', result.error || 'OneDrive login failed');
      }
    } catch (error) {
      console.error('[Store] OneDrive login error:', error);
      get().showToast('error', 'Failed to connect to OneDrive');
    }
  },

  logoutOneDrive: async () => {
    try {
      await window.electronAPI.logoutOneDrive();
      set({ oneDriveStatus: { isAuthenticated: false } });
      get().showToast('info', 'Disconnected from OneDrive');
    } catch (error) {
      console.error('[Store] OneDrive logout error:', error);
    }
  },

  openOneDriveWorkspace: async (folderId: string, folderName: string, folderPath: string) => {
    try {
      set({ 
        workspacePath: folderPath || folderName,
        workspaceSource: 'onedrive',
        oneDriveFolderId: folderId,
        tree: [],
        tabs: [],
        activeTabId: null,
        fileContents: new Map(),
        isOneDrivePickerOpen: false,
      });
      
      const children = await get().loadOneDriveDirectory(folderId);
      set({
        tree: [{
          id: folderId,
          name: folderName || 'OneDrive',
          path: folderPath || folderName,
          isDirectory: true,
          isExpanded: true,
          children,
          source: 'onedrive',
          oneDriveId: folderId,
        }],
      });
      
      get().savePersistedState();
      get().showToast('success', `Opened OneDrive folder: ${folderName}`);
    } catch (error) {
      console.error('[Store] Failed to open OneDrive workspace:', error);
      get().showToast('error', 'Failed to open OneDrive folder');
    }
  },

  loadOneDriveDirectory: async (folderId?: string): Promise<TreeNode[]> => {
    try {
      const items = await window.electronAPI.listOneDriveFolder(folderId);
      return items.map((item) => ({
        id: item.id,
        name: item.name,
        path: item.path,
        isDirectory: item.isDirectory,
        extension: item.isDirectory ? undefined : item.name.split('.').pop(),
        isExpanded: false,
        source: 'onedrive' as const,
        oneDriveId: item.id,
      }));
    } catch (error) {
      console.error('[Store] Failed to load OneDrive directory:', error);
      get().showToast('error', 'Failed to load OneDrive folder contents');
      return [];
    }
  },

  toggleOneDriveDirectory: async (node: TreeNode) => {
    if (!node.isDirectory || node.source !== 'onedrive') return;

    const updateNode = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map((n) => {
        if (n.id === node.id) {
          return { ...n, isExpanded: !n.isExpanded };
        }
        if (n.children) {
          return { ...n, children: updateNode(n.children) };
        }
        return n;
      });
    };

    // If expanding and no children loaded yet
    if (!node.isExpanded && (!node.children || node.children.length === 0)) {
      try {
        const children = await get().loadOneDriveDirectory(node.oneDriveId);
        const updateWithChildren = (nodes: TreeNode[]): TreeNode[] => {
          return nodes.map((n) => {
            if (n.id === node.id) {
              return { ...n, isExpanded: true, children };
            }
            if (n.children) {
              return { ...n, children: updateWithChildren(n.children) };
            }
            return n;
          });
        };
        set({ tree: updateWithChildren(get().tree) });
      } catch (error) {
        get().showToast('error', 'Failed to load folder contents');
      }
    } else {
      set({ tree: updateNode(get().tree) });
    }
  },

  openOneDriveFile: async (node: TreeNode, initialPage?: number) => {
    console.log('[Store] openOneDriveFile called with:', node, 'initialPage:', initialPage);
    
    if (node.isDirectory || node.source !== 'onedrive' || !node.oneDriveId) {
      console.log('[Store] openOneDriveFile early return - isDirectory:', node.isDirectory, 'source:', node.source, 'oneDriveId:', node.oneDriveId);
      return;
    }

    const { addToRecentFiles } = get();

    try {
      // Check if tab already exists
      const existingTab = get().tabs.find((t) => t.id === node.id);
      if (existingTab) {
        console.log('[Store] Tab already exists, activating:', existingTab.id);
        // Update initialPage if navigating from citation
        if (initialPage) {
          const updatedTabs = get().tabs.map(t => 
            t.id === existingTab.id ? { ...t, initialPage } : t
          );
          set({ activeTabId: existingTab.id, tabs: updatedTabs });
        } else {
          set({ activeTabId: existingTab.id });
        }
        // Track as recent file
        addToRecentFiles(node.path, node.name, 'onedrive', node.oneDriveId);
        return;
      }

      // Determine file type
      const ext = node.extension?.toLowerCase() || '';
      let type: 'text' | 'markdown' | 'pdf' | 'word' | 'unknown' = 'unknown';
      if (['.md', '.markdown'].includes(`.${ext}`)) type = 'markdown';
      else if (['.txt', '.json', '.js', '.ts', '.tsx', '.jsx', '.css', '.html', '.yml', '.yaml'].includes(`.${ext}`)) type = 'text';
      else if (ext === 'pdf') type = 'pdf';
      else if (['doc', 'docx'].includes(ext)) type = 'word';
      
      console.log('[Store] Opening OneDrive file, type:', type, 'ext:', ext);

      // Read file content from OneDrive
      const { content, mimeType } = await window.electronAPI.readOneDriveFile(node.oneDriveId);
      console.log('[Store] Read file content, mimeType:', mimeType, 'length:', content.length);
      
      // Store content
      const fileContents = new Map(get().fileContents);
      fileContents.set(node.id, content);

      // Create tab
      const newTab: Tab = {
        id: node.id,
        name: node.name,
        path: node.path,
        type,
        source: 'onedrive',
        oneDriveId: node.oneDriveId,
        initialPage,
      };

      set((state) => ({
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
        fileContents,
      }));

      // Track as recent file
      addToRecentFiles(node.path, node.name, 'onedrive', node.oneDriveId);
      get().savePersistedState();
    } catch (error) {
      console.error('[Store] Failed to open OneDrive file:', error);
      // Don't show toast error for file open failures - user can see the file didn't open
      // This prevents noisy errors when OneDrive files are unavailable or local files are misrouted
    }
  },

  setOneDrivePickerOpen: (open: boolean) => {
    set({ isOneDrivePickerOpen: open });
  },

  // Onboarding
  setOnboardingOpen: (open: boolean) => {
    set({ isOnboardingOpen: open });
  },

  completeOnboarding: () => {
    set({ hasCompletedOnboarding: true, isOnboardingOpen: false });
    // Persist this state
    const currentPersisted = get().persistedState || {};
    const newPersisted = { ...currentPersisted, hasCompletedOnboarding: true };
    set({ persistedState: newPersisted });
    window.electronAPI?.savePersistedState(newPersisted);
  },

  // Recent Files
  addToRecentFiles: (path: string, name: string, source: 'local' | 'onedrive', oneDriveId?: string) => {
    const MAX_RECENT_FILES = 15;
    const { recentFiles } = get();
    
    // Remove existing entry for this file if exists
    const filtered = recentFiles.filter(f => f.path !== path);
    
    // Add to front of list
    const newEntry = {
      path,
      name,
      source,
      oneDriveId,
      timestamp: Date.now(),
    };
    
    const updated = [newEntry, ...filtered].slice(0, MAX_RECENT_FILES);
    set({ recentFiles: updated });
    
    // Persist to state
    const currentPersisted = get().persistedState || {};
    const newPersisted = { ...currentPersisted, recentFiles: updated };
    set({ persistedState: newPersisted });
    window.electronAPI?.savePersistedState(newPersisted);
  },

  clearRecentFiles: () => {
    set({ recentFiles: [] });
    const currentPersisted = get().persistedState || {};
    const newPersisted = { ...currentPersisted, recentFiles: [] };
    set({ persistedState: newPersisted });
    window.electronAPI?.savePersistedState(newPersisted);
  },
}));

// Initialize on store creation
console.log('[Store] Initializing store...');
console.log('[Store] window.electronAPI:', typeof window.electronAPI);

try {
  useAppStore.getState().checkRagStatus();
  useAppStore.getState().checkOneDriveStatus();
  useAppStore.getState().loadPersistedState();

  // Initialize database and load deals
  if (window.electronAPI) {
    window.electronAPI.initDatabase().then(() => {
      useAppStore.getState().loadDeals();
    }).catch(err => {
      console.error('[Store] initDatabase error:', err);
    });

    // Listen for chat tool executions to refresh data
    window.electronAPI.onChatToolExecuted((data) => {
      console.log('Chat tool executed:', data.action);
      
      if (data.action === 'deal_activity_created' || data.action === 'deal_stage_updated') {
        useAppStore.getState().refreshActivities();
      }
      
      if (data.action === 'deal_created' || data.action === 'deal_updated') {
        useAppStore.getState().loadDeals();
      }
    });
  } else {
    console.error('[Store] window.electronAPI is not defined!');
  }
} catch (err) {
  console.error('[Store] Initialization error:', err);
}

console.log('[Store] Store initialization complete');
