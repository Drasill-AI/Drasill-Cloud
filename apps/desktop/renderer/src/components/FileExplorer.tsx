import { useAppStore } from '../store';
import { TreeItem } from './TreeItem';
import styles from './FileExplorer.module.css';

export function FileExplorer() {
  const { workspacePath, tree, openWorkspace } = useAppStore();

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
    </div>
  );
}
