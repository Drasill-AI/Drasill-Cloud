import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import styles from './ConnectionStatus.module.css';

interface ConnectionStatusProps {
  inline?: boolean;
}

export function ConnectionStatus({ inline = false }: ConnectionStatusProps) {
  const { setOnlineStatus } = useAppStore();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isManualOffline, setIsManualOffline] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  // Effective online status (respects manual override)
  const effectiveOnline = isOnline && !isManualOffline;

  // Check actual connectivity
  const checkConnection = useCallback(async () => {
    try {
      // Use navigator.onLine as the primary check
      // Attempting to fetch external URLs from Electron renderer can cause issues
      const online = navigator.onLine;
      setIsOnline(online);
      setLastChecked(new Date());
    } catch {
      // Fallback to navigator.onLine
      setIsOnline(navigator.onLine);
      setLastChecked(new Date());
    }
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setLastChecked(new Date());
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setLastChecked(new Date());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    checkConnection();

    // Periodic check every 30 seconds
    const interval = setInterval(checkConnection, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [checkConnection]);

  // Notify store of status changes
  useEffect(() => {
    setOnlineStatus(effectiveOnline);
  }, [effectiveOnline, setOnlineStatus]);

  const toggleManualOffline = () => {
    setIsManualOffline(prev => !prev);
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (isManualOffline) return 'Offline Mode';
    return 'Online';
  };

  const getStatusDescription = () => {
    if (!isOnline) return 'No internet connection. AI features unavailable.';
    if (isManualOffline) return 'Manually set to offline. AI features disabled.';
    return 'Connected. All features available.';
  };

  return (
    <div 
      className={`${styles.container} ${inline ? styles.inline : ''}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button 
        className={`${styles.statusButton} ${effectiveOnline ? styles.online : styles.offline} ${inline ? styles.inlineButton : ''}`}
        onClick={toggleManualOffline}
        title={getStatusText()}
      >
        <div className={styles.indicator}>
          <span className={`${styles.dot} ${effectiveOnline ? styles.dotOnline : styles.dotOffline}`} />
        </div>
        <span className={styles.label}>{getStatusText()}</span>
        {isOnline && (
          <svg className={styles.toggleIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {isManualOffline ? (
              <path d="M12 2v20M2 12h20" /> // Plus icon
            ) : (
              <path d="M18 6L6 18M6 6l12 12" /> // X icon
            )}
          </svg>
        )}
      </button>

      {showTooltip && (
        <div className={styles.tooltip}>
          <div className={styles.tooltipHeader}>
            <span className={`${styles.tooltipDot} ${effectiveOnline ? styles.dotOnline : styles.dotOffline}`} />
            <strong>{getStatusText()}</strong>
          </div>
          <p className={styles.tooltipDescription}>{getStatusDescription()}</p>
          <div className={styles.tooltipInfo}>
            <span>Last checked: {lastChecked.toLocaleTimeString()}</span>
          </div>
          {isOnline && (
            <button className={styles.tooltipAction} onClick={toggleManualOffline}>
              {isManualOffline ? 'Go Online' : 'Work Offline'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
