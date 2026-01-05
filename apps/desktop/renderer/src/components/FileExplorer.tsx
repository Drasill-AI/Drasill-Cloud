import { useState } from 'react';
import { useAppStore } from '../store';
import { TreeItem } from './TreeItem';
import styles from './FileExplorer.module.css';

export function FileExplorer() {
  const { workspacePath, workspacePaths, tree, openWorkspace, addWorkspaceFolder, refreshTree, showToast } = useAppStore();
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingFolder, setIsAddingFolder] = useState(false);

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

  const handleAddFolder = async () => {
    if (isAddingFolder) return;
    
    setIsAddingFolder(true);
    try {
      await addWorkspaceFolder();
    } finally {
      setIsAddingFolder(false);
    }
  };

  return (
    <div className={styles.explorer}>
      <div className={styles.header}>
        <span className={styles.title}>EXPLORER</span>
      </div>
      
      <div className={styles.content}>
        {!workspacePath ? (
          <div className={styles.empty}>
            <p>No folder opened</p>
            <button className={styles.openButton} onClick={openWorkspace}>
              Open Folder
            </button>
            <p className={styles.hint}>
              Or use File → Open Workspace Folder
            </p>
          </div>
        ) : (
          <div className={styles.tree}>
            {tree.map((node) => (
              <TreeItem key={node.id} node={node} depth={0} />
            ))}
          </div>
        )}
      </div>

      {workspacePath && (
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
          <button 
            className={styles.addButton} 
            onClick={handleAddFolder}
            disabled={isAddingFolder}
            title="Add another folder to workspace"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
            {isAddingFolder ? 'Adding...' : 'Add Folder'}
          </button>
        </div>
      )}
    </div>
  );
}
