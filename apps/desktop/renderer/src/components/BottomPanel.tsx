import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../store';
import { MaintenanceLog, EquipmentAnalytics } from '@drasill/shared';
import styles from './BottomPanel.module.css';

interface BottomPanelProps {
  height: number;
  onHeightChange: (height: number) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function BottomPanel({ height, onHeightChange, isOpen, onToggle }: BottomPanelProps) {
  const [activeTab, setActiveTab] = useState<'logs' | 'analytics'>('logs');
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | 'all'>('all');
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [analytics, setAnalytics] = useState<EquipmentAnalytics[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const { equipment, showToast, setLogModalOpen, setEditingLog, logsRefreshTrigger } = useAppStore();

  // Load data when panel opens or equipment selection changes
  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, selectedEquipmentId, activeTab, logsRefreshTrigger]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'logs') {
        const logsData = selectedEquipmentId === 'all'
          ? await window.electronAPI.getMaintenanceLogs(100)
          : await window.electronAPI.getMaintenanceLogsByEquipment(selectedEquipmentId, 100);
        setLogs(logsData);
      } else {
        const analyticsData = selectedEquipmentId === 'all'
          ? await window.electronAPI.getEquipmentAnalytics()
          : await window.electronAPI.getEquipmentAnalytics(selectedEquipmentId);
        setAnalytics(analyticsData);
      }
    } catch (error) {
      showToast('error', 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = height;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startY - e.clientY;
      const newHeight = Math.max(100, Math.min(500, startHeight + delta));
      onHeightChange(newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [height, onHeightChange]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getEquipmentName = (equipmentId: string) => {
    const eq = equipment.find(e => e.id === equipmentId);
    return eq ? (eq.name || `${eq.make} ${eq.model}`) : `Case #${equipmentId}`;
  };

  const getHealthClass = (score: number | undefined) => {
    if (score === undefined) return styles.good;
    if (score >= 80) return styles.good;
    if (score >= 50) return styles.warning;
    return styles.critical;
  };

  // Calculate health score from analytics data
  const getHealthScore = (item: EquipmentAnalytics): number => {
    // If equipment is down, health is 0%
    const eq = equipment.find(e => e.id === item.equipmentId);
    if (eq?.status === 'down') return 0;
    
    if (item.availability !== null) {
      return Math.round(item.availability);
    }
    // Default score based on failure count
    return Math.max(0, 100 - item.totalFailures * 10);
  };

  const formatHours = (hours: number | null) => {
    if (hours === null) return 'N/A';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${Math.round(hours / 24)}d`;
  };

  return (
    <div 
      className={`${styles.bottomPanelContainer} ${!isOpen ? styles.collapsed : ''}`}
      style={{ height: isOpen ? height : 32 }}
    >
      {/* Resize Handle */}
      {isOpen && (
        <div 
          className={styles.resizeHandleHorizontal}
          onMouseDown={handleDragStart}
        />
      )}

      {/* Header with Tabs */}
      <div className={styles.header}>
        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${activeTab === 'logs' ? styles.active : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Logs
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'analytics' ? styles.active : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            Analytics
          </button>
        </div>

        <div className={styles.headerActions}>
          <button 
            className={styles.iconButton}
            onClick={loadData}
            title="Refresh"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
          <button 
            className={styles.iconButton}
            onClick={onToggle}
            title={isOpen ? 'Collapse' : 'Expand'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isOpen ? (
                <polyline points="6 9 12 15 18 9" />
              ) : (
                <polyline points="18 15 12 9 6 15" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      {isOpen && (
        <div className={styles.content}>
          {activeTab === 'logs' ? (
            <div className={styles.logsView}>
              <div className={styles.logsToolbar}>
                <select 
                  className={styles.equipmentSelect}
                  value={selectedEquipmentId}
                  onChange={(e) => setSelectedEquipmentId(e.target.value === 'all' ? 'all' : e.target.value)}
                >
                  <option value="all">All Cases</option>
                  {equipment.map(eq => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name || `${eq.make} ${eq.model}`} {eq.serialNumber ? `(${eq.serialNumber})` : ''}
                    </option>
                  ))}
                </select>
                <button 
                  className={styles.addButton}
                  onClick={() => setLogModalOpen(true)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add Activity Log
                </button>
              </div>

              <div className={styles.logsList}>
                {isLoading ? (
                  <div className={styles.emptyState}>
                    <p>Loading logs...</p>
                  </div>
                ) : logs.length === 0 ? (
                  <div className={styles.emptyState}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <p>No activity logs yet</p>
                    <p>Click "Add Activity Log" to record case activities</p>
                  </div>
                ) : (
                  logs.map(log => (
                    <div 
                      key={log.id} 
                      className={styles.logEntry}
                      onClick={() => {
                        setEditingLog(log);
                        setLogModalOpen(true);
                      }}
                      style={{ cursor: 'pointer' }}
                      title="Click to edit"
                    >
                      <span className={styles.logDate}>{formatDate(log.startedAt)}</span>
                      <span className={`${styles.logType} ${styles[log.type]}`}>{log.type}</span>
                      <span className={styles.logDescription}>{log.notes || 'No notes'}</span>
                      <span className={styles.logPerformedBy}>{log.technician || 'Unknown'}</span>
                      <span className={styles.logEquipment}>{getEquipmentName(log.equipmentId)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className={styles.analyticsView}>
              <div className={styles.analyticsToolbar}>
                <select 
                  className={styles.equipmentSelect}
                  value={selectedEquipmentId}
                  onChange={(e) => setSelectedEquipmentId(e.target.value === 'all' ? 'all' : e.target.value)}
                >
                  <option value="all">All Cases</option>
                  {equipment.map(eq => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name || `${eq.make} ${eq.model}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.analyticsGrid}>
                {isLoading ? (
                  <div className={styles.emptyState}>
                    <p>Loading analytics...</p>
                  </div>
                ) : analytics.length === 0 ? (
                  <div className={styles.emptyState}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                    <p>No analytics data available</p>
                    <p>Add cases and activity logs to see metrics</p>
                  </div>
                ) : (
                  analytics.map(item => {
                    const healthScore = getHealthScore(item);
                    const equipmentName = getEquipmentName(item.equipmentId);
                    return (
                    <div key={item.equipmentId} className={styles.metricCard}>
                      <div className={styles.metricHeader}>
                        <span className={styles.metricName}>{equipmentName}</span>
                        <span className={`${styles.healthBadge} ${getHealthClass(healthScore)}`}>
                          {healthScore}% Health
                        </span>
                      </div>
                      <div className={styles.metricValues}>
                        <div className={styles.metricItem}>
                          <span className={styles.metricLabel}>MTBF</span>
                          <span className={styles.metricValue}>
                            {formatHours(item.mtbf)}
                            {item.mtbf && <span className={styles.metricUnit}>hrs</span>}
                          </span>
                        </div>
                        <div className={styles.metricItem}>
                          <span className={styles.metricLabel}>MTTR</span>
                          <span className={styles.metricValue}>
                            {formatHours(item.mttr)}
                            {item.mttr && <span className={styles.metricUnit}>hrs</span>}
                          </span>
                        </div>
                        <div className={styles.metricItem}>
                          <span className={styles.metricLabel}>Availability</span>
                          <span className={`${styles.metricValue} ${styles.accent}`}>
                            {item.availability?.toFixed(1) ?? 'N/A'}
                            {item.availability !== null && <span className={styles.metricUnit}>%</span>}
                          </span>
                        </div>
                        <div className={styles.metricItem}>
                          <span className={styles.metricLabel}>Failures</span>
                          <span className={styles.metricValue}>{item.totalFailures}</span>
                        </div>
                      </div>
                      {item.predictedNextMaintenance && (
                        <div className={styles.prediction}>
                          <span className={styles.predictionLabel}>Next Maintenance: </span>
                          <span className={styles.predictionValue}>
                            {formatDate(item.predictedNextMaintenance)}
                          </span>
                        </div>
                      )}
                    </div>
                  );})
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
