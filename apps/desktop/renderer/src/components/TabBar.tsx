import { useAppStore } from '../store';
import styles from './TabBar.module.css';

interface TabBarProps {
  paneId?: 'primary' | 'secondary';
}

export function TabBar({ paneId = 'primary' }: TabBarProps) {
  const { 
    tabs, 
    activeTabId, 
    setActiveTab, 
    closeTab,
    secondaryTabs,
    secondaryActiveTabId,
    setSecondaryActiveTab,
    closeSecondaryTab,
    closeSplitView,
    activePaneId,
  } = useAppStore();

  // Use appropriate tabs based on paneId
  const paneTabs = paneId === 'secondary' ? secondaryTabs : tabs;
  const paneActiveTabId = paneId === 'secondary' ? secondaryActiveTabId : activeTabId;
  const setPaneActiveTab = paneId === 'secondary' ? setSecondaryActiveTab : setActiveTab;
  const closePaneTab = paneId === 'secondary' ? closeSecondaryTab : closeTab;
  const isActivePane = activePaneId === paneId;

  if (paneTabs.length === 0 && paneId === 'primary') {
    return null;
  }

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closePaneTab(tabId);
  };

  return (
    <div className={`${styles.tabBar} ${isActivePane ? styles.activePane : ''}`}>
      <div className={styles.tabs}>
        {paneTabs.map((tab) => (
          <div
            key={tab.id}
            className={`${styles.tab} ${paneActiveTabId === tab.id ? styles.active : ''}`}
            onClick={() => setPaneActiveTab(tab.id)}
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
      {paneId === 'secondary' && (
        <button
          className={styles.closeSplitButton}
          onClick={closeSplitView}
          title="Close split view"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

function getTabIcon(type: string): string {
  switch (type) {
    case 'markdown':
      return '📝';
    case 'pdf':
      return '📕';
    case 'word':
      return '📘';
    default:
      return '📄';
  }
}
