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
  /** Source of the file (local filesystem or cloud) */
  source?: 'local' | 'onedrive';
  /** OneDrive item ID (for cloud files) */
  oneDriveId?: string;
}

/**
 * Represents an open tab in the editor
 */
export interface Tab {
  /** Unique identifier (file path or schematic ID) */
  id: string;
  /** Display name */
  name: string;
  /** Full file path (for file tabs) */
  path: string;
  /** File type for determining viewer */
  type: 'text' | 'markdown' | 'pdf' | 'word' | 'schematic' | 'unknown';
  /** Whether the tab has unsaved changes */
  isDirty?: boolean;
  /** Scroll position to restore */
  scrollPosition?: {
    scrollTop: number;
    scrollLeft: number;
  };
  /** Monaco view state for restoring cursor/selection */
  viewState?: unknown;
  /** Schematic data (only for schematic tabs) */
  schematicData?: SchematicData;
  /** Source of the file (local filesystem or cloud) */
  source?: 'local' | 'onedrive';
  /** OneDrive item ID (for cloud files) */
  oneDriveId?: string;
  /** Initial page number (for PDF files opened from citations) */
  initialPage?: number;
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
    type: 'text' | 'markdown' | 'pdf' | 'word' | 'schematic' | 'unknown';
  }>;
  activeTabId: string | null;
  sidebarWidth?: number;
  rightPanelWidth?: number;
  /** Source of the workspace (local or cloud) */
  workspaceSource?: 'local' | 'onedrive';
  /** OneDrive folder ID (for cloud workspaces) */
  oneDriveFolderId?: string;
  /** Whether user has completed onboarding */
  hasCompletedOnboarding?: boolean;
}

/**
 * IPC channel names
 */
