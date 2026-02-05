import { useState } from 'react';
import { useAppStore } from '../store';
import { TreeItem } from './TreeItem';
import { OneDrivePicker } from './OneDrivePicker';
import styles from './FileExplorer.module.css';

export function FileExplorer() {
  const { 
    workspacePath, 
    tree, 
    workspaceSource,
    openWorkspace, 
    closeWorkspace, 
    refreshTree, 
    showToast,
    oneDriveStatus,
    loginOneDrive,
    setOneDrivePickerOpen,
    isOneDrivePickerOpen,
    recentFiles,
    openFile,
    openOneDriveFile,
    clearRecentFiles,
  } = useAppStore();
  const [isAdding, setIsAdding] = useState(false);
  const [showRecentFiles, setShowRecentFiles] = useState(true);

  const handleAddFiles = async () => {
    if (!workspacePath || isAdding) return;
    
    setIsAdding(true);
    try {
      const result = await window.electronAPI.addFiles(workspacePath);
      if (result.added > 0) {
        showToast('success', `Added ${result.added} file${result.added > 1 ? 's' : ''} to workspace`);
        await refreshTree();
      } else if (result.cancelled) {
        // User cancelled, no toast needed
      } else {
        showToast('info', 'No files were added');
      }
    } catch (error) {
      showToast('error', `Failed to add files: ${error}`);
    } finally {
      setIsAdding(false);
    }
  };

  const handleOpenOneDrive = async () => {
    if (!oneDriveStatus.isAuthenticated) {
      await loginOneDrive();
      // Check status again after login
      const status = await window.electronAPI.getOneDriveAuthStatus();
      if (status.isAuthenticated) {
        setOneDrivePickerOpen(true);
      }
    } else {
      setOneDrivePickerOpen(true);
    }
  };

  const handleOpenRecentFile = async (file: typeof recentFiles[0]) => {
    if (file.source === 'onedrive' && file.oneDriveId) {
      // Open OneDrive file
      await openOneDriveFile({
        id: file.oneDriveId,
        name: file.name,
        path: file.path,
        isDirectory: false,
        source: 'onedrive',
        oneDriveId: file.oneDriveId,
      });
    } else {
      // Open local file
      await openFile(file.path, file.name);
    }
  };

  const formatRelativeTime = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const workspaceName = workspacePath?.split(/[\\/]/).pop() || 'Workspace';

  return (
    <div className={styles.explorer}>
      <div className={styles.header}>
        <span className={styles.title}>EXPLORER</span>
        {workspacePath && (
          <button 
            className={styles.closeWorkspaceButton}
            onClick={closeWorkspace}
            title="Close Workspace"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
      
      {workspacePath && (
        <div className={styles.workspaceHeader}>
          <span className={styles.workspaceName}>
            {workspaceSource === 'onedrive' && (
              <span className={styles.cloudIcon} title="OneDrive">☁️ </span>
            )}
            {workspaceName}
          </span>
        </div>
      )}
      
      <div className={styles.content}>
        {!workspacePath ? (
          <div className={styles.empty}>
            <p>No folder opened</p>
            <button className={styles.openButton} onClick={openWorkspace}>
              Open Local Folder
            </button>
            <button className={styles.oneDriveButton} onClick={handleOpenOneDrive}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M12.5 3c-2.9 0-5.4 1.9-6.3 4.5C3.4 8 1.5 10.1 1.5 12.5c0 2.8 2.3 5 5 5h10c2.8 0 5-2.3 5-5 0-2.5-1.8-4.5-4.2-4.9-.8-2.7-3.3-4.6-6.3-4.6h1.5z"/>
              </svg>
              {oneDriveStatus.isAuthenticated ? 'Open from OneDrive' : 'Connect OneDrive'}
            </button>
            {oneDriveStatus.isAuthenticated && (
              <p className={styles.connectedAs}>
                Connected as {oneDriveStatus.userName || oneDriveStatus.userEmail}
              </p>
            )}
            <p className={styles.hint}>
              Or use File → Open Workspace Folder
            </p>

            {/* Recent Files Section */}
            {recentFiles.length > 0 && (
              <div className={styles.recentFilesSection}>
                <div 
                  className={styles.recentFilesHeader}
                  onClick={() => setShowRecentFiles(!showRecentFiles)}
                >
                  <span className={styles.recentFilesToggle}>
                    {showRecentFiles ? '▼' : '▶'}
                  </span>
                  <span>Recent Files</span>
                  <button 
                    className={styles.clearRecentButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      clearRecentFiles();
                    }}
                    title="Clear recent files"
                  >
                    ✕
                  </button>
                </div>
                {showRecentFiles && (
                  <div className={styles.recentFilesList}>
                    {recentFiles.map((file, idx) => (
                      <button
                        key={`${file.path}-${idx}`}
                        className={styles.recentFileItem}
                        onClick={() => handleOpenRecentFile(file)}
                        title={`${file.path}\n${formatRelativeTime(file.timestamp)}`}
                      >
                        <span className={styles.recentFileIcon}>
                          {file.source === 'onedrive' ? '☁️' : '📄'}
                        </span>
                        <span className={styles.recentFileName}>{file.name}</span>
                        <span className={styles.recentFileTime}>
                          {formatRelativeTime(file.timestamp)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.tree}>
            {tree.map((node) => (
              <TreeItem key={node.id} node={node} depth={0} />
            ))}
          </div>
        )}
      </div>

      {workspacePath && workspaceSource === 'local' && (
        <div className={styles.footer}>
          <button 
            className={styles.addButton} 
            onClick={handleAddFiles}
            disabled={isAdding}
            title="Add PDF, Markdown, or Text files"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {isAdding ? 'Adding...' : 'Add Files'}
          </button>
        </div>
      )}

      {isOneDrivePickerOpen && <OneDrivePicker />}
    </div>
  );
}
