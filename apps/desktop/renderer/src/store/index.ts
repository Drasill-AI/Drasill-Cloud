import { create } from 'zustand';
import { Tab, TreeNode, getFileType, ChatMessage, FileContext, PersistedState, Equipment, BottomPanelState, MaintenanceLog, SchematicToolCall, SchematicData, WorkOrder, WorkOrderTemplate } from '@drasill/shared';

interface ToastMessage {
  id: string;
  type: 'error' | 'success' | 'info';
  message: string;
}

interface AppState {
  // Workspace
  workspacePath: string | null;
  tree: TreeNode[];
  isLoadingTree: boolean;

  // Connection status
  isOnline: boolean;

  // Chat
  chatMessages: ChatMessage[];
  isChatLoading: boolean;
  chatError: string | null;
  hasApiKey: boolean;

  // RAG
  isIndexing: boolean;
  indexingProgress: { current: number; total: number; fileName: string; percentage: number } | null;
  ragChunksCount: number;

  // Tabs
  tabs: Tab[];
  activeTabId: string | null;
  
  // File content cache
  fileContents: Map<string, string>;
  loadingFiles: Set<string>;

  // UI state
  isCommandPaletteOpen: boolean;
  toasts: ToastMessage[];

  // Tab view states (for Monaco)
  tabViewStates: Map<string, unknown>;

  // Equipment & Logs
  equipment: Equipment[];
  selectedEquipmentId: string | null;
  detectedEquipment: Equipment | null;
  isLogModalOpen: boolean;
  isEquipmentModalOpen: boolean;
  logsRefreshTrigger: number;
  editingLog: MaintenanceLog | null;

  // Work Orders
  workOrders: WorkOrder[];
  workOrderTemplates: WorkOrderTemplate[];
  isWorkOrderModalOpen: boolean;
  isTemplateModalOpen: boolean;
  editingWorkOrder: WorkOrder | null;
  editingTemplate: WorkOrderTemplate | null;
  workOrdersRefreshTrigger: number;

  // Bottom Panel
  bottomPanelState: BottomPanelState;

  // Actions
  openWorkspace: () => Promise<void>;
  setWorkspacePath: (path: string | null) => void;
  loadDirectory: (path: string) => Promise<TreeNode[]>;
  toggleDirectory: (node: TreeNode) => Promise<void>;
  refreshTree: () => Promise<void>;
  
