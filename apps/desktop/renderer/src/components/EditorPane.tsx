import { useCallback, useRef, useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useAppStore } from '../store';
import { PdfViewer } from './PdfViewer';
import { WordViewer } from './WordViewer';
import { SchematicViewer } from './SchematicViewer';
import styles from './EditorPane.module.css';
import logoImage from '../assets/logo.png';

interface EditorPaneProps {
  paneId?: 'primary' | 'secondary';
}

export function EditorPane({ paneId = 'primary' }: EditorPaneProps) {
  const { 
    tabs, 
    activeTabId, 
    secondaryTabs,
    secondaryActiveTabId,
    fileContents, 
    loadingFiles,
    saveTabViewState,
    getTabViewState,
    setActivePaneId,
  } = useAppStore();

  // Use appropriate tabs based on paneId
  const paneTabs = paneId === 'secondary' ? secondaryTabs : tabs;
  const paneActiveTabId = paneId === 'secondary' ? secondaryActiveTabId : activeTabId;

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const previousTabId = useRef<string | null>(null);

  const activeTab = paneTabs.find((t) => t.id === paneActiveTabId);
  // For secondary pane, look up content by the actual file path (without the 'secondary-' prefix)
  const contentKey = paneId === 'secondary' && paneActiveTabId 
    ? paneActiveTabId.replace('secondary-', '') 
    : paneActiveTabId;
  const content = contentKey ? fileContents.get(contentKey) : undefined;
  const isLoading = contentKey ? loadingFiles.has(contentKey) : false;

  // Save view state when switching tabs
  useEffect(() => {
    if (previousTabId.current && previousTabId.current !== paneActiveTabId && editorRef.current) {
      const viewState = editorRef.current.saveViewState();
      if (viewState) {
        saveTabViewState(previousTabId.current, viewState);
      }
    }
    previousTabId.current = paneActiveTabId;
  }, [paneActiveTabId, saveTabViewState]);

  // Restore view state when tab changes
  useEffect(() => {
    if (editorRef.current && paneActiveTabId) {
      const viewState = getTabViewState(paneActiveTabId) as editor.ICodeEditorViewState | undefined;
      if (viewState) {
        editorRef.current.restoreViewState(viewState);
      }
    }
  }, [paneActiveTabId, getTabViewState, content]);

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    
    // Restore view state if available
    if (paneActiveTabId) {
      const viewState = getTabViewState(paneActiveTabId) as editor.ICodeEditorViewState | undefined;
      if (viewState) {
        editor.restoreViewState(viewState);
      }
    }
  }, [paneActiveTabId, getTabViewState]);

  // Handle click to set active pane
  const handlePaneClick = () => {
    setActivePaneId(paneId);
  };

  // Empty state
  if (!activeTab) {
    return (
      <div className={styles.empty} onClick={handlePaneClick}>
        <div className={styles.emptyContent}>
          {paneId === 'primary' ? (
            <>
              <img src={logoImage} alt="Drasill" className={styles.logo} />
              <h2>Drasill Finance</h2>
              <p>Deal Management & Documentation</p>
              <div className={styles.shortcuts}>
                <p><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd> Open Folder</p>
                <p><kbd>Ctrl</kbd>+<kbd>P</kbd> Command Palette</p>
                <p><kbd>Ctrl</kbd>+<kbd>W</kbd> Close Tab</p>
              </div>
            </>
          ) : (
            <>
              <p className={styles.secondaryEmptyText}>Right-click a source citation to open here</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={styles.loading} onClick={handlePaneClick}>
        <div className={styles.spinner} />
        <p>Loading file...</p>
      </div>
    );
  }

  // PDF viewer
  if (activeTab.type === 'pdf') {
    return (
      <div onClick={handlePaneClick} style={{ height: '100%' }}>
        <PdfViewer 
          fileName={activeTab.name} 
          path={activeTab.path} 
          source={activeTab.source}
          oneDriveId={activeTab.oneDriveId}
          initialPage={activeTab.initialPage}
        />
      </div>
    );
  }

  // Word viewer
  if (activeTab.type === 'word') {
    return (
      <div onClick={handlePaneClick} style={{ height: '100%' }}>
        <WordViewer 
          fileName={activeTab.name} 
          path={activeTab.path}
          source={activeTab.source}
          oneDriveId={activeTab.oneDriveId}
        />
      </div>
    );
  }

  // Schematic viewer
  if (activeTab.type === 'schematic' && activeTab.schematicData) {
    return (
      <div onClick={handlePaneClick} style={{ height: '100%' }}>
        <SchematicViewer schematicData={activeTab.schematicData} />
      </div>
    );
  }

  // Monaco editor for text/markdown
  return (
    <div className={styles.editorWrapper} onClick={handlePaneClick}>
      <Editor
        key={paneActiveTabId} // Force remount on tab change for clean state
        height="100%"
        defaultLanguage={getLanguage(activeTab.name)}
        value={content || ''}
        theme="vs-dark"
        onMount={handleEditorMount}
        options={{
          readOnly: true,
          minimap: { enabled: paneId === 'primary' },
          fontSize: 14,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: activeTab.type === 'markdown' ? 'on' : 'off',
          automaticLayout: true,
          padding: { top: 16, bottom: 16 },
        }}
      />
    </div>
  );
}

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    markdown: 'markdown',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    py: 'python',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    rs: 'rust',
    go: 'go',
    sql: 'sql',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'shell',
    bash: 'shell',
    ps1: 'powershell',
    txt: 'plaintext',
  };
  
  return languageMap[ext || ''] || 'plaintext';
}
