import { useRef, useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import styles from './TabBar.module.css';

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useAppStore();
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const container = tabsContainerRef.current;
    if (container) {
      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(
        container.scrollLeft < container.scrollWidth - container.clientWidth - 1
      );
    }
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll, tabs.length]);

  const scrollTabs = (direction: 'left' | 'right') => {
    const container = tabsContainerRef.current;
    if (container) {
      const scrollAmount = 200;
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
      setTimeout(checkScroll, 300);
    }
  };

  if (tabs.length === 0) {
    return null;
  }

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  return (
    <div className={styles.tabBar}>
      {canScrollLeft && (
        <button 
          className={styles.scrollButton} 
          onClick={() => scrollTabs('left')}
          aria-label="Scroll tabs left"
        >
          ‹
        </button>
      )}
      <div 
        className={styles.tabs} 
        ref={tabsContainerRef}
        onScroll={checkScroll}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`${styles.tab} ${activeTabId === tab.id ? styles.active : ''} ${styles[getTabColorClass(tab.type, tab.path)]}`}
            onClick={() => setActiveTab(tab.id)}
            title={tab.path}
          >
            <span className={styles.icon}>{getTabIcon(tab.type)}</span>
            <span className={styles.name}>{tab.name}</span>
            <button
              className={styles.closeButton}
              onClick={(e) => handleClose(e, tab.id)}
              aria-label="Close tab"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {canScrollRight && (
        <button 
          className={styles.scrollButton} 
          onClick={() => scrollTabs('right')}
          aria-label="Scroll tabs right"
        >
          ›
        </button>
      )}
    </div>
  );
}

function getTabColorClass(type: string, path: string): string {
  // Work orders - green
  if (type === 'workorder' || type === 'workorders-list') {
    return 'tabWorkOrder';
  }
  
  // Equipment - yellow
  if (type === 'equipment') {
    return 'tabEquipment';
  }
  
  // Schematics and images - purple
  if (type === 'schematic' || type === 'image') {
    return 'tabSchematic';
  }
  
  // Documents (PDF, markdown, text) - blue
  if (type === 'pdf' || type === 'markdown' || type === 'text') {
    return 'tabDocument';
  }
  
  // Fallback based on file extension
  const ext = path.toLowerCase().split('.').pop() || '';
  if (['pdf', 'md', 'txt', 'doc', 'docx'].includes(ext)) {
    return 'tabDocument';
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
    return 'tabSchematic';
  }
  
  return 'tabDocument'; // Default to blue
}

function getTabIcon(type: string): string {
  switch (type) {
    case 'markdown':
      return '📝';
    case 'pdf':
      return '📕';
    case 'equipment':
      return '⚙️';
    case 'workorder':
    case 'workorders-list':
      return '🔧';
    case 'schematic':
    case 'image':
      return '🖼️';
    default:
      return '📄';
  }
}
