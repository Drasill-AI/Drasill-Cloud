import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import styles from './TopBar.module.css';

export function TopBar() {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { 
    equipment, 
    selectedEquipmentId, 
    setSelectedEquipment,
    detectedEquipment,
    setEquipmentModalOpen,
  } = useAppStore();

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

  // Mock health score for demo - in real app, this would come from analytics
  const getEquipmentHealth = (id: string | undefined) => {
    if (!id) return 'healthy';
    // Simple mock based on ID hash - replace with real analytics
    const hash = id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const score = 70 + (hash % 30);
    if (score >= 80) return 'healthy';
    if (score >= 50) return 'warning';
    return 'critical';
  };

  return (
    <div className={styles.topBar}>
      <div className={styles.leftSection}>
        <span className={styles.label}>Equipment</span>
        
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
                : 'Select Equipment'
              }
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {isDropdownOpen && (
            <div className={styles.dropdownMenu}>
              <div className={styles.dropdownHeader}>
                <span className={styles.dropdownTitle}>Equipment List</span>
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

              <div className={styles.dropdownList}>
                {equipment.length === 0 ? (
                  <div className={styles.emptyState}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                    <p>No equipment registered</p>
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
                      Add Equipment
                    </button>
                  </div>
                ) : (
                  equipment.map(eq => (
                    <button
                      key={eq.id}
                      className={`${styles.equipmentItem} ${selectedEquipmentId === eq.id ? styles.selected : ''}`}
                      onClick={() => {
                        setSelectedEquipment(eq.id ?? null);
                        setIsDropdownOpen(false);
                      }}
                    >
                      <div className={`${styles.equipmentStatus} ${styles[getEquipmentHealth(eq.id)]}`} />
                      <div className={styles.equipmentDetails}>
                        <div className={styles.equipmentMakeModel}>
                          {eq.make} {eq.model}
                        </div>
                        {eq.serialNumber && (
                          <div className={styles.equipmentSerial}>SN: {eq.serialNumber}</div>
                        )}
                      </div>
                      {detectedEquipment?.id === eq.id && (
                        <span className={styles.detectedBadge}>Detected</span>
                      )}
                    </button>
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
          title="Manage Equipment"
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
