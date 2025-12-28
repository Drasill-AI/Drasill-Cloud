import { TreeNode } from '@drasill/shared';
import { useAppStore } from '../store';
import styles from './TreeItem.module.css';

interface TreeItemProps {
  node: TreeNode;
  depth: number;
}

export function TreeItem({ node, depth }: TreeItemProps) {
  const { toggleDirectory, openFile, activeTabId, closeTab, refreshWorkspace, showToast } = useAppStore();

  const handleClick = () => {
    if (node.isDirectory) {
      toggleDirectory(node);
    } else {
      openFile(node.path, node.name);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    const itemType = node.isDirectory ? 'folder' : 'file';
    if (!confirm(`Delete this ${itemType}? This cannot be undone.\n\n${node.name}`)) {
      return;
    }
    
    try {
      const result = await window.electronAPI.deleteFile(node.path);
      if (result.success) {
        // Close the tab if it's open
        closeTab(node.path);
        // Refresh the file tree
        refreshWorkspace();
        showToast('success', `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} deleted`);
      } else {
        showToast('error', result.error || `Failed to delete ${itemType}`);
      }
    } catch (err) {
      showToast('error', `Failed to delete ${itemType}`);
    }
  };

  const isActive = activeTabId === node.path;
  const paddingLeft = 8 + depth * 16;

  return (
    <>
      <div
        className={`${styles.item} ${isActive ? styles.active : ''}`}
        style={{ paddingLeft }}
        onClick={handleClick}
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
        
        <span className={styles.name}>{node.name}</span>
        
        <button
          className={styles.deleteButton}
          onClick={handleDelete}
          title={`Delete ${node.isDirectory ? 'folder' : 'file'}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      {node.isDirectory && node.isExpanded && node.children && (
        <div className={styles.children}>
          {node.children.map((child) => (
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
