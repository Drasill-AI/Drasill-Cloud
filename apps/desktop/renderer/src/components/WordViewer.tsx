import { useState, useEffect } from 'react';
import styles from './PdfViewer.module.css'; // Reuse PDF viewer styles

interface WordViewerProps {
  fileName: string;
  path: string;
  source?: 'local' | 'onedrive';
  oneDriveId?: string;
}

export function WordViewer({ fileName, path, source, oneDriveId }: WordViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadWord() {
      setLoading(true);
      setError(null);
      
      try {
        let content: string;
        if (source === 'onedrive' && oneDriveId) {
          // For OneDrive, read the file content as base64 and parse it
          const oneDriveResult = await window.electronAPI.readOneDriveFile(oneDriveId);
          const wordResult = await window.electronAPI.readWordFileBuffer(oneDriveResult.content);
          content = wordResult.content;
        } else {
          const result = await window.electronAPI.readWordFile(path);
          content = result.content;
        }
        setContent(content);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Word document');
      } finally {
        setLoading(false);
      }
    }

    loadWord();
  }, [path, source, oneDriveId]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Loading Word document...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <h3>Failed to load document</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className={styles.pdfViewer}>
      <div className={styles.toolbar}>
        <span className={styles.fileName}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          {fileName}
        </span>
        <span className={styles.badge}>Word Document</span>
      </div>
      
      <div className={styles.pageContainer} style={{ padding: '24px', overflow: 'auto' }}>
        <div style={{ 
          background: 'var(--panel-bg)', 
          padding: '32px',
          borderRadius: '8px',
          maxWidth: '800px',
          margin: '0 auto',
          whiteSpace: 'pre-wrap',
          fontFamily: 'var(--font-mono)',
          fontSize: '14px',
          lineHeight: '1.6',
          color: 'var(--text-primary)',
        }}>
          {content || 'No content found in document'}
        </div>
      </div>
    </div>
  );
}
