import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import styles from './TopBar.module.css';

export function TopBar() {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { 
    deals, 
    selectedDealId, 
    setSelectedDeal,
    detectedDeal,
    setDealModalOpen,
    setEditingDeal,
  } = useAppStore();

  const selectedDeal = deals?.find(d => d.id === selectedDealId);

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

  // Get deal stage color
  const getDealStageColor = (stage: string | undefined) => {
    if (!stage) return 'healthy';
    switch (stage) {
      case 'funded':
      case 'closed':
        return 'healthy';
      case 'approved':
      case 'underwriting':
        return 'warning';
      case 'declined':
        return 'critical';
      default:
        return 'healthy';
    }
  };

  return (
    <div className={styles.topBar}>
      <div className={styles.leftSection}>
        <span className={styles.label}>Deal</span>
        
        <div className={styles.equipmentDropdown} ref={dropdownRef}>
          <button 
            className={styles.dropdownTrigger}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <svg className={styles.equipmentIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span>
              {selectedDeal 
                ? `${selectedDeal.borrowerName} - ${selectedDeal.dealNumber}`
                : 'Select Deal'
              }
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {isDropdownOpen && (
            <div className={styles.dropdownMenu}>
              <div className={styles.dropdownHeader}>
                <span className={styles.dropdownTitle}>Deal List</span>
                <button 
                  className={styles.addEquipmentButton}
                  onClick={() => {
                    setDealModalOpen(true);
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
                {!deals || deals.length === 0 ? (
                  <div className={styles.emptyState}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <p>No deals registered</p>
                    <button 
                      className={styles.manageButton}
                      onClick={() => {
                        setDealModalOpen(true);
                        setIsDropdownOpen(false);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Add Deal
                    </button>
                  </div>
                ) : (
                  deals.map(deal => (
                    <div key={deal.id} className={styles.dealItemRow}>
                      <button
                        className={`${styles.equipmentItem} ${selectedDealId === deal.id ? styles.selected : ''}`}
                        onClick={() => {
                          setSelectedDeal(deal.id ?? null);
                          setIsDropdownOpen(false);
                        }}
                      >
                        <div className={`${styles.equipmentStatus} ${styles[getDealStageColor(deal.stage)]}`} />
                        <div className={styles.equipmentDetails}>
                          <div className={styles.equipmentMakeModel}>
                            {deal.borrowerName}
                          </div>
                          <div className={styles.equipmentSerial}>{deal.dealNumber} • {deal.stage}</div>
                        </div>
                        {detectedDeal?.id === deal.id && (
                          <span className={styles.detectedBadge}>Detected</span>
                        )}
                      </button>
                      <button
                        className={styles.editDealButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingDeal(deal);
                          setDealModalOpen(true);
                          setIsDropdownOpen(false);
                        }}
                        title="Edit deal"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {detectedDeal && detectedDeal.id !== selectedDealId && (
          <button
            className={styles.iconButton}
            onClick={() => setSelectedDeal(detectedDeal.id ?? null)}
            title={`Detected: ${detectedDeal.borrowerName}`}
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
          onClick={() => setDealModalOpen(true)}
          title="Manage Deals"
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
