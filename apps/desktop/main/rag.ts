import OpenAI from 'openai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS, TEXT_EXTENSIONS, DOCUMENT_EXTENSIONS, IGNORED_PATTERNS } from '@drasill/shared';
import * as keychain from './keychain';

// For Word doc parsing
import mammoth from 'mammoth';

// PDF extraction request tracking
interface PdfExtractionRequest {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}
const pendingPdfExtractions = new Map<string, PdfExtractionRequest>();
let pdfExtractionReady = false;

interface DocumentChunk {
  id: string;
  filePath: string;
  fileName: string;
  content: string;
  embedding: number[];
  chunkIndex: number;
  totalChunks: number;
  pageNumber?: number; // For PDFs, the page where this chunk came from
}

interface VectorStore {
  workspacePath: string;
  chunks: DocumentChunk[];
  lastUpdated: number;
}

let vectorStore: VectorStore | null = null;
let isIndexing = false;
let openai: OpenAI | null = null;

const CHUNK_SIZE = 1000; // Characters per chunk
const CHUNK_OVERLAP = 200; // Overlap between chunks
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB max per file (PDFs can be large)

/**
 * Initialize OpenAI client (async for keychain access)
 */
async function getOpenAI(): Promise<OpenAI | null> {
  if (!openai) {
    const apiKey = await keychain.getApiKey();
    if (apiKey) {
      openai = new OpenAI({ apiKey });
    }
  }
  return openai;
}

/**
 * Split text into overlapping chunks
 */
function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
    
    if (start >= text.length) break;
  }
  
  return chunks;
}

/**
 * Split PDF text into chunks while tracking page numbers
 * PDF text from extractor contains "--- Page X ---" markers
 */
function chunkPdfText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): Array<{ text: string; pageNumber: number }> {
  const chunks: Array<{ text: string; pageNumber: number }> = [];
  
  // Split by page markers
  const pageRegex = /--- Page (\d+) ---/g;
  const pages: Array<{ pageNumber: number; text: string; startIndex: number }> = [];
  
  let lastIndex = 0;
  let match;
  let lastPageNumber = 1;
  
  while ((match = pageRegex.exec(text)) !== null) {
    if (match.index > lastIndex && pages.length > 0) {
      // Add text before this marker to previous page
      pages[pages.length - 1].text += text.slice(lastIndex, match.index);
    }
    lastPageNumber = parseInt(match[1], 10);
    pages.push({
      pageNumber: lastPageNumber,
      text: '',
      startIndex: match.index + match[0].length,
    });
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (pages.length > 0) {
    pages[pages.length - 1].text = text.slice(lastIndex);
  } else {
    // No page markers found, treat as single page
    pages.push({ pageNumber: 1, text, startIndex: 0 });
  }
  
  // Now chunk each page's text while preserving page numbers
  for (const page of pages) {
    const pageText = page.text.trim();
    if (!pageText) continue;
    
    let start = 0;
    while (start < pageText.length) {
      const end = Math.min(start + chunkSize, pageText.length);
      chunks.push({
        text: pageText.slice(start, end),
        pageNumber: page.pageNumber,
      });
      start += chunkSize - overlap;
      if (start >= pageText.length) break;
    }
  }
  
  return chunks;
}

/**
 * Extract text from PDF file via IPC to renderer process
 * (pdfjs-dist requires DOM APIs only available in renderer)
 */
async function extractPdfText(filePath: string, window: BrowserWindow | null): Promise<string> {
  console.log(`[RAG] extractPdfText called. Ready: ${pdfExtractionReady}, Window: ${!!window}`);
  
  // If renderer isn't ready or no window, return placeholder
  if (!window || !pdfExtractionReady) {
    console.log(`[RAG] PDF extraction not ready (ready=${pdfExtractionReady}, window=${!!window}), skipping: ${path.basename(filePath)}`);
    return `[PDF Document: ${path.basename(filePath)}]\nPDF will be indexed when the app is fully loaded.`;
  }

  return new Promise((resolve, reject) => {
    const requestId = `${filePath}-${Date.now()}`;
    
    // Set timeout for extraction (30 seconds for large PDFs)
    const timeout = setTimeout(() => {
      pendingPdfExtractions.delete(requestId);
      console.warn(`[RAG] PDF extraction timed out: ${path.basename(filePath)}`);
      resolve(`[PDF Document: ${path.basename(filePath)}]\nPDF extraction timed out.`);
    }, 30000);
    
    pendingPdfExtractions.set(requestId, { resolve, reject, timeout });
    
    // Request extraction from renderer
    console.log(`[RAG] Requesting PDF extraction: ${path.basename(filePath)}`);
    window.webContents.send(IPC_CHANNELS.PDF_EXTRACT_TEXT_REQUEST, {
      requestId,
      filePath,
    });
  });
}

/**
 * Handle PDF extraction response from renderer
 */
function setupPdfExtractionHandler(): void {
  ipcMain.on(IPC_CHANNELS.PDF_EXTRACT_TEXT_RESPONSE, (_event, data: { requestId: string; text: string; error?: string }) => {
    const pending = pendingPdfExtractions.get(data.requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingPdfExtractions.delete(data.requestId);
      
      if (data.error) {
        console.error(`[RAG] PDF extraction error: ${data.error}`);
        pending.resolve(`[PDF Document]\nFailed to extract text: ${data.error}`);
      } else {
        console.log(`[RAG] PDF extracted successfully: ${data.text.length} chars`);
        pending.resolve(data.text);
      }
    }
  });
}

/**
 * Mark PDF extraction as ready (called when renderer signals it's ready)
 */
export function setPdfExtractionReady(ready: boolean): void {
  pdfExtractionReady = ready;
  console.log(`[RAG] PDF extraction ready: ${ready}`);
}

/**
 * Extract text from Word document
 */
async function extractWordText(filePath: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
  } catch (error) {
    console.error(`Failed to extract Word text from ${filePath}:`, error);
    return '';
  }
}

