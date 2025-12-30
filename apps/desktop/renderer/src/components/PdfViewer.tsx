import { useState, useEffect, useCallback, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import styles from './PdfViewer.module.css';

// Configure PDF.js worker - use bundled worker for Electron compatibility
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PdfViewerProps {
  fileName: string;
  path: string;
  initialPage?: number;
}

export function PdfViewer({ fileName, path, initialPage }: PdfViewerProps) {
  const [pdfData, setPdfData] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(initialPage || 1);
  const [scale, setScale] = useState<number>(1.0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const initialPageApplied = useRef(false);

  // Track initialPage changes from citations
  useEffect(() => {
    if (initialPage && initialPage !== currentPage && numPages > 0) {
      const targetPage = Math.min(Math.max(1, initialPage), numPages);
      setCurrentPage(targetPage);
    }
  }, [initialPage, numPages]);

  // Load PDF data
  useEffect(() => {
    let cancelled = false;
    
    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const result = await window.electronAPI.readFileBinary(path);
        if (!cancelled) {
          setPdfData(`data:application/pdf;base64,${result.data}`);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPdf();
    
    return () => {
      cancelled = true;
    };
  }, [path]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    // If we have an initial page and haven't applied it yet, go there
    if (initialPage && !initialPageApplied.current) {
      setCurrentPage(Math.min(Math.max(1, initialPage), numPages));
      initialPageApplied.current = true;
    } else if (!initialPage) {
      setCurrentPage(1);
    }
  }, [initialPage]);

  const onDocumentLoadError = useCallback((error: Error) => {
    setError(`Failed to load PDF: ${error.message}`);
  }, []);

  const goToPrevPage = () => setCurrentPage((prev) => Math.max(1, prev - 1));
  const goToNextPage = () => setCurrentPage((prev) => Math.min(numPages, prev + 1));
  const zoomIn = () => setScale((prev) => Math.min(3, prev + 0.25));
  const zoomOut = () => setScale((prev) => Math.max(0.5, prev - 0.25));
  const resetZoom = () => setScale(1.0);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <span className={styles.spinner}>⏳</span>
          <p>Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <span className={styles.icon}>❌</span>
          <h2>Error Loading PDF</h2>
          <p className={styles.fileName}>{fileName}</p>
          <p className={styles.errorMessage}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarSection}>
          <span className={styles.fileName}>{fileName}</span>
        </div>
        
        <div className={styles.toolbarSection}>
          <button 
            className={styles.toolButton} 
            onClick={goToPrevPage} 
            disabled={currentPage <= 1}
            title="Previous page"
          >
            ◀
          </button>
          <span className={styles.pageInfo}>
            {currentPage} / {numPages}
          </span>
          <button 
            className={styles.toolButton} 
            onClick={goToNextPage} 
            disabled={currentPage >= numPages}
            title="Next page"
          >
            ▶
          </button>
        </div>

        <div className={styles.toolbarSection}>
          <button 
            className={styles.toolButton} 
            onClick={zoomOut} 
            disabled={scale <= 0.5}
            title="Zoom out"
          >
            −
          </button>
          <button 
            className={styles.zoomButton} 
            onClick={resetZoom}
            title="Reset zoom"
          >
            {Math.round(scale * 100)}%
          </button>
          <button 
            className={styles.toolButton} 
            onClick={zoomIn} 
            disabled={scale >= 3}
            title="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      {/* PDF Content */}
      <div className={styles.pdfContainer}>
        <Document
          file={pdfData}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={<div className={styles.loading}>Loading page...</div>}
          className={styles.document}
        >
          <Page
            pageNumber={currentPage}
            scale={scale}
            className={styles.page}
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />
        </Document>
      </div>
    </div>
  );
}