export const IPC_CHANNELS = {
  SELECT_WORKSPACE: 'select-workspace',
  SELECT_FILES: 'select-files',
  READ_DIR: 'read-dir',
  READ_FILE: 'read-file',
  READ_FILE_BINARY: 'read-file-binary',
  READ_WORD_FILE: 'read-word-file',
  READ_WORD_FILE_BUFFER: 'read-word-file-buffer',
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
  RAG_INDEX_ONEDRIVE: 'rag-index-onedrive',
  RAG_INDEX_PROGRESS: 'rag-index-progress',
  RAG_INDEX_COMPLETE: 'rag-index-complete',
  RAG_SEARCH: 'rag-search',
  RAG_GET_STATUS: 'rag-get-status',
  RAG_LOAD_CACHE: 'rag-load-cache',
  RAG_CLEAR: 'rag-clear',
  // PDF Extraction (IPC between main and renderer)
  PDF_EXTRACT_TEXT_REQUEST: 'pdf-extract-text-request',
  PDF_EXTRACT_TEXT_RESPONSE: 'pdf-extract-text-response',
  PDF_EXTRACTOR_READY: 'pdf-extractor-ready',
  // State persistence
  STATE_SAVE: 'state-save',
  STATE_LOAD: 'state-load',
  // Deal Management
  DEAL_GET_ALL: 'deal-get-all',
  DEAL_GET: 'deal-get',
  DEAL_ADD: 'deal-add',
  DEAL_UPDATE: 'deal-update',
  DEAL_DELETE: 'deal-delete',
  DEAL_IMPORT_CSV: 'deal-import-csv',
  DEAL_EXPORT_CSV: 'deal-export-csv',
  DEAL_DETECT_FROM_PATH: 'deal-detect-from-path',
  // Deal Activities
  ACTIVITY_ADD: 'activity-add',
  ACTIVITY_GET: 'activity-get',
  ACTIVITY_GET_BY_DEAL: 'activity-get-by-deal',
  ACTIVITY_UPDATE: 'activity-update',
  ACTIVITY_DELETE: 'activity-delete',
  ACTIVITY_ADD_SOURCE: 'activity-add-source',
  ACTIVITY_REMOVE_SOURCE: 'activity-remove-source',
  ACTIVITY_EXPORT_MARKDOWN: 'activity-export-markdown',
  // Pipeline Analytics
  PIPELINE_GET: 'pipeline-get',
  // Database
  DB_INIT: 'db-init',
  // File Operations
  ADD_FILES: 'add-files',
  DELETE_FILE: 'delete-file',
  DELETE_FOLDER: 'delete-folder',
  CREATE_FILE: 'create-file',
  CREATE_FOLDER: 'create-folder',
  RENAME_FILE: 'rename-file',
  CLOSE_WORKSPACE: 'close-workspace',
  // Schematics
  SCHEMATIC_PROCESS_TOOL_CALL: 'schematic-process-tool-call',
  SCHEMATIC_GET_IMAGE: 'schematic-get-image',
  // OneDrive Integration
  ONEDRIVE_AUTH_START: 'onedrive-auth-start',
  ONEDRIVE_AUTH_STATUS: 'onedrive-auth-status',
  ONEDRIVE_LOGOUT: 'onedrive-logout',
  ONEDRIVE_LIST_FOLDER: 'onedrive-list-folder',
  ONEDRIVE_READ_FILE: 'onedrive-read-file',
  ONEDRIVE_DOWNLOAD_FILE: 'onedrive-download-file',
  ONEDRIVE_GET_FOLDER_INFO: 'onedrive-get-folder-info',
  // Outlook Email Integration
  OUTLOOK_CREATE_DRAFT: 'outlook-create-draft',
  OUTLOOK_SEND_DRAFT: 'outlook-send-draft',
  OUTLOOK_SEND_DIRECT: 'outlook-send-direct',
  OUTLOOK_DELETE_DRAFT: 'outlook-delete-draft',
  OUTLOOK_GET_DRAFTS: 'outlook-get-drafts',
  // Chat History
  CHAT_SESSION_CREATE: 'chat-session-create',
  CHAT_SESSION_UPDATE: 'chat-session-update',
  CHAT_SESSION_DELETE: 'chat-session-delete',
  CHAT_SESSION_GET: 'chat-session-get',
  CHAT_SESSION_GET_ALL: 'chat-session-get-all',
  CHAT_SESSION_ADD_MESSAGE: 'chat-session-add-message',
  // Knowledge Base
  KNOWLEDGE_PROFILE_GET_ALL: 'knowledge-profile-get-all',
  KNOWLEDGE_PROFILE_GET: 'knowledge-profile-get',
  KNOWLEDGE_PROFILE_CREATE: 'knowledge-profile-create',
  KNOWLEDGE_PROFILE_UPDATE: 'knowledge-profile-update',
  KNOWLEDGE_PROFILE_DELETE: 'knowledge-profile-delete',
  KNOWLEDGE_PROFILE_SET_ACTIVE: 'knowledge-profile-set-active',
  KNOWLEDGE_PROFILE_GET_ACTIVE: 'knowledge-profile-get-active',
  KNOWLEDGE_DOC_ADD: 'knowledge-doc-add',
  KNOWLEDGE_DOC_REMOVE: 'knowledge-doc-remove',
  KNOWLEDGE_DOC_GET_BY_PROFILE: 'knowledge-doc-get-by-profile',
  // Document Templates
  TEMPLATE_GET_ALL: 'template-get-all',
  TEMPLATE_GET: 'template-get',
  TEMPLATE_CREATE: 'template-create',
  TEMPLATE_UPDATE: 'template-update',
  TEMPLATE_DELETE: 'template-delete',
  // Memo Generation
  MEMO_GENERATE: 'memo-generate',
  MEMO_GET_BY_DEAL: 'memo-get-by-deal',
  MEMO_GET: 'memo-get',
  MEMO_UPDATE: 'memo-update',
  MEMO_DELETE: 'memo-delete',
  MEMO_EXPORT: 'memo-export',
} as const;

/**
 * RAG source citation
 */
