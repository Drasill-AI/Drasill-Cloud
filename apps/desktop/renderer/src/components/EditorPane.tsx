import { useCallback, useRef, useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useAppStore } from '../store';
import { PdfViewer } from './PdfViewer';
import { WordViewer } from './WordViewer';
import { SchematicViewer } from './SchematicViewer';
import { ImageViewer } from './ImageViewer';
import { EquipmentViewer } from './EquipmentViewer';
import styles from './EditorPane.module.css';
import logoImage from '../assets/logo.png';

export function EditorPane() {
  const { 
    tabs, 
    activeTabId, 
    fileContents, 
    loadingFiles,
    saveTabViewState,
    getTabViewState,
  } = useAppStore();

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const previousTabId = useRef<string | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const content = activeTabId ? fileContents.get(activeTabId) : undefined;
  const isLoading = activeTabId ? loadingFiles.has(activeTabId) : false;

  // Save view state when switching tabs
  useEffect(() => {
    if (previousTabId.current && previousTabId.current !== activeTabId && editorRef.current) {
      const viewState = editorRef.current.saveViewState();
      if (viewState) {
        saveTabViewState(previousTabId.current, viewState);
      }
    }
    previousTabId.current = activeTabId;
  }, [activeTabId, saveTabViewState]);

  // Restore view state when tab changes
  useEffect(() => {
    if (editorRef.current && activeTabId) {
      const viewState = getTabViewState(activeTabId) as editor.ICodeEditorViewState | undefined;
      if (viewState) {
        editorRef.current.restoreViewState(viewState);
      }
    }
  }, [activeTabId, getTabViewState, content]);

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    
    // Restore view state if available
    if (activeTabId) {
      const viewState = getTabViewState(activeTabId) as editor.ICodeEditorViewState | undefined;
      if (viewState) {
        editor.restoreViewState(viewState);
      }
    }
  }, [activeTabId, getTabViewState]);

  // Empty state
  if (!activeTab) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyContent}>
          <img src={logoImage} alt="Drasill" className={styles.logo} />
          <h2>Drasill Cloud</h2>
          <p>Equipment Documentation Viewer</p>
          <div className={styles.shortcuts}>
            <p><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd> Open Folder</p>
            <p><kbd>Ctrl</kbd>+<kbd>P</kbd> Command Palette</p>
            <p><kbd>Ctrl</kbd>+<kbd>W</kbd> Close Tab</p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Loading file...</p>
      </div>
    );
  }

  // PDF viewer
  if (activeTab.type === 'pdf') {
    return <PdfViewer fileName={activeTab.name} path={activeTab.path} />;
  }

  // Word viewer
  if (activeTab.type === 'word') {
    return <WordViewer fileName={activeTab.name} path={activeTab.path} />;
  }

  // Image viewer
  if (activeTab.type === 'image') {
    return <ImageViewer fileName={activeTab.name} path={activeTab.path} />;
  }

  // Schematic viewer
  if (activeTab.type === 'schematic' && activeTab.schematicData) {
    return <SchematicViewer schematicData={activeTab.schematicData} />;
  }

  // Equipment viewer
  if (activeTab.type === 'equipment' && activeTab.equipmentId) {
    return <EquipmentViewer equipmentId={activeTab.equipmentId} />;
  }

  // Monaco editor for text/markdown
  return (
    <div className={styles.editorWrapper}>
      <Editor
        key={activeTabId} // Force remount on tab change for clean state
        height="100%"
        defaultLanguage={getLanguage(activeTab.name)}
        value={content || ''}
        theme="vs-dark"
        onMount={handleEditorMount}
        options={{
          readOnly: true,
          minimap: { enabled: true },
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