/**
 * Extract text from a file based on its type
 */
async function extractFileText(filePath: string, window: BrowserWindow | null): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  
  try {
    const stats = await fs.stat(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      console.log(`Skipping large file: ${filePath}`);
      return '';
    }
    
    if (ext === '.pdf') {
      return await extractPdfText(filePath, window);
    }
    
    if (ext === '.doc' || ext === '.docx') {
      return await extractWordText(filePath);
    }
    
    // Text files (including .md)
    if (TEXT_EXTENSIONS.includes(ext) || ext === '.md' || ext === '.markdown') {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    }
    
    return '';
  } catch (error) {
    console.error(`Failed to read file ${filePath}:`, error);
    return '';
  }
}

/**
 * Get embedding for text using OpenAI
 */
async function getEmbedding(text: string): Promise<number[]> {
  const client = await getOpenAI();
  if (!client) {
    throw new Error('OpenAI API key not configured');
  }
  
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000), // Limit input size
  });
  
  return response.data[0].embedding;
}

/**
 * Get embeddings for multiple texts in a single API call (batch processing)
 * OpenAI supports up to 2048 inputs per request
 */
const EMBEDDING_BATCH_SIZE = 100; // Process 100 chunks per API call

async function getBatchEmbeddings(texts: string[]): Promise<number[][]> {
  const client = await getOpenAI();
  if (!client) {
    throw new Error('OpenAI API key not configured');
  }
  
  // Truncate each text to 8000 chars
  const truncatedTexts = texts.map(t => t.slice(0, 8000));
  
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: truncatedTexts,
  });
  
  // Sort by index to ensure correct order
  const sorted = response.data.sort((a, b) => a.index - b.index);
  return sorted.map(d => d.embedding);
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Recursively find all indexable files in a directory
 */
