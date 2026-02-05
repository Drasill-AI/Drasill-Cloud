import * as pdfjs from 'pdfjs-dist';

// Configure PDF.js worker - use bundled worker for Electron compatibility
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Extract text from a PDF file via its base64 data
 * Returns text with page markers for page-aware chunking
 */
export async function extractPdfText(base64Data: string): Promise<string> {
  try {
    // Convert base64 to Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Load the PDF document
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    
    const textParts: string[] = [];
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Concatenate text items
      const pageText = textContent.items
        .filter((item): item is { str: string } => 'str' in item)
        .map(item => item.str)
        .join(' ');
      
      // Add page marker for page-aware chunking
      textParts.push(`--- Page ${pageNum} ---\n${pageText}`);
    }
    
    return textParts.join('\n\n');
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw error;
  }
}

/**
 * Setup PDF extraction listener for RAG indexing
 * Called on app startup to enable PDF text extraction from main process
 */
export function setupPdfExtractionListener(): () => void {
  console.log('[PDF Extractor] Setting up listener...');
  
  const unsubscribe = window.electronAPI.onPdfExtractRequest(async (data) => {
    const fileName = data.fileName || data.filePath || 'unknown';
    console.log(`[PDF Extractor] Received request for: ${fileName}`);
    
    try {
      let base64Data: string;
      
      if (data.base64Data) {
        // OneDrive: base64 data provided directly
        base64Data = data.base64Data;
      } else if (data.filePath) {
        // Local file: read from disk
        const result = await window.electronAPI.readFileBinary(data.filePath);
        base64Data = result.data;
      } else {
        throw new Error('No file path or base64 data provided');
      }
      
      // Extract text from the PDF
      const text = await extractPdfText(base64Data);
      
      console.log(`[PDF Extractor] Extracted ${text.length} chars from ${fileName}`);
      
      // Send result back to main process
      window.electronAPI.sendPdfExtractResult({
        requestId: data.requestId,
        text,
      });
    } catch (error) {
      console.error(`[PDF Extractor] Error extracting ${fileName}:`, error);
      
      window.electronAPI.sendPdfExtractResult({
        requestId: data.requestId,
        text: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
  
  // Signal to main process that PDF extraction is ready
  window.electronAPI.signalPdfExtractorReady();
  console.log('[PDF Extractor] Ready signal sent to main process');
  
  return unsubscribe;
}
