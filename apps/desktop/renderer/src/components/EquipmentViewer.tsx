/**
 * EquipmentViewer - Comprehensive case detail view
 * Shows logs, records, associated files, and analytics for a case
 */
import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import { 
  Equipment, 
  MaintenanceLog, 
  FailureEvent, 
  EquipmentAnalytics,
  FileEquipmentAssociation,
  WorkOrder,
} from '@drasill/shared';
import styles from './EquipmentViewer.module.css';

interface EquipmentViewerProps {
  equipmentId: string;
}

export function EquipmentViewer({ equipmentId }: EquipmentViewerProps) {
  const { equipment, showToast, openFile, setLogModalOpen, setEditingLog, refreshLogs, logsRefreshTrigger, setWorkOrderModalOpen, workOrdersRefreshTrigger, openWorkOrderViewer, setSelectedEquipment } = useAppStore();
  
  const [activeSection, setActiveSection] = useState<'overview' | 'logs' | 'files' | 'analytics' | 'workorders'>('overview');
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [failureEvents, setFailureEvents] = useState<FailureEvent[]>([]);
  const [analytics, setAnalytics] = useState<EquipmentAnalytics | null>(null);
  const [associatedFiles, setAssociatedFiles] = useState<FileEquipmentAssociation[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTaggingFile, setIsTaggingFile] = useState(false);

  const equipmentData = equipment.find(e => e.id === equipmentId);

  // Load all data for this equipment
  const loadData = useCallback(async () => {
    if (!equipmentId) return;
    
    setIsLoading(true);
    try {
      const [logsData, failuresData, analyticsData, filesData, workOrdersData] = await Promise.all([
        window.electronAPI.getMaintenanceLogsByEquipment(equipmentId),
        window.electronAPI.getFailureEvents(equipmentId),
        window.electronAPI.getEquipmentAnalytics(equipmentId),
        window.electronAPI.getFileAssociationsForEquipment(equipmentId),
        window.electronAPI.getWorkOrdersByEquipment(equipmentId),
      ]);
      
      setLogs(logsData);
      setFailureEvents(failuresData);
      setAnalytics(analyticsData[0] || null);
      setAssociatedFiles(filesData);
      setWorkOrders(workOrdersData);
    } catch (error) {
      console.error('Error loading equipment data:', error);
      showToast('error', 'Failed to load equipment data');
    } finally {
      setIsLoading(false);
    }
  }, [equipmentId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData, logsRefreshTrigger, workOrdersRefreshTrigger]);

  // Generate sample analytics data
  const handleGenerateSampleData = async () => {
    if (!confirm('Generate sample activity events and logs for testing analytics?\n\nThis will create:\n• 5 issue events\n• 8 activity logs')) {
      return;
    }
    
    try {
      const result = await window.electronAPI.generateSampleAnalyticsData(equipmentId);
      showToast('success', `Generated ${result.failuresCreated} issues and ${result.logsCreated} activity logs`);
      loadData(); // Refresh the data
      refreshLogs(); // Trigger refresh in other components
    } catch (error) {
      showToast('error', 'Failed to generate sample data');
    }
  };

  // Handle file upload and association
  const handleUploadFile = async () => {
    try {
      const { workspacePath } = useAppStore.getState();
      if (!workspacePath) {
        showToast('error', 'Please open a workspace first');
        return;
      }

      const result = await window.electronAPI.addFiles(workspacePath);
      if (result.added > 0) {
        showToast('success', `Added ${result.added} file(s)`);
        // Refresh to see new files
        loadData();
      }
    } catch (error) {
      showToast('error', 'Failed to upload file');
    }
  };

  // Tag an existing file to this case
  const handleTagFile = async () => {
    setIsTaggingFile(true);
    try {
      const { tree } = useAppStore.getState();
      // For now, show a simple prompt - in production you'd use a file picker modal
      const filePath = prompt('Enter the file path to associate with this case:');
      if (!filePath) {
        setIsTaggingFile(false);
        return;
      }

      // Check for duplicate - prevent same file being added twice to this case
      if (associatedFiles.some(f => f.filePath === filePath)) {
        showToast('error', 'This file is already associated with this case');
        setIsTaggingFile(false);
        return;
      }

      const fileName = filePath.split(/[\\/]/).pop() || filePath;
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      
      let fileType: FileEquipmentAssociation['fileType'] = 'other';
      if (ext === 'pdf') fileType = 'manual';
      else if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) fileType = 'image';
      else if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) fileType = 'document';

      await window.electronAPI.addFileAssociation({
        equipmentId,
        filePath,
        fileName,
        fileType,
        notes: null,
      });

      showToast('success', `File "${fileName}" associated with case`);
      loadData();
    } catch (error) {
      showToast('error', 'Failed to tag file');
    } finally {
      setIsTaggingFile(false);
    }
  };

  // Remove file association
  const handleRemoveFileAssociation = async (filePath: string, fileName: string) => {
    if (!confirm(`Remove "${fileName}" from this case?`)) return;
    
    try {
      await window.electronAPI.removeFileAssociation(equipmentId, filePath);
      showToast('success', 'File association removed');
      loadData();
    } catch (error) {
      showToast('error', 'Failed to remove file association');
    }
  };

  // Open associated file
  const handleOpenFile = (filePath: string, fileName: string) => {
    openFile(filePath, fileName);
  };

  // Add new log entry
  const handleAddLog = () => {
    setEditingLog(null);
    setLogModalOpen(true);
  };

  // Edit existing log
  const handleEditLog = (log: MaintenanceLog) => {
    setEditingLog(log);
    setLogModalOpen(true);
  };

  // Format date for display
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get status color
  const getStatusColor = (status: Equipment['status']) => {
    switch (status) {
      case 'operational': return '#4caf50';
      case 'maintenance': return '#ff9800';
      case 'down': return '#f44336';
      case 'retired': return '#9e9e9e';
      default: return '#666';
    }
  };

  // Get health score color
  const getHealthColor = (score: number) => {
    if (score >= 80) return '#4caf50';
    if (score >= 60) return '#ff9800';
    if (score >= 40) return '#ff5722';
    return '#f44336';
  };

  // Calculate health score from analytics
  const calculateHealthScore = (analytics: EquipmentAnalytics | null): number => {
    // If equipment is down, health is 0%
    if (equipmentData?.status === 'down') return 0;
    
    if (!analytics) return 100;
    
    let score = 100;
    
    // Deduct for failures
    score -= Math.min(analytics.totalFailures * 10, 40);
    
    // Factor in availability
    if (analytics.availability !== null) {
      score = (score * analytics.availability) / 100;
    }
    
    return Math.max(0, Math.round(score));
  };

  if (!equipmentData) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3>Case Not Found</h3>
          <p>The case with ID "{equipmentId}" could not be found.</p>
        </div>
      </div>
    );
  }

  const healthScore = calculateHealthScore(analytics);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.equipmentIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            </svg>
          </div>
          <div className={styles.headerInfo}>
            <h1 className={styles.title}>{equipmentData.name}</h1>
            <p className={styles.subtitle}>{equipmentData.make} {equipmentData.model}</p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <span 
            className={styles.statusBadge}
            style={{ backgroundColor: getStatusColor(equipmentData.status || 'operational') }}
          >
            {(equipmentData.status || 'operational').charAt(0).toUpperCase() + (equipmentData.status || 'operational').slice(1)}
          </span>
          <div className={styles.healthScore} style={{ borderColor: getHealthColor(healthScore) }}>
            <span className={styles.healthValue} style={{ color: getHealthColor(healthScore) }}>
              {healthScore}%
            </span>
            <span className={styles.healthLabel}>Health</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${activeSection === 'overview' ? styles.active : ''}`}
          onClick={() => setActiveSection('overview')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          Overview
        </button>
        <button 
          className={`${styles.tab} ${activeSection === 'logs' ? styles.active : ''}`}
          onClick={() => setActiveSection('logs')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          Logs ({logs.length})
        </button>
        <button 
          className={`${styles.tab} ${activeSection === 'files' ? styles.active : ''}`}
          onClick={() => setActiveSection('files')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Files ({associatedFiles.length})
        </button>
        <button 
          className={`${styles.tab} ${activeSection === 'analytics' ? styles.active : ''}`}
          onClick={() => setActiveSection('analytics')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          Analytics
        </button>
        <button 
          className={`${styles.tab} ${activeSection === 'workorders' ? styles.active : ''}`}
          onClick={() => setActiveSection('workorders')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          Tasks ({workOrders.filter(wo => wo.status !== 'completed' && wo.status !== 'cancelled').length})
        </button>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <p>Loading case data...</p>
          </div>
        ) : (
          <>
            {/* Overview Section */}
            {activeSection === 'overview' && (
              <div className={styles.overview}>
                <div className={styles.overviewGrid}>
                  {/* Case Details Card */}
                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Case Details</h3>
                    <div className={styles.detailsList}>
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Case Number</span>
                        <span className={styles.detailValue}>{equipmentData.serialNumber || 'N/A'}</span>
                      </div>
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Jurisdiction</span>
                        <span className={styles.detailValue}>{equipmentData.location || 'N/A'}</span>
                      </div>
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Filing Date</span>
                        <span className={styles.detailValue}>{formatDate(equipmentData.installDate)}</span>
                      </div>
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Hourly Rate</span>
                        <span className={styles.detailValue}>${(equipmentData.hourlyCost ?? 0).toFixed(2)}/hr</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Stats Card */}
                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Quick Stats</h3>
                    <div className={styles.statsGrid}>
                      <div className={styles.stat}>
                        <span className={styles.statValue}>{logs.length}</span>
                        <span className={styles.statLabel}>Activity Logs</span>
                      </div>
                      <div className={styles.stat}>
                        <span className={styles.statValue}>{failureEvents.length}</span>
                        <span className={styles.statLabel}>Failures</span>
                      </div>
                      <div className={styles.stat}>
                        <span className={styles.statValue}>{associatedFiles.length}</span>
                        <span className={styles.statLabel}>Files</span>
                      </div>
                      <div className={styles.stat}>
                        <span className={styles.statValue}>
                          {analytics?.availability != null ? `${analytics.availability.toFixed(0)}%` : 'N/A'}
                        </span>
                        <span className={styles.statLabel}>Availability</span>
                      </div>
                    </div>
                  </div>

                  {/* Recent Activity Card */}
                  <div className={styles.card + ' ' + styles.cardWide}>
                    <h3 className={styles.cardTitle}>Recent Activity</h3>
                    {logs.length === 0 ? (
                      <p className={styles.emptyText}>No activity logs recorded</p>
                    ) : (
                      <div className={styles.activityList}>
                        {logs.slice(0, 5).map(log => (
                          <div key={log.id} className={styles.activityItem} onClick={() => handleEditLog(log)}>
                            <span className={`${styles.activityType} ${styles[log.type]}`}>
                              {log.type}
                            </span>
                            <span className={styles.activityDate}>{formatDateTime(log.startedAt)}</span>
                            <span className={styles.activityNote}>{log.notes || 'No notes'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Logs Section */}
            {activeSection === 'logs' && (
              <div className={styles.logsSection}>
                <div className={styles.sectionHeader}>
                  <h3>Activity Logs</h3>
                  <button className={styles.addButton} onClick={handleAddLog}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Log
                  </button>
                </div>
                {logs.length === 0 ? (
                  <div className={styles.emptyState}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <p>No activity logs yet</p>
                    <button className={styles.addButton} onClick={handleAddLog}>Add First Log</button>
                  </div>
                ) : (
                  <div className={styles.logsTable}>
                    <div className={styles.tableHeader}>
                      <span>Date</span>
                      <span>Type</span>
                      <span>Attorney</span>
                      <span>Duration</span>
                      <span>Notes</span>
                    </div>
                    {logs.map(log => (
                      <div key={log.id} className={styles.tableRow} onClick={() => handleEditLog(log)}>
                        <span>{formatDateTime(log.startedAt)}</span>
                        <span className={`${styles.logType} ${styles[log.type]}`}>{log.type}</span>
                        <span>{log.technician || 'Unknown'}</span>
                        <span>{log.durationMinutes ? `${log.durationMinutes} min` : 'N/A'}</span>
                        <span className={styles.logNotes}>{log.notes || 'No notes'}</span>
                      </div>
                    ))}
                  </div>
                )}

                {failureEvents.length > 0 && (
                  <>
                    <h3 className={styles.subSectionTitle}>Case Issues</h3>
                    <div className={styles.logsTable}>
                      <div className={styles.tableHeader}>
                        <span>Occurred</span>
                        <span>Resolved</span>
                        <span>Root Cause</span>
                      </div>
                      {failureEvents.map(event => (
                        <div key={event.id} className={styles.tableRow + ' ' + styles.failureRow}>
                          <span>{formatDateTime(event.occurredAt)}</span>
                          <span>{event.resolvedAt ? formatDateTime(event.resolvedAt) : 'Unresolved'}</span>
                          <span>{event.rootCause || 'Unknown'}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Files Section */}
            {activeSection === 'files' && (
              <div className={styles.filesSection}>
                <div className={styles.sectionHeader}>
                  <h3>Associated Files</h3>
                  <div className={styles.fileActions}>
                    <button className={styles.secondaryButton} onClick={handleTagFile} disabled={isTaggingFile}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                        <line x1="7" y1="7" x2="7.01" y2="7" />
                      </svg>
                      Tag Existing File
                    </button>
                    <button className={styles.addButton} onClick={handleUploadFile}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      Upload File
                    </button>
                  </div>
                </div>
                {associatedFiles.length === 0 ? (
                  <div className={styles.emptyState}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <p>No files associated with this equipment</p>
                    <p className={styles.emptyHint}>Upload manuals, images, or documents</p>
                  </div>
                ) : (
                  <div className={styles.filesGrid}>
                    {associatedFiles.map(file => (
                      <div key={file.id} className={styles.fileCard}>
                        <div className={styles.fileIcon}>
                          {file.fileType === 'manual' && (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f44336" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                          )}
                          {file.fileType === 'image' && (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          )}
                          {file.fileType === 'document' && (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2196f3" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                            </svg>
                          )}
                          {(file.fileType === 'other' || file.fileType === 'schematic') && (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9e9e9e" strokeWidth="2">
                              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                              <polyline points="13 2 13 9 20 9" />
                            </svg>
                          )}
                        </div>
                        <div className={styles.fileInfo}>
                          <span className={styles.fileName}>{file.fileName}</span>
                          <span className={styles.fileType}>{file.fileType}</span>
                        </div>
                        <div className={styles.fileCardActions}>
                          <button 
                            className={styles.iconButton}
                            onClick={() => handleOpenFile(file.filePath, file.fileName)}
                            title="Open file"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </button>
                          <button 
                            className={styles.iconButton + ' ' + styles.danger}
                            onClick={() => handleRemoveFileAssociation(file.filePath, file.fileName)}
                            title="Remove association"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Analytics Section */}
            {activeSection === 'analytics' && (
              <div className={styles.analyticsSection}>
                {/* Generate Sample Data Button */}
                {(!analytics?.mtbf && !analytics?.mttr) && (
                  <div className={styles.sampleDataPrompt}>
                    <p>No analytics data available yet. Analytics are calculated from case events and activity logs.</p>
                    <button className={styles.generateButton} onClick={handleGenerateSampleData}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                      Generate Sample Data for Testing
                    </button>
                  </div>
                )}
                <div className={styles.analyticsGrid}>
                  {/* MTBF Card */}
                  <div className={styles.analyticsCard}>
                    <div className={styles.analyticsIcon}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                    <div className={styles.analyticsValue}>
                      {analytics?.mtbf != null ? `${analytics.mtbf.toFixed(1)} hrs` : 'N/A'}
                    </div>
                    <div className={styles.analyticsLabel}>Avg. Days Between Issues</div>
                    <div className={styles.analyticsHint}>
                      Higher is better - indicates stability
                    </div>
                  </div>

                  {/* MTTR Card */}
                  <div className={styles.analyticsCard}>
                    <div className={styles.analyticsIcon}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                      </svg>
                    </div>
                    <div className={styles.analyticsValue}>
                      {analytics?.mttr != null ? `${analytics.mttr.toFixed(1)} hrs` : 'N/A'}
                    </div>
                    <div className={styles.analyticsLabel}>Avg. Resolution Time</div>
                    <div className={styles.analyticsHint}>
                      Lower is better - indicates quick resolution
                    </div>
                  </div>

                  {/* Availability Card */}
                  <div className={styles.analyticsCard}>
                    <div className={styles.analyticsIcon}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </div>
                    <div className={styles.analyticsValue} style={{ color: getHealthColor(analytics?.availability || 0) }}>
                      {analytics?.availability != null ? `${analytics.availability.toFixed(1)}%` : 'N/A'}
                    </div>
                    <div className={styles.analyticsLabel}>Availability</div>
                    <div className={styles.analyticsHint}>
                      Case availability rate
                    </div>
                  </div>

                  {/* Total Issues Card */}
                  <div className={styles.analyticsCard}>
                    <div className={styles.analyticsIcon} style={{ color: '#f44336' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <div className={styles.analyticsValue}>
                      {analytics?.totalFailures ?? 0}
                    </div>
                    <div className={styles.analyticsLabel}>Total Issues</div>
                    <div className={styles.analyticsHint}>
                      Recorded case issues
                    </div>
                  </div>

                  {/* Last Activity Card */}
                  <div className={styles.analyticsCard + ' ' + styles.cardWide}>
                    <div className={styles.analyticsIcon}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <div className={styles.analyticsValue}>
                      {formatDate(analytics?.lastMaintenanceDate)}
                    </div>
                    <div className={styles.analyticsLabel}>Last Activity</div>
                    <div className={styles.analyticsHint}>
                      Type: {analytics?.lastMaintenanceType || 'N/A'}
                    </div>
                  </div>

                  {/* Predicted Next Activity Card */}
                  <div className={styles.analyticsCard + ' ' + styles.cardWide}>
                    <div className={styles.analyticsIcon} style={{ color: '#ff9800' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4l3 3" />
                      </svg>
                    </div>
                    <div className={styles.analyticsValue}>
                      {formatDate(analytics?.predictedNextMaintenance)}
                    </div>
                    <div className={styles.analyticsLabel}>Predicted Next Review</div>
                    <div className={styles.analyticsHint}>
                      Based on historical patterns
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tasks Section */}
            {activeSection === 'workorders' && (
              <div className={styles.workOrdersSection}>
                <div className={styles.sectionHeader}>
                  <h3>Tasks</h3>
                  <button 
                    className={styles.addButton}
                    onClick={() => {
                      setSelectedEquipment(equipmentId);
                      setWorkOrderModalOpen(true);
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    New Task
                  </button>
                </div>

                {workOrders.length === 0 ? (
                  <div className={styles.emptyState}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 11l3 3L22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                    <p>No tasks for this case</p>
                    <button 
                      className={styles.createFirstButton}
                      onClick={() => {
                        setSelectedEquipment(equipmentId);
                        setWorkOrderModalOpen(true);
                      }}
                    >
                      Create First Task
                    </button>
                  </div>
                ) : (
                  <div className={styles.workOrdersList}>
                    {workOrders.map(wo => (
                      <div 
                        key={wo.id} 
                        className={styles.workOrderCard}
                        onClick={() => wo.id && openWorkOrderViewer(wo.id)}
                      >
                        <div className={styles.woHeader}>
                          <span className={styles.woNumber}>{wo.workOrderNumber}</span>
                          <span className={`${styles.woStatus} ${styles[wo.status]}`}>
                            {wo.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className={styles.woTitle}>{wo.title}</div>
                        <div className={styles.woMeta}>
                          <span className={`${styles.woType} ${styles[wo.type]}`}>{wo.type}</span>
                          <span className={`${styles.woPriority} ${styles[wo.priority]}`}>{wo.priority}</span>
                          {wo.scheduledStart && (
                            <span className={styles.woDate}>
                              {formatDate(wo.scheduledStart)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
