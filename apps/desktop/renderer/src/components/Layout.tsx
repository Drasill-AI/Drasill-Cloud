import { useState, useCallback, useRef, useEffect } from 'react';
import { FileExplorer } from './FileExplorer';
import { TabBar } from './TabBar';
import { EditorPane } from './EditorPane';
import { RightPanel } from './RightPanel';
import { TopBar } from './TopBar';
import { BottomPanel } from './BottomPanel';
import { LogEntryModal } from './LogEntryModal';
import { EquipmentModal } from './EquipmentModal';
import { ConnectionStatus } from './ConnectionStatus';
import { useAppStore } from '../store';
import styles from './Layout.module.css';

export function Layout() {
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [rightPanelWidth, setRightPanelWidth] = useState(300);
  const layoutRef = useRef<HTMLDivElement>(null);

  const { 
    bottomPanelState, 
    setBottomPanelHeight, 
    toggleBottomPanel,
    activeTabId,
    tabs,
    detectEquipmentFromFile,
  } = useAppStore();

  // Detect equipment when active tab changes
  useEffect(() => {
    if (activeTabId) {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab) {
        detectEquipmentFromFile(activeTab.path);
      }
    }
  }, [activeTabId, tabs, detectEquipmentFromFile]);

  const handleLeftDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      const newWidth = Math.max(150, Math.min(500, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  const handleRightDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightPanelWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startX - e.clientX;
      const newWidth = Math.max(200, Math.min(600, startWidth + delta));
      setRightPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [rightPanelWidth]);

  return (
    <div className={styles.layout} ref={layoutRef}>
      {/* Left Sidebar - File Explorer */}
      <aside className={styles.sidebar} style={{ width: sidebarWidth }}>
        <FileExplorer />
      </aside>

      {/* Left Resize Handle */}
      <div 
        className={styles.resizeHandle} 
        onMouseDown={handleLeftDragStart}
      />

      {/* Center - Main Content Area */}
      <div className={styles.centerArea}>
        {/* Top Bar - Equipment Selection */}
        <TopBar />
        
        {/* Editor Section */}
        <main className={styles.main}>
          <TabBar />
          <div className={styles.editorContainer}>
            <EditorPane />
          </div>
        </main>

        {/* Bottom Panel - Logs & Analytics */}
        <BottomPanel 
          height={bottomPanelState.height}
          onHeightChange={setBottomPanelHeight}
          isOpen={bottomPanelState.isOpen}
          onToggle={toggleBottomPanel}
        />
      </div>

      {/* Right Resize Handle */}
      <div 
        className={styles.resizeHandle} 
        onMouseDown={handleRightDragStart}
      />

      {/* Right Panel - Assistant Chat */}
      <aside className={styles.rightPanel} style={{ width: rightPanelWidth }}>
        <RightPanel />
      </aside>

      {/* Modals */}
      <LogEntryModal />
      <EquipmentModal />

      {/* Connection Status Indicator */}
      <ConnectionStatus />
    </div>
  );
}
