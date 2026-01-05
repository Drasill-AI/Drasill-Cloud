import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import styles from './TopBar.module.css';

export function TopBar() {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { 
    equipment, 
    selectedEquipmentId, 
    setSelectedEquipment,
    detectedEquipment,
    setEquipmentModalOpen,
    loadEquipment,
    showToast,
    openEquipmentViewer,
  } = useAppStore();

  // Handle equipment deletion
  const handleDeleteEquipment = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent selecting the equipment
    
    if (!confirm('Delete this case? This will also delete all associated activity logs.')) {
      return;
    }
    
    setDeletingId(id);
    try {
      const success = await window.electronAPI.deleteEquipment(id);
      if (success) {
        showToast('success', 'Case deleted');
        if (selectedEquipmentId === id) {
          setSelectedEquipment(null);
        }
        loadEquipment();
      } else {
        showToast('error', 'Failed to delete case');
      }
    } catch (err) {
      showToast('error', 'Failed to delete case');
    } finally {
      setDeletingId(null);
    }
  };

  const selectedEquipment = equipment.find(eq => eq.id === selectedEquipmentId);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get equipment health status based on actual status
  const getEquipmentHealth = (id: string | undefined) => {
    if (!id) return 'healthy';
    
    // Find the equipment and check its status
    const eq = equipment.find(e => e.id === id);
    if (eq?.status === 'down') return 'critical';
    if (eq?.status === 'maintenance') return 'warning';
    
    // Default to healthy for operational equipment
    return 'healthy';
  };

  return (
    <div className={styles.topBar}>
      <div className={styles.leftSection}>
        <span className={styles.label}>Case</span>
        
        <div className={styles.equipmentDropdown} ref={dropdownRef}>
          <button 
            className={styles.dropdownTrigger}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <svg className={styles.equipmentIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            <span>
              {selectedEquipment 
                ? `${selectedEquipment.make} ${selectedEquipment.model}`
                : 'Select Case'
              }
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {isDropdownOpen && (
            <div className={styles.dropdownMenu}>
              <div className={styles.dropdownHeader}>
                <span className={styles.dropdownTitle}>Case List</span>
                <div className={styles.headerButtons}>
                  <button 
                    className={styles.csvButton}
                    onClick={async () => {
                      setIsImporting(true);
                      try {
                        const result = await window.electronAPI.importEquipmentCSV();
                        if (result.success) {
                          showToast('success', `Imported ${result.imported} case(s)${result.skipped > 0 ? `, ${result.skipped} skipped` : ''}`);
                          loadEquipment();
                        } else if (result.errors.length > 0) {
                          showToast('error', result.errors[0].message);
                        }
                      } catch (err) {
                        showToast('error', 'Failed to import CSV');
                      } finally {
                        setIsImporting(false);
                      }
                    }}
                    disabled={isImporting}
                    title="Import cases from CSV"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    {isImporting ? 'Importing...' : 'Import CSV'}
                  </button>
                  <button 
                    className={styles.csvButton}
                    onClick={async () => {
                      setIsExporting(true);
                      try {
                        const result = await window.electronAPI.exportEquipmentCSV();
                        if (result.success) {
                          showToast('success', 'Cases exported successfully');
                        } else if (result.error) {
                          showToast('error', result.error);
                        }
                      } catch (err) {
                        showToast('error', 'Failed to export CSV');
                      } finally {
                        setIsExporting(false);
                      }
                    }}
                    disabled={isExporting || equipment.length === 0}
                    title="Export cases to CSV"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {isExporting ? 'Exporting...' : 'Export CSV'}
                  </button>
                  <button 
                    className={styles.addEquipmentButton}
                    onClick={() => {
                      setEquipmentModalOpen(true);
                      setIsDropdownOpen(false);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add New
                  </button>
                </div>
              </div>

              <div className={styles.dropdownList}>
                {equipment.length === 0 ? (
                  <div className={styles.emptyState}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                    <p>No cases registered</p>
                    <button 
                      className={styles.manageButton}
                      onClick={() => {
                        setEquipmentModalOpen(true);
                        setIsDropdownOpen(false);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Add Case
                    </button>
                  </div>
                ) : (
                  equipment.map(eq => (
                    <div
                      key={eq.id}
                      className={`${styles.equipmentItem} ${selectedEquipmentId === eq.id ? styles.selected : ''}`}
                    >
                      <button
                        className={styles.equipmentSelectButton}
                        onClick={() => {
                          openEquipmentViewer(eq.id!);
                          setSelectedEquipment(eq.id ?? null);
                          setIsDropdownOpen(false);
                        }}
                      >
                        <div className={`${styles.equipmentStatus} ${styles[getEquipmentHealth(eq.id)]}`} />
                        <div className={styles.equipmentDetails}>
                          <div className={styles.equipmentMakeModel}>
                            {eq.name || `${eq.make} ${eq.model}`}
                          </div>
                          {eq.serialNumber && (
                            <div className={styles.equipmentSerial}>Case #: {eq.serialNumber}</div>
                          )}
                        </div>
                        {detectedEquipment?.id === eq.id && (
                          <span className={styles.detectedBadge}>Detected</span>
                        )}
                      </button>
                      <button
                        className={styles.deleteEquipmentButton}
                        onClick={(e) => handleDeleteEquipment(e, eq.id!)}
                        disabled={deletingId === eq.id}
                        title="Delete case"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {detectedEquipment && detectedEquipment.id !== selectedEquipmentId && (
          <button
            className={styles.iconButton}
            onClick={() => setSelectedEquipment(detectedEquipment.id ?? null)}
            title={`Detected: ${detectedEquipment.make} ${detectedEquipment.model}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        )}
      </div>

      <div className={styles.rightSection}>
        <button
          className={styles.iconButton}
          onClick={() => setEquipmentModalOpen(true)}
          title="Manage Cases"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