  openFile: (path: string, name: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  closeActiveTab: () => void;
  setActiveTab: (tabId: string) => void;
  saveTabViewState: (tabId: string, viewState: unknown) => void;
  getTabViewState: (tabId: string) => unknown | undefined;

  toggleCommandPalette: () => void;
  
  showToast: (type: ToastMessage['type'], message: string) => void;
  dismissToast: (id: string) => void;

  // Chat actions
  checkApiKey: () => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  sendMessage: (content: string, fileContext?: FileContext) => Promise<void>;
  clearChat: () => void;
  cancelChat: () => void;

  // RAG actions
  indexWorkspace: () => Promise<void>;
  checkRagStatus: () => Promise<void>;
  clearRagIndex: () => Promise<void>;

  // State persistence
  savePersistedState: () => Promise<void>;
  loadPersistedState: () => Promise<void>;
  restoreWorkspace: (path: string) => Promise<void>;

  // Equipment actions
  loadEquipment: () => Promise<void>;
  setSelectedEquipment: (id: string | null) => void;
  detectEquipmentFromFile: (path: string) => Promise<void>;
  setLogModalOpen: (open: boolean) => void;
  setEquipmentModalOpen: (open: boolean) => void;
  setEditingLog: (log: MaintenanceLog | null) => void;
  refreshLogs: () => void;

  // Bottom panel actions
  setBottomPanelOpen: (open: boolean) => void;
  setBottomPanelHeight: (height: number) => void;
  toggleBottomPanel: () => void;

  // Schematic actions
  openSchematicTab: (toolCall: SchematicToolCall) => Promise<void>;

  // Equipment viewer
  openEquipmentViewer: (equipmentId: string) => void;

  // Work Order actions
  loadWorkOrders: () => Promise<void>;
  loadWorkOrderTemplates: () => Promise<void>;
  setWorkOrderModalOpen: (open: boolean) => void;
  setTemplateModalOpen: (open: boolean) => void;
  setEditingWorkOrder: (workOrder: WorkOrder | null) => void;
  setEditingTemplate: (template: WorkOrderTemplate | null) => void;
  refreshWorkOrders: () => void;
  openWorkOrderViewer: (workOrderId: string) => void;
  openWorkOrdersPanel: () => void;

  // Connection status
  setOnlineStatus: (isOnline: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  workspacePath: null,
  tree: [],
  isLoadingTree: false,
  isOnline: true,
  tabs: [],
  activeTabId: null,
  fileContents: new Map(),
  loadingFiles: new Set(),
  isCommandPaletteOpen: false,
  toasts: [],
  tabViewStates: new Map(),
  
  // Chat state
  chatMessages: [],
  isChatLoading: false,
  chatError: null,
  hasApiKey: false,

  // RAG state
  isIndexing: false,
  indexingProgress: null,
  ragChunksCount: 0,

  // Equipment & Logs state
  equipment: [],
  selectedEquipmentId: null,
  detectedEquipment: null,
  isLogModalOpen: false,
  isEquipmentModalOpen: false,
  logsRefreshTrigger: 0,
  editingLog: null,

  // Work Orders state
  workOrders: [],
  workOrderTemplates: [],
  isWorkOrderModalOpen: false,
  isTemplateModalOpen: false,
  editingWorkOrder: null,
  editingTemplate: null,
  workOrdersRefreshTrigger: 0,

  // Bottom panel state
  bottomPanelState: {
    isOpen: false,
    height: 200,
    activeTab: 'logs',
  },

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

  setWorkspacePath: (path) => {
    set({ workspacePath: path });
  },

  loadDirectory: async (path: string): Promise<TreeNode[]> => {
    try {
      const entries = await window.electronAPI.readDir(path);
      
      // Filter to only show PDFs, image files, and directories
      const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.tif'];
      const filteredEntries = entries.filter((entry) => {
        if (entry.isDirectory) return true;
        const ext = entry.extension?.toLowerCase() || '';
        return allowedExtensions.includes(ext);
      });
      
      return filteredEntries.map((entry) => ({
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
    const { tabs, loadingFiles } = get();

    // Check if already open
    const existingTab = tabs.find((t) => t.path === path);
    if (existingTab) {
      set({ activeTabId: existingTab.id });
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
  checkApiKey: async () => {
    try {
      const result = await window.electronAPI.getApiKey();
      set({ hasApiKey: result.hasKey });
    } catch {
      set({ hasApiKey: false });
    }
  },

  setApiKey: async (key: string) => {
    try {
      await window.electronAPI.setApiKey(key);
      set({ hasApiKey: true, chatError: null });
    } catch (error) {
      set({ chatError: 'Failed to save API key' });
    }
  },

  sendMessage: async (content: string, fileContext?: FileContext) => {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

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

    const removeEndListener = window.electronAPI.onChatStreamEnd(() => {
      set({ isChatLoading: false });
      removeStartListener();
      removeChunkListener();
      removeEndListener();
      removeErrorListener();
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
      await window.electronAPI.sendChatMessage({
        message: content,
        context: fileContext,
        history,
      });
    } catch (error) {
      set({ isChatLoading: false, chatError: 'Failed to send message' });
      removeChunkListener();
      removeEndListener();
      removeErrorListener();
    }
  },

  clearChat: () => {
    set({ chatMessages: [], chatError: null });
  },

  cancelChat: () => {
    window.electronAPI.cancelChat();
    set({ isChatLoading: false });
  },

  // RAG actions
  indexWorkspace: async () => {
    const { workspacePath, hasApiKey } = get();
    if (!workspacePath) {
      get().showToast('error', 'No workspace open');
      return;
    }
    if (!hasApiKey) {
      get().showToast('error', 'Please configure your API key first');
      return;
    }

    set({ isIndexing: true, indexingProgress: null });

    // Set up progress listener
    const removeProgressListener = window.electronAPI.onRagIndexProgress((data) => {
      set({ indexingProgress: data });
    });

    const removeCompleteListener = window.electronAPI.onRagIndexComplete((data) => {
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
      const result = await window.electronAPI.indexWorkspace(workspacePath);
      if (!result.success) {
        set({ isIndexing: false, indexingProgress: null });
        get().showToast('error', result.error || 'Indexing failed');
        removeProgressListener();
        removeCompleteListener();
      }
    } catch (error) {
      set({ isIndexing: false, indexingProgress: null });
      get().showToast('error', 'Failed to index workspace');
      removeProgressListener();
      removeCompleteListener();
    }
  },

  checkRagStatus: async () => {
    try {
      const status = await window.electronAPI.getRagStatus();
      set({ isIndexing: status.isIndexing, ragChunksCount: status.chunksCount });
    } catch {
      // Ignore errors
    }
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
    const { workspacePath, tabs, activeTabId } = get();
    const state: PersistedState = {
      workspacePath,
      openTabs: tabs.map(t => ({
        id: t.id,
        name: t.name,
        path: t.path,
        type: t.type,
      })),
      activeTabId,
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
      if (state?.workspacePath) {
        await get().restoreWorkspace(state.workspacePath);
        
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
    } catch (error) {
      get().showToast('error', `Failed to restore workspace: ${error}`);
    }
  },

  // Equipment actions
  loadEquipment: async () => {
    try {
      const equipmentList = await window.electronAPI.getAllEquipment();
      set({ equipment: equipmentList });
    } catch (error) {
      get().showToast('error', 'Failed to load equipment');
    }
  },

  setSelectedEquipment: (id: string | null) => {
    set({ selectedEquipmentId: id });
  },

  detectEquipmentFromFile: async (path: string) => {
    try {
      const detected = await window.electronAPI.detectEquipmentFromPath(path);
      set({ detectedEquipment: detected });
      // Auto-select if no equipment currently selected
      if (detected && !get().selectedEquipmentId) {
        set({ selectedEquipmentId: detected.id ?? null });
      }
    } catch {
      // Silently fail - detection is optional
    }
  },

  setLogModalOpen: (open: boolean) => {
    set({ isLogModalOpen: open });
  },

  setEditingLog: (log: MaintenanceLog | null) => {
    set({ editingLog: log });
  },

  setEquipmentModalOpen: (open: boolean) => {
    set({ isEquipmentModalOpen: open });
  },

  refreshLogs: () => {
    set((state) => ({ logsRefreshTrigger: state.logsRefreshTrigger + 1 }));
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

  openEquipmentViewer: (equipmentId: string) => {
    const { equipment, tabs } = get();
    const equipmentData = equipment.find(e => e.id === equipmentId);
    
    if (!equipmentData) {
      get().showToast('error', 'Equipment not found');
      return;
    }

    // Check if tab already exists
    const existingTab = tabs.find((t) => 
      t.type === 'equipment' && t.equipmentId === equipmentId
    );

    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return;
    }

    // Create new equipment tab
    const tabId = `equipment-${equipmentId}`;
    const newTab: Tab = {
      id: tabId,
      name: `⚙️ ${equipmentData.name}`,
      path: '',
      type: 'equipment',
      equipmentId,
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));

    get().savePersistedState();
  },

  setOnlineStatus: (isOnline: boolean) => {
    set({ isOnline });
  },

  // Work Order Actions
  loadWorkOrders: async () => {
    try {
      const workOrders = await window.electronAPI.getAllWorkOrders();
      set({ workOrders });
    } catch (error) {
      console.error('[Store] Failed to load work orders:', error);
      get().showToast('error', 'Failed to load work orders');
    }
  },

  loadWorkOrderTemplates: async () => {
    try {
      const workOrderTemplates = await window.electronAPI.getAllWorkOrderTemplates();
      set({ workOrderTemplates });
    } catch (error) {
      console.error('[Store] Failed to load work order templates:', error);
      get().showToast('error', 'Failed to load templates');
    }
  },

  setWorkOrderModalOpen: (open: boolean) => {
    set({ isWorkOrderModalOpen: open });
    if (!open) {
      set({ editingWorkOrder: null });
    }
  },

  setTemplateModalOpen: (open: boolean) => {
    set({ isTemplateModalOpen: open });
    if (!open) {
      set({ editingTemplate: null });
    }
  },

  setEditingWorkOrder: (workOrder: WorkOrder | null) => {
    set({ editingWorkOrder: workOrder });
  },

  setEditingTemplate: (template: WorkOrderTemplate | null) => {
    set({ editingTemplate: template });
  },

  refreshWorkOrders: () => {
    set((state) => ({ workOrdersRefreshTrigger: state.workOrdersRefreshTrigger + 1 }));
    get().loadWorkOrders();
  },

  openWorkOrderViewer: (workOrderId: string) => {
    const { workOrders, tabs } = get();
    const workOrder = workOrders.find(wo => wo.id === workOrderId);
    
    if (!workOrder) {
      get().showToast('error', 'Work order not found');
      return;
    }

    // Check if tab already exists
    const existingTab = tabs.find((t) => 
      t.type === 'workorder' && t.workOrderId === workOrderId
    );

    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return;
    }

    // Create new work order tab
    const tabId = `workorder-${workOrderId}`;
    const newTab: Tab = {
      id: tabId,
      name: `📋 ${workOrder.workOrderNumber}`,
      path: '',
      type: 'workorder',
      workOrderId,
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));

    get().savePersistedState();
  },

  openWorkOrdersPanel: () => {
    const { tabs } = get();

    // Check if tab already exists
    const existingTab = tabs.find((t) => t.type === 'workorders-list');

    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return;
    }

    // Create new work orders list tab
    const tabId = 'workorders-list';
    const newTab: Tab = {
      id: tabId,
      name: '📋 Work Orders',
      path: '',
      type: 'workorders-list',
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));

    get().savePersistedState();
  },
}));

// Initialize on store creation
useAppStore.getState().checkApiKey();
useAppStore.getState().checkRagStatus();
useAppStore.getState().loadPersistedState();

// Initialize database and load equipment
window.electronAPI.initDatabase().then(() => {
  useAppStore.getState().loadEquipment();
  useAppStore.getState().loadWorkOrders();
  useAppStore.getState().loadWorkOrderTemplates();
});

// Listen for chat tool executions to refresh data
window.electronAPI.onChatToolExecuted((data) => {
  console.log('Chat tool executed:', data.action);
  
  if (data.action === 'maintenance_log_created' || data.action === 'failure_event_recorded') {
    useAppStore.getState().refreshLogs();
  }
  
  if (data.action === 'equipment_status_updated') {
    useAppStore.getState().loadEquipment();
  }

  if (data.action === 'work_order_created' || data.action === 'work_order_updated' || data.action === 'work_order_completed') {
    useAppStore.getState().refreshWorkOrders();
  }
});
