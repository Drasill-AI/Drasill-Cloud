/**
 * PDF Text Extraction Service
 * Uses pdfjs-dist in the renderer process to extract text from PDFs
 * for RAG indexing (since pdfjs requires DOM APIs)
 */
import { pdfjs } from 'react-pdf';

// Ensure worker is configured (same as PdfViewer)
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Extract text content from all pages of a PDF
 * @param pdfData - Base64 encoded PDF data (without data URL prefix)
 */
async function extractTextFromPdf(pdfData: string): Promise<string> {
  try {
    // Convert base64 to Uint8Array (avoids URL.parse issues in pdfjs)
    const binaryString = atob(pdfData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Load the PDF document using typed array
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    
    const textParts: string[] = [];
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Concatenate all text items on the page
      const pageText = textContent.items
        .map((item: { str?: string }) => item.str || '')
        .join(' ');
      
      if (pageText.trim()) {
        textParts.push(`--- Page ${pageNum} ---\n${pageText}`);
      }
    }
    
    return textParts.join('\n\n');
  } catch (error) {
    console.error('[PdfExtractor] Failed to extract text:', error);
    throw error;
  }
}

/**
 * Initialize the PDF extraction listener
 * Called once when the app starts
 */
export function initPdfExtractor(): void {
  // Listen for extraction requests from main process
  const cleanup = window.electronAPI.onPdfExtractRequest(async (data) => {
    const { requestId, filePath } = data;
    console.log(`[PdfExtractor] Received extraction request for: ${filePath}`);
    
    try {
      // Read the PDF file as base64 via IPC
      const result = await window.electronAPI.readFileBinary(filePath);
      
      // Extract text using pdfjs (pass raw base64, not data URL)
      const text = await extractTextFromPdf(result.data);
      
      console.log(`[PdfExtractor] Extracted ${text.length} chars from ${filePath}`);
      
      // Send result back to main process
      window.electronAPI.sendPdfExtractResult({
        requestId,
        text: text || `[PDF Document: ${filePath}]\nNo extractable text content found.`,
      });
    } catch (error) {
      console.error(`[PdfExtractor] Error extracting ${filePath}:`, error);
      
      // Send error back to main process
      window.electronAPI.sendPdfExtractResult({
        requestId,
        text: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
  
  // Signal to main process that we're ready
  window.electronAPI.signalPdfExtractionReady();
  console.log('[PdfExtractor] Initialized and signaled ready');
  
  // Note: cleanup function is not called since this runs for app lifetime
  // If needed, store cleanup reference for app shutdown
  void cleanup;
}