async function findFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (IGNORED_PATTERNS.includes(entry.name)) continue;
      
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await findFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (TEXT_EXTENSIONS.includes(ext) || DOCUMENT_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Failed to read directory ${dirPath}:`, error);
  }
  
  return files;
}

/**
 * Send indexing progress to renderer
 */
function sendProgress(window: BrowserWindow, current: number, total: number, fileName: string) {
  window.webContents.send(IPC_CHANNELS.RAG_INDEX_PROGRESS, {
    current,
    total,
    fileName,
    percentage: Math.round((current / total) * 100),
  });
}

/**
 * Index a workspace for RAG
 */
export async function indexWorkspace(workspacePath: string, window: BrowserWindow): Promise<{ success: boolean; chunksIndexed: number; error?: string }> {
  console.log(`[RAG] indexWorkspace called. PDF extraction ready: ${pdfExtractionReady}`);
  
  if (isIndexing) {
    return { success: false, chunksIndexed: 0, error: 'Indexing already in progress' };
  }
  
  const client = await getOpenAI();
  if (!client) {
    return { success: false, chunksIndexed: 0, error: 'OpenAI API key not configured' };
  }
  
  isIndexing = true;
  
  try {
    // Find all indexable files
    const files = await findFiles(workspacePath);
    
    if (files.length === 0) {
      isIndexing = false;
      return { success: true, chunksIndexed: 0 };
    }
    
    // Phase 1: Extract text and create chunks (without embeddings)
    interface PendingChunk {
      id: string;
      filePath: string;
      fileName: string;
      content: string;
      chunkIndex: number;
      totalChunks: number;
      pageNumber?: number;
    }
    const pendingChunks: PendingChunk[] = [];
    
    console.log(`[RAG] Phase 1: Extracting text from ${files.length} files...`);
    
    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      
      sendProgress(window, i + 1, files.length, `Extracting: ${fileName}`);
      
      // Extract text
      const text = await extractFileText(filePath, window);
      if (!text || text.trim().length < 50) continue;
      
      // Skip PDFs with placeholder content (extraction wasn't ready)
      if (ext === '.pdf' && (text.includes('PDF will be indexed when the app is fully loaded') || 
                             text.includes('PDF extraction timed out') ||
                             text.includes('Failed to extract text'))) {
        console.log(`[RAG] Skipping PDF with placeholder content: ${fileName}`);
        continue;
      }
      
      // For PDFs, use page-aware chunking
      if (ext === '.pdf') {
        const pdfChunks = chunkPdfText(text);
        for (let j = 0; j < pdfChunks.length; j++) {
          pendingChunks.push({
            id: `${filePath}-${j}`,
            filePath,
            fileName,
            content: pdfChunks[j].text,
            chunkIndex: j,
            totalChunks: pdfChunks.length,
            pageNumber: pdfChunks[j].pageNumber,
          });
        }
      } else {
        // Regular chunking for non-PDF files
        const textChunks = chunkText(text);
        for (let j = 0; j < textChunks.length; j++) {
          pendingChunks.push({
            id: `${filePath}-${j}`,
            filePath,
            fileName,
            content: textChunks[j],
            chunkIndex: j,
            totalChunks: textChunks.length,
          });
        }
      }
    }
    
    // Phase 2: Batch embed all chunks
    console.log(`[RAG] Phase 2: Embedding ${pendingChunks.length} chunks in batches of ${EMBEDDING_BATCH_SIZE}...`);
    
    const chunks: DocumentChunk[] = [];
    const totalBatches = Math.ceil(pendingChunks.length / EMBEDDING_BATCH_SIZE);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * EMBEDDING_BATCH_SIZE;
      const end = Math.min(start + EMBEDDING_BATCH_SIZE, pendingChunks.length);
      const batch = pendingChunks.slice(start, end);
      
      sendProgress(window, batchIndex + 1, totalBatches, `Embedding batch ${batchIndex + 1}/${totalBatches}`);
      
      try {
        const texts = batch.map(c => c.content);
        const embeddings = await getBatchEmbeddings(texts);
        
        for (let i = 0; i < batch.length; i++) {
          chunks.push({
            ...batch[i],
            embedding: embeddings[i],
          });
        }
        
        // Small delay between batches to avoid rate limits
        if (batchIndex < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error(`[RAG] Failed to embed batch ${batchIndex + 1}:`, error);
        // Continue with next batch instead of failing completely
      }
    }
    
    // Store the vector store
    vectorStore = {
      workspacePath,
      chunks,
      lastUpdated: Date.now(),
    };
    
    isIndexing = false;
    
    // Send completion
    window.webContents.send(IPC_CHANNELS.RAG_INDEX_COMPLETE, {
      chunksIndexed: chunks.length,
      filesIndexed: files.length,
    });
    
    return { success: true, chunksIndexed: chunks.length };
  } catch (error) {
    isIndexing = false;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, chunksIndexed: 0, error: errorMessage };
  }
}

/**
 * Search the vector store for relevant chunks
 */
export async function searchRAG(query: string, topK = 5): Promise<{ chunks: Array<{ content: string; fileName: string; filePath: string; score: number; chunkIndex: number; totalChunks: number; pageNumber?: number }> }> {
  if (!vectorStore || vectorStore.chunks.length === 0) {
    return { chunks: [] };
  }
  
  try {
    const queryEmbedding = await getEmbedding(query);
    
    // Calculate similarity for all chunks
    const scored = vectorStore.chunks.map(chunk => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));
    
    // Sort by similarity and take top K
    scored.sort((a, b) => b.score - a.score);
    const topChunks = scored.slice(0, topK);
    
    return {
      chunks: topChunks.map(c => ({
        content: c.content,
        fileName: c.fileName,
        filePath: c.filePath,
        score: c.score,
        chunkIndex: c.chunkIndex,
        totalChunks: c.totalChunks,
        pageNumber: c.pageNumber,
      })),
    };
  } catch (error) {
    console.error('RAG search failed:', error);
    return { chunks: [] };
  }
}

/**
 * Get RAG context for a chat query
 * Returns context with structured source citations
 */
export async function getRAGContext(query: string): Promise<{ context: string; sources: Array<{ fileName: string; filePath: string; section: string; pageNumber?: number }> }> {
  const results = await searchRAG(query, 5);
  
  if (results.chunks.length === 0) {
    return { context: '', sources: [] };
  }
  
  // Build context string with source attribution
  // Use a numbered reference format that the AI can cite
  const sources: Array<{ fileName: string; filePath: string; section: string; pageNumber?: number }> = [];
  const contextParts = results.chunks.map((chunk, index) => {
    // For PDFs with page numbers, include the page
    const sectionLabel = chunk.pageNumber 
      ? `Page ${chunk.pageNumber}`
      : chunk.totalChunks > 1 
        ? `Section ${chunk.chunkIndex + 1}/${chunk.totalChunks}`
        : 'Full Document';
    
    sources.push({
      fileName: chunk.fileName,
      filePath: chunk.filePath,
      section: sectionLabel,
      pageNumber: chunk.pageNumber,
    });
    
    return `[${index + 1}] ${chunk.fileName} (${sectionLabel})\n${chunk.content}`;
  });
  
  return {
    context: contextParts.join('\n\n---\n\n'),
    sources,
  };
}

/**
 * Check if workspace is indexed
 */
export function isWorkspaceIndexed(workspacePath: string): boolean {
  return vectorStore !== null && vectorStore.workspacePath === workspacePath;
}

/**
 * Get indexing status
 */
export function getIndexingStatus(): { isIndexing: boolean; chunksCount: number } {
  return {
    isIndexing,
    chunksCount: vectorStore?.chunks.length || 0,
  };
}

/**
 * Clear the vector store
 */
export function clearVectorStore(): void {
  vectorStore = null;
}

/**
 * Reset OpenAI client (for when API key changes)
 */
export function resetOpenAI(): void {
  openai = null;
}

/**
 * Initialize RAG system (setup IPC handlers)
 */
export function initRAG(): void {
  setupPdfExtractionHandler();
  console.log('[RAG] Initialized PDF extraction IPC handler');
}
