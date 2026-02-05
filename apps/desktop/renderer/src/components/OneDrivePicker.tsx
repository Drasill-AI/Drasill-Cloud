import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { OneDriveItem } from '@drasill/shared';
import styles from './OneDrivePicker.module.css';

interface BreadcrumbItem {
  id: string;
  name: string;
}

export function OneDrivePicker() {
  const { 
    setOneDrivePickerOpen, 
    openOneDriveWorkspace,
    oneDriveStatus,
    logoutOneDrive,
    showToast,
  } = useAppStore();
  
  const [items, setItems] = useState<OneDriveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: 'root', name: 'OneDrive' }]);
  const [selectedFolder, setSelectedFolder] = useState<OneDriveItem | null>(null);

  useEffect(() => {
    loadFolder(currentFolderId);
  }, [currentFolderId]);

  const loadFolder = async (folderId: string) => {
    setLoading(true);
    try {
      const folderItems = await window.electronAPI.listOneDriveFolder(folderId === 'root' ? undefined : folderId);
      setItems(folderItems);
      setSelectedFolder(null);
    } catch (error) {
      console.error('Failed to load OneDrive folder:', error);
      showToast('error', 'Failed to load OneDrive folder');
    } finally {
      setLoading(false);
    }
  };

  const handleItemClick = (item: OneDriveItem) => {
    if (item.isDirectory) {
      setSelectedFolder(item);
    }
  };

  const handleItemDoubleClick = (item: OneDriveItem) => {
    if (item.isDirectory) {
      // Navigate into folder
      setCurrentFolderId(item.id);
      setBreadcrumbs([...breadcrumbs, { id: item.id, name: item.name }]);
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    const crumb = breadcrumbs[index];
    setCurrentFolderId(crumb.id);
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
  };

  const handleSelectFolder = async () => {
    const folderToOpen = selectedFolder || { 
      id: currentFolderId, 
      name: breadcrumbs[breadcrumbs.length - 1].name,
      path: breadcrumbs.map(b => b.name).join('/').replace('OneDrive/', ''),
    };
    
    // Get folder path from breadcrumbs
    const folderPath = selectedFolder 
      ? [...breadcrumbs.map(b => b.name), selectedFolder.name].join('/').replace('OneDrive/', '')
      : breadcrumbs.map(b => b.name).join('/').replace('OneDrive/', '');
    
    await openOneDriveWorkspace(folderToOpen.id, folderToOpen.name, folderPath);
  };

  const handleClose = () => {
    setOneDrivePickerOpen(false);
  };

  const handleLogout = async () => {
    await logoutOneDrive();
    setOneDrivePickerOpen(false);
  };

  const getFileIcon = (item: OneDriveItem) => {
    if (item.isDirectory) {
      return '📁';
    }
    const ext = item.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf': return '📕';
      case 'doc':
      case 'docx': return '📘';
      case 'xls':
      case 'xlsx': return '📗';
      case 'ppt':
      case 'pptx': return '📙';
      case 'txt':
      case 'md': return '📄';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif': return '🖼️';
      default: return '📄';
    }
  };

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Select OneDrive Folder</h2>
          <button className={styles.closeButton} onClick={handleClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.userInfo}>
          <span className={styles.userEmail}>
            {oneDriveStatus.userName || oneDriveStatus.userEmail}
          </span>
          <button className={styles.logoutButton} onClick={handleLogout}>
            Sign Out
          </button>
        </div>

        <div className={styles.breadcrumbs}>
          {breadcrumbs.map((crumb, index) => (
            <span key={crumb.id}>
              <button 
                className={styles.breadcrumbItem}
                onClick={() => handleBreadcrumbClick(index)}
              >
                {crumb.name}
              </button>
              {index < breadcrumbs.length - 1 && <span className={styles.breadcrumbSeparator}>/</span>}
            </span>
          ))}
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : items.length === 0 ? (
            <div className={styles.empty}>This folder is empty</div>
          ) : (
            <div className={styles.itemList}>
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`${styles.item} ${selectedFolder?.id === item.id ? styles.selected : ''} ${!item.isDirectory ? styles.file : ''}`}
                  onClick={() => handleItemClick(item)}
                  onDoubleClick={() => handleItemDoubleClick(item)}
                >
                  <span className={styles.itemIcon}>{getFileIcon(item)}</span>
                  <span className={styles.itemName}>{item.name}</span>
                  {item.isDirectory && (
                    <span className={styles.itemArrow}>›</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.selectedInfo}>
            {selectedFolder ? (
              <span>Selected: <strong>{selectedFolder.name}</strong></span>
            ) : (
              <span>Current: <strong>{breadcrumbs[breadcrumbs.length - 1].name}</strong></span>
            )}
          </div>
          <div className={styles.actions}>
            <button className={styles.cancelButton} onClick={handleClose}>
              Cancel
            </button>
            <button className={styles.selectButton} onClick={handleSelectFolder}>
              {selectedFolder ? `Open "${selectedFolder.name}"` : 'Open Current Folder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