export interface RAGSource {
  fileName: string;
  filePath: string;
  section: string;
  pageNumber?: number;
  /** Source type (local or onedrive) */
  source?: 'local' | 'onedrive';
  /** OneDrive item ID for cloud files */
  oneDriveId?: string;
  /** Relevance score (0-1) from hybrid search */
  relevanceScore?: number;
  /** Whether this source is from a different deal than the current context */
  fromOtherDeal?: boolean;
  /** Associated deal ID if known */
  dealId?: string;
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
  /** Current deal ID for deal-scoped RAG queries */
  dealId?: string;
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
// Deal & Activity Types (Lending Deal Management)
// ==========================================

/**
 * Deal stages - fixed workflow
 */
export type DealStage = 'lead' | 'application' | 'underwriting' | 'approved' | 'funded' | 'closed' | 'declined';

/**
 * Deal priority levels
 */
export type DealPriority = 'low' | 'medium' | 'high';

/**
 * Deal record for lending/underwriting
 */
export interface Deal {
  id?: string;
  dealNumber: string;
  borrowerName: string;
  borrowerContact?: string | null;
  loanAmount: number;
  interestRate?: number | null;
  termMonths?: number | null;
  collateralDescription?: string | null;
  stage: DealStage;
  priority?: DealPriority;
  assignedTo?: string | null;
  documentPath?: string | null;
  notes?: string | null;
  expectedCloseDate?: string | null;
  actualCloseDate?: string | null;
  isPinned?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Deal activity types
 */
export type DealActivityType = 'note' | 'call' | 'email' | 'document' | 'stage_change' | 'meeting';

/**
 * Activity templates for quick entry
 */
export const ACTIVITY_TEMPLATES = [
  { label: 'Called borrower for update', type: 'call' as DealActivityType },
  { label: 'Left voicemail for borrower', type: 'call' as DealActivityType },
  { label: 'Sent follow-up email', type: 'email' as DealActivityType },
  { label: 'Received financials from borrower', type: 'document' as DealActivityType },
  { label: 'Received signed documents', type: 'document' as DealActivityType },
  { label: 'Completed site visit', type: 'meeting' as DealActivityType },
  { label: 'Met with borrower', type: 'meeting' as DealActivityType },
  { label: 'Internal deal review meeting', type: 'meeting' as DealActivityType },
  { label: 'Credit committee presentation', type: 'meeting' as DealActivityType },
  { label: 'Reviewed credit agreement', type: 'note' as DealActivityType },
  { label: 'Updated deal terms', type: 'note' as DealActivityType },
  { label: 'Requested additional documentation', type: 'email' as DealActivityType },
] as const;

/**
 * Source citation for an activity
 */
export interface ActivitySource {
  id?: string;
  activityId?: string;
  fileName: string;
  filePath: string;
  section?: string;
  pageNumber?: number;
  source?: 'local' | 'onedrive';
  oneDriveId?: string;
}

/**
 * Deal activity record
 */
export interface DealActivity {
  id?: string;
  dealId: string;
  type: DealActivityType;
  description: string;
  performedBy?: string | null;
  performedAt: string;
  metadata?: string | null; // JSON for flexible data
  createdAt?: string;
  sources?: ActivitySource[]; // Attached source citations
}

/**
 * Pipeline analytics data
 */
export interface PipelineAnalytics {
  totalDeals: number;
  totalPipelineValue: number;
  averageDealSize: number;
  byStage: Record<DealStage, { count: number; totalValue: number }>;
  recentActivityCount?: number; // Activities in last 7 days
  dealsAddedThisMonth?: number;
}

/**
 * Activity form data
 */
export interface ActivityFormData {
  dealId: string;
  type: DealActivityType;
  description: string;
  performedBy?: string | null;
  performedAt: string;
}

/**
 * Bottom panel state for persistence
 */
export interface BottomPanelState {
  isOpen: boolean;
  height: number;
  activeTab: 'activities' | 'pipeline';
}

// ==========================================
// Schematic Visualizer Types
// ==========================================

/**
 * OpenAI tool call for schematic retrieval
 */
export interface SchematicToolCall {
  component_name: string;
  machine_model?: string;
  additional_context?: string;
}

/**
 * Response from Java schematic handler
 */
export interface SchematicToolResponse {
  status: 'success' | 'error';
  message?: string;
  image_path?: string;
  manual_context?: string;
  component_id?: string;
  component_name?: string;
  machine_model?: string;
}

/**
 * Schematic data stored in tab
 */
export interface SchematicData {
  componentId: string;
  componentName: string;
  machineModel?: string;
  imagePath: string;
  manualContext: string;
  timestamp: number;
}

/**
 * Request to process OpenAI tool call
 */
export interface ProcessSchematicRequest {
  toolCall: SchematicToolCall;
  conversationId?: string;
}

// ==========================================
// OneDrive Integration Types
// ==========================================

/**
 * OneDrive item (file or folder)
 */
export interface OneDriveItem {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  mimeType?: string;
  webUrl?: string;
  downloadUrl?: string;
  lastModified?: string;
}

/**
 * OneDrive authentication status
 */
export interface OneDriveAuthStatus {
  isAuthenticated: boolean;
  userEmail?: string;
  userName?: string;
}

// ==========================================
// Outlook Email Types
// ==========================================

/**
 * Email draft for creating/sending via Outlook
 */
export interface EmailDraft {
  id?: string;
  subject: string;
  body: string;
  bodyType?: 'text' | 'html';
  to: string[];
  cc?: string[];
  bcc?: string[];
  importance?: 'low' | 'normal' | 'high';
}

/**
 * Response from creating an email draft
 */
export interface EmailDraftResponse {
  id: string;
  webLink: string;
  subject: string;
  createdDateTime: string;
}

// ==========================================
// Chat History Types
// ==========================================

/**
 * Source referenced in a chat session
 */
export interface ChatSessionSource {
  type: 'document' | 'deal' | 'schematic';
  name: string;
  path?: string;
  oneDriveId?: string;
}

/**
 * Chat session for history
 */
export interface ChatSession {
  id: string;
  title: string;
  dealId?: string;
  dealName?: string;
  sources: ChatSessionSource[];
  messageCount: number;
  firstMessage?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Full chat session with messages
 */
export interface ChatSessionFull extends ChatSession {
  messages: ChatMessage[];
}

// ==========================================
// Knowledge Base & Template Types
// ==========================================

/**
 * Knowledge profile type (investment strategies, etc.)
 */
export type KnowledgeProfileType = 'base' | 'cre' | 'pe' | 'vc' | 'c_and_i' | 'sba' | 'custom';

/**
 * Knowledge profile for contextual guardrails
 */
export interface KnowledgeProfile {
  id: string;
  name: string;
  type: KnowledgeProfileType;
  description?: string;
  /** Parent profile ID for inheritance (null for base profiles) */
  parentId?: string | null;
  /** Soft guardrails - guidelines for the AI */
  guidelines: string;
  /** Key terms/vocabulary specific to this profile */
  terminology?: string;
  /** Compliance checks (soft suggestions) */
  complianceChecks?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Document stored in a knowledge profile
 */
export interface KnowledgeDocument {
  id: string;
  profileId: string;
  fileName: string;
  filePath: string;
  category: 'policy' | 'procedure' | 'guideline' | 'example' | 'template' | 'other';
  description?: string;
  isIndexed: boolean;
  source: 'local' | 'onedrive';
  oneDriveId?: string;
  createdAt?: string;
}

/**
 * Document template for memo generation
 */
export interface DocumentTemplate {
  id: string;
  name: string;
  templateType: 'credit_memo' | 'ic_report' | 'approval_letter' | 'term_sheet' | 'commitment_letter' | 'custom';
  profileId?: string | null;
  content?: string;
  filePath?: string;
  requiredSections?: string[];
  aiInstructions?: string;
  defaultFields?: string[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Generated memo record
 */
export interface GeneratedMemo {
  id: string;
  dealId: string;
  templateId: string;
  templateName?: string;
  profileId?: string;
  content: string;
  manualFields?: Record<string, string>;
  inferredFields?: Record<string, string>;
  status: 'draft' | 'final' | 'exported';
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Template variable that needs user input
 */
export interface TemplateVariable {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'currency' | 'select';
  required: boolean;
  inferredValue?: string;
  options?: string[];
  description?: string;
}

/**
 * Request for memo generation
 */
export interface MemoGenerationRequest {
  dealId: string;
  templateId: string;
  profileId?: string;
  fieldValues?: Record<string, string>;
  additionalInstructions?: string;
}

/**
 * Default knowledge profiles for initialization
 */
export const DEFAULT_KNOWLEDGE_PROFILES: Omit<KnowledgeProfile, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Base Guidelines',
    type: 'base',
    description: 'Core lending guidelines that apply to all deal types',
    parentId: null,
    guidelines: `You are assisting with lending deal analysis. Always:
- Verify key financial metrics (debt service coverage, loan-to-value, etc.)
- Highlight potential risks clearly
- Reference source documents for all claims
- Use professional, clear language
- Flag any missing information that would typically be required`,
    terminology: 'DSCR (Debt Service Coverage Ratio), LTV (Loan-to-Value), NOI (Net Operating Income), Cap Rate',
    complianceChecks: 'Verify borrower information is complete, check for regulatory requirements',
    isActive: false,
    sortOrder: 0,
  },
  {
    name: 'Commercial Real Estate (CRE)',
    type: 'cre',
    description: 'Guidelines for commercial real estate lending',
    parentId: null,
    guidelines: `CRE-specific guidelines:
- Analyze property type (office, retail, industrial, multifamily)
- Review rent rolls and lease terms
- Assess market conditions and comparables
- Evaluate sponsor experience and track record
- Check environmental considerations
- Standard LTV limits: 75% stabilized, 65% construction`,
    terminology: 'Cap Rate, NOI, Rent Roll, WALT (Weighted Average Lease Term), TI (Tenant Improvements)',
    complianceChecks: 'Environmental Phase I required for all loans >$500K',
    isActive: false,
    sortOrder: 1,
  },
  {
    name: 'Private Equity (PE)',
    type: 'pe',
    description: 'Guidelines for private equity deal financing',
    parentId: null,
    guidelines: `PE-specific guidelines:
- Analyze sponsor track record and fund performance
- Review capital structure and leverage ratios
- Assess management team quality
- Evaluate exit strategy viability
- Check fund documentation and LP terms
- Focus on EBITDA-based metrics`,
    terminology: 'EBITDA, Multiple, IRR, MOIC (Multiple on Invested Capital), DPI, TVPI',
    complianceChecks: 'Verify fund authorization for leverage, check LP consent requirements',
    isActive: false,
    sortOrder: 2,
  },
  {
    name: 'Venture Capital (VC)',
    type: 'vc',
    description: 'Guidelines for venture capital and growth financing',
    parentId: null,
    guidelines: `VC-specific guidelines:
- Focus on growth metrics over profitability
- Analyze burn rate and runway
- Assess market opportunity and TAM
- Review cap table and investor composition
- Evaluate technology/IP moat
- Consider stage-appropriate metrics (ARR, MRR, GMV)`,
    terminology: 'ARR, MRR, CAC, LTV, Burn Rate, Runway, TAM, SAM, SOM',
    complianceChecks: 'Warrant coverage requirements, board observer rights',
    isActive: false,
    sortOrder: 3,
  },
  {
    name: 'C&I Lending',
    type: 'c_and_i',
    description: 'Commercial and Industrial lending guidelines',
    parentId: null,
    guidelines: `C&I-specific guidelines:
- Analyze operating cash flow and working capital
- Review accounts receivable aging
- Assess inventory turnover
- Evaluate management and industry position
- Check collateral (equipment, inventory, receivables)
- Standard advance rates: 80% A/R, 50% inventory`,
    terminology: 'ABL (Asset-Based Lending), Borrowing Base, Advance Rate, Field Exam',
    complianceChecks: 'UCC filings, lien searches, insurance requirements',
    isActive: false,
    sortOrder: 4,
  },
];

/**
 * Default document templates
 */
export const DEFAULT_DOCUMENT_TEMPLATES: Omit<DocumentTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Credit Memo',
    templateType: 'credit_memo',
    profileId: null,
    content: `# Credit Memorandum

## Executive Summary
[Brief overview of the transaction, borrower, and recommendation]

## Borrower Overview
- **Borrower Name:** {{borrower_name}}
- **Industry:** {{industry}}
- **Years in Business:** {{years_in_business}}

## Transaction Summary
- **Loan Amount:** {{loan_amount}}
- **Purpose:** {{loan_purpose}}
- **Term:** {{term_months}} months
- **Interest Rate:** {{interest_rate}}%
- **Collateral:** {{collateral_description}}

## Financial Analysis
[Analysis of borrower's financial condition]

### Key Metrics
- **Debt Service Coverage Ratio:** {{dscr}}
- **Loan-to-Value:** {{ltv}}

## Risk Assessment
[Identification and mitigation of key risks]

## Recommendation
[Final recommendation with conditions if applicable]`,
    requiredSections: ['Executive Summary', 'Borrower Overview', 'Transaction Summary', 'Financial Analysis', 'Risk Assessment', 'Recommendation'],
    aiInstructions: 'Generate a comprehensive credit memo using the deal information and indexed documents. Cite specific sources for all financial data and risk factors. Infer as much as possible from the deal context.',
    defaultFields: ['borrower_name', 'loan_amount', 'term_months', 'interest_rate', 'collateral_description'],
    isActive: true,
  },
  {
    name: 'Investment Committee Report',
    templateType: 'ic_report',
    profileId: null,
    content: `# Investment Committee Report

## Deal Summary
**Borrower:** {{borrower_name}}
**Amount:** {{loan_amount}}
**Date:** {{presentation_date}}

## Investment Thesis
[Why this is a good investment opportunity]

## Deal Structure
[Details of the proposed structure]

## Due Diligence Summary
[Key findings from due diligence]

## Comparable Transactions
[Relevant precedent transactions]

## Risks & Mitigants
[Key risks and how they are addressed]

## Committee Recommendation
[Recommendation for approval/decline with any conditions]`,
    requiredSections: ['Deal Summary', 'Investment Thesis', 'Deal Structure', 'Due Diligence Summary', 'Risks & Mitigants', 'Committee Recommendation'],
    aiInstructions: 'Generate a formal IC report suitable for presentation. Focus on investment merits and risks. Use all available deal documents to support the analysis.',
    defaultFields: ['borrower_name', 'loan_amount', 'presentation_date'],
    isActive: true,
  },
];
