import { useState, useRef, useEffect } from 'react';
import { TreeNode } from '@drasill/shared';
import { useAppStore } from '../store';
import styles from './TreeItem.module.css';

interface TreeItemProps {
  node: TreeNode;
  depth: number;
}

export function TreeItem({ node, depth }: TreeItemProps) {
  const { 
    toggleDirectory, 
    openFile, 
    activeTabId, 
    deleteFile, 
    deleteFolder,
    createFile,
    createFolder,
    renameItem,
    workspacePath,
    toggleOneDriveDirectory,
    openOneDriveFile,
  } = useAppStore();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isCreating, setIsCreating] = useState<'file' | 'folder' | null>(null);
  const [inputValue, setInputValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu]);

  // Focus input when renaming or creating
  useEffect(() => {
    if ((isRenaming || isCreating) && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming, isCreating]);

  const handleClick = () => {
    // Handle OneDrive items
    if (node.source === 'onedrive') {
      if (node.isDirectory) {
        toggleOneDriveDirectory(node);
      } else {
        openOneDriveFile(node);
      }
      return;
    }
    
    // Handle local items
    if (node.isDirectory) {
      toggleDirectory(node);
    } else {
      openFile(node.path, node.name);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Don't allow context menu for OneDrive files (read-only for now)
    if (node.source === 'onedrive') return;
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleDelete = async () => {
    setContextMenu(null);
    if (node.isDirectory) {
      await deleteFolder(node.path);
    } else {
      await deleteFile(node.path);
    }
  };

  const handleStartRename = () => {
    setContextMenu(null);
    setInputValue(node.name);
    setIsRenaming(true);
  };

  const handleStartCreateFile = () => {
    setContextMenu(null);
    setInputValue('');
    setIsCreating('file');
    // Expand the directory to show the new item
    if (!node.isExpanded) {
      toggleDirectory(node);
    }
  };

  const handleStartCreateFolder = () => {
    setContextMenu(null);
    setInputValue('');
    setIsCreating('folder');
    // Expand the directory to show the new item
    if (!node.isExpanded) {
      toggleDirectory(node);
    }
  };

  const handleInputKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsRenaming(false);
      setIsCreating(null);
      setInputValue('');
      return;
    }

    if (e.key === 'Enter' && inputValue.trim()) {
      if (isRenaming) {
        await renameItem(node.path, inputValue.trim());
        setIsRenaming(false);
      } else if (isCreating === 'file') {
        await createFile(node.path, inputValue.trim());
        setIsCreating(null);
      } else if (isCreating === 'folder') {
        await createFolder(node.path, inputValue.trim());
        setIsCreating(null);
      }
      setInputValue('');
    }
  };

  const handleInputBlur = () => {
    setIsRenaming(false);
    setIsCreating(null);
    setInputValue('');
  };

  const isActive = activeTabId === node.id || activeTabId === node.path;
  const paddingLeft = 8 + depth * 16;
  const isRootWorkspace = node.path === workspacePath || node.id === node.path;

  return (
    <>
      <div
        className={`${styles.item} ${isActive ? styles.active : ''}`}
        style={{ paddingLeft }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        role="treeitem"
        aria-expanded={node.isDirectory ? node.isExpanded : undefined}
      >
        {node.isDirectory ? (
          <span className={`${styles.chevron} ${node.isExpanded ? styles.expanded : ''}`}>
            ▶
          </span>
        ) : (
          <span className={styles.spacer} />
        )}
        
        <span className={styles.icon}>
          {node.isDirectory ? (node.isExpanded ? '📂' : '📁') : getFileIcon(node.extension)}
        </span>
        
        {isRenaming ? (
          <input
            ref={inputRef}
            className={styles.renameInput}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputBlur}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={styles.name}>{node.name}</span>
        )}
      </div>

      {contextMenu && node.source !== 'onedrive' && (
        <div 
          ref={menuRef}
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {node.isDirectory && (
            <>
              <button className={styles.contextMenuItem} onClick={handleStartCreateFile}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
                New File
              </button>
              <button className={styles.contextMenuItem} onClick={handleStartCreateFolder}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  <line x1="12" y1="11" x2="12" y2="17" />
                  <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
                New Folder
              </button>
              <div className={styles.contextMenuDivider} />
            </>
          )}
          {!isRootWorkspace && (
            <>
              <button className={styles.contextMenuItem} onClick={handleStartRename}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
                Rename
              </button>
              <button className={styles.contextMenuItem} onClick={handleDelete}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {node.isDirectory && node.isExpanded && (
        <div className={styles.children}>
          {/* Show input for creating new items */}
          {isCreating && (
            <div className={styles.item} style={{ paddingLeft: paddingLeft + 16 }}>
              <span className={styles.spacer} />
              <span className={styles.icon}>
                {isCreating === 'folder' ? '📁' : '📄'}
              </span>
              <input
                ref={inputRef}
                className={styles.renameInput}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                onBlur={handleInputBlur}
                placeholder={isCreating === 'folder' ? 'folder name' : 'file name'}
              />
            </div>
          )}
          {node.children?.map((child) => (
            <TreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </>
  );
}

function getFileIcon(extension?: string): string {
  if (!extension) return '📄';
  
  const ext = extension.toLowerCase();
  
  const icons: Record<string, string> = {
    '.ts': '🔷',
    '.tsx': '⚛️',
    '.js': '🟨',
    '.jsx': '⚛️',
    '.json': '📋',
    '.md': '📝',
    '.markdown': '📝',
    '.html': '🌐',
    '.css': '🎨',
    '.scss': '🎨',
    '.py': '🐍',
    '.pdf': '📕',
    '.txt': '📄',
    '.yaml': '⚙️',
    '.yml': '⚙️',
    '.xml': '📰',
    '.sql': '🗃️',
  };
  
  return icons[ext] || '📄';
}
