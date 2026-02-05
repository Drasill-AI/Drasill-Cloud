import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../store';
import { DealActivity, PipelineAnalytics } from '@drasill/shared';
import styles from './BottomPanel.module.css';

interface BottomPanelProps {
  height: number;
  onHeightChange: (height: number) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  note: 'Note',
  call: 'Call',
  email: 'Email',
  document: 'Document',
  meeting: 'Meeting',
};

export function BottomPanel({ height, onHeightChange, isOpen, onToggle }: BottomPanelProps) {
  const [activeTab, setActiveTab] = useState<'activities' | 'pipeline'>('activities');
  const [selectedDealId, setSelectedDealId] = useState<string | 'all'>('all');
  const [activities, setActivities] = useState<DealActivity[]>([]);
  const [analytics, setAnalytics] = useState<PipelineAnalytics | null>(null);
  const { exportDealToPdf, exportPipelineToPdf } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [dealSearchQuery, setDealSearchQuery] = useState('');
  
  const { deals, showToast, setActivityModalOpen, setEditingActivity, activitiesRefreshTrigger, loadDeals } = useAppStore();

  // Filter and sort deals - pinned first, then by search query
  const filteredDeals = deals
    .filter(deal => {
      if (!dealSearchQuery.trim()) return true;
      const query = dealSearchQuery.toLowerCase();
      return (
        deal.borrowerName.toLowerCase().includes(query) ||
        deal.dealNumber?.toLowerCase().includes(query) ||
        deal.stage.toLowerCase().includes(query) ||
        deal.assignedTo?.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      // Pinned deals first
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      // Then by borrower name
      return a.borrowerName.localeCompare(b.borrowerName);
    });

  // Toggle pin status for a deal
  const handleTogglePin = async (dealId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const deal = deals.find(d => d.id === dealId);
    if (!deal) return;
    
    try {
      await window.electronAPI.updateDeal(dealId, { isPinned: !deal.isPinned });
      loadDeals();
      showToast('success', deal.isPinned ? 'Deal unpinned' : 'Deal pinned');
    } catch (error) {
      showToast('error', 'Failed to update deal');
    }
  };

  // Quick stage change handler
  const handleQuickStageChange = async (dealId: string, newStage: string) => {
    const deal = deals.find(d => d.id === dealId);
    if (!deal || deal.stage === newStage) return;
    
    try {
      await window.electronAPI.updateDeal(dealId, { stage: newStage });
      loadDeals();
      showToast('success', `Stage changed to "${newStage}"`);
    } catch (error) {
      showToast('error', 'Failed to update stage');
    }
  };

  // Deal stages for quick change
  const DEAL_STAGES = [
    'Application',
    'Document Collection',
    'Underwriting',
    'Credit Review',
    'Approval',
    'Documentation',
    'Funding',
    'Closed',
    'On Hold',
    'Declined'
  ];

  // Load data when panel opens or deal selection changes
  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, selectedDealId, activeTab, activitiesRefreshTrigger]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'activities') {
        const activitiesData = selectedDealId === 'all'
          ? await window.electronAPI.getDealActivities(undefined, 100)
          : await window.electronAPI.getDealActivities(selectedDealId, 100);
        setActivities(activitiesData);
      } else {
        const analyticsData = await window.electronAPI.getPipelineAnalytics();
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

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleImportCSV = async () => {
    setIsImporting(true);
    try {
      const result = await window.electronAPI.importDealsFromCSV();
      if (result.imported > 0) {
        showToast('success', `Successfully imported ${result.imported} deal${result.imported > 1 ? 's' : ''}`);
        loadDeals();
        loadData();
      } else if (result.errors.length > 0) {
        showToast('error', result.errors[0]);
      }
      // Log any errors to console for debugging
      if (result.errors.length > 0) {
        console.warn('CSV Import errors:', result.errors);
      }
    } catch (error) {
      showToast('error', 'Failed to import CSV file');
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const result = await window.electronAPI.exportDealsToCSV();
      if (result.exported > 0 && result.filePath) {
        showToast('success', `Exported ${result.exported} deal${result.exported > 1 ? 's' : ''} to CSV`);
      } else if (result.exported === 0) {
        showToast('error', 'No deals to export');
      }
    } catch (error) {
      showToast('error', 'Failed to export deals to CSV');
    }
  };

  const handleExportActivitiesMarkdown = async () => {
    if (selectedDealId === 'all') {
      showToast('error', 'Please select a specific deal to export');
      return;
    }

    try {
      const markdown = await window.electronAPI.exportActivitiesMarkdown(selectedDealId);
      
      // Copy to clipboard and offer save
      await navigator.clipboard.writeText(markdown);
      showToast('success', 'Markdown copied to clipboard!');
      
      // Also log to console for easy access
      console.log('Exported Markdown:\n', markdown);
    } catch (error) {
      showToast('error', 'Failed to export activities');
    }
  };

  const getDealName = (dealId: string) => {
    const deal = deals.find(d => d.id === dealId);
    return deal ? deal.borrowerName : `Deal #${dealId}`;
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStageColor = (stage: string): string => {
    const colors: Record<string, string> = {
      lead: '#6b7280',
      application: '#3b82f6',
      underwriting: '#f59e0b',
      approved: '#10b981',
      funded: '#8b5cf6',
      closed: '#6b7280',
      declined: '#ef4444',
    };
    return colors[stage] || '#6b7280';
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
            className={`${styles.tab} ${activeTab === 'activities' ? styles.active : ''}`}
            onClick={() => setActiveTab('activities')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Activities
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'pipeline' ? styles.active : ''}`}
            onClick={() => setActiveTab('pipeline')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            Pipeline
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
          {activeTab === 'activities' ? (
            <div className={styles.logsView}>
              <div className={styles.logsToolbar}>
                <div className={styles.dealSelector}>
                  <input
                    type="text"
                    className={styles.dealSearchInput}
                    placeholder="Search deals..."
                    value={dealSearchQuery}
                    onChange={(e) => setDealSearchQuery(e.target.value)}
                  />
                  <select 
                    className={styles.equipmentSelect}
                    value={selectedDealId}
                    onChange={(e) => setSelectedDealId(e.target.value === 'all' ? 'all' : e.target.value)}
                  >
                    <option value="all">All Deals ({deals.length})</option>
                    {filteredDeals.map(deal => (
                      <option key={deal.id} value={deal.id}>
                        {deal.isPinned ? '📌 ' : ''}{deal.borrowerName} - {formatCurrency(deal.loanAmount)}
                      </option>
                    ))}
                  </select>
                  {selectedDealId !== 'all' && (
                    <button
                      className={styles.pinButton}
                      onClick={(e) => handleTogglePin(selectedDealId, e)}
                      title={deals.find(d => d.id === selectedDealId)?.isPinned ? 'Unpin deal' : 'Pin deal'}
                    >
                      {deals.find(d => d.id === selectedDealId)?.isPinned ? '📌' : '📍'}
                    </button>
                  )}
                  {selectedDealId !== 'all' && (
                    <select
                      className={styles.stageSelect}
                      value={deals.find(d => d.id === selectedDealId)?.stage || ''}
                      onChange={(e) => handleQuickStageChange(selectedDealId, e.target.value)}
                      title="Quick stage change"
                    >
                      {DEAL_STAGES.map(stage => (
                        <option key={stage} value={stage}>{stage}</option>
                      ))}
                    </select>
                  )}
                </div>
                <button 
                  className={styles.addButton}
                  onClick={() => setActivityModalOpen(true)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add Activity
                </button>
                {selectedDealId !== 'all' && (
                  <button 
                    className={styles.exportButton}
                    onClick={handleExportActivitiesMarkdown}
                    title="Export activities with citations as Markdown"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Export MD
                  </button>
                )}
                {selectedDealId !== 'all' && (
                  <button 
                    className={styles.exportButton}
                    onClick={() => exportDealToPdf(selectedDealId)}
                    title="Export deal report as PDF"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    Export PDF
                  </button>
                )}
              </div>

              <div className={styles.logsList}>
                {isLoading ? (
                  <div className={styles.emptyState}>
                    <p>Loading activities...</p>
                  </div>
                ) : activities.length === 0 ? (
                  <div className={styles.emptyState}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <p>No activities yet</p>
                    <p>Click "Add Activity" to log deal activities</p>
                  </div>
                ) : (
                  activities.map(activity => (
                    <div 
                      key={activity.id} 
                      className={styles.logEntry}
                      onClick={() => {
                        setEditingActivity(activity);
                        setActivityModalOpen(true);
                      }}
                      style={{ cursor: 'pointer' }}
                      title="Click to edit"
                    >
                      <span className={styles.logDate}>{formatDateTime(activity.performedAt)}</span>
                      <span className={`${styles.logType} ${styles[activity.type]}`}>
                        {ACTIVITY_TYPE_LABELS[activity.type] || activity.type}
                      </span>
                      <span className={styles.logDescription}>{activity.description || 'No description'}</span>
                      <span className={styles.logPerformedBy}>{activity.performedBy || '-'}</span>
                      <span className={styles.logEquipment}>{getDealName(activity.dealId)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className={styles.analyticsView}>
              <div className={styles.analyticsToolbar}>
                <button 
                  className={styles.addButton}
                  onClick={handleImportCSV}
                  disabled={isImporting}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  {isImporting ? 'Importing...' : 'Import CSV'}
                </button>
                <button 
                  className={styles.addButton}
                  onClick={handleExportCSV}
                  disabled={!analytics || analytics.totalDeals === 0}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export CSV
                </button>
                <button
                  className={styles.addButton}
                  onClick={exportPipelineToPdf}
                  disabled={!analytics || analytics.totalDeals === 0}
                  title="Export pipeline report as PDF"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  Export PDF
                </button>
              </div>
              <div className={styles.analyticsGrid}>
                {isLoading ? (
                  <div className={styles.emptyState}>
                    <p>Loading pipeline...</p>
                  </div>
                ) : !analytics ? (
                  <div className={styles.emptyState}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                    <p>No pipeline data available</p>
                    <p>Add deals to see pipeline metrics</p>
                  </div>
                ) : (
                  <>
                    {/* Summary Cards Row */}
                    <div className={styles.summaryCardsRow}>
                      <div className={styles.summaryCard}>
                        <div className={styles.summaryIcon}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                          </svg>
                        </div>
                        <div className={styles.summaryContent}>
                          <span className={styles.summaryValue}>{analytics.totalDeals}</span>
                          <span className={styles.summaryLabel}>Total Deals</span>
                        </div>
                      </div>
                      
                      <div className={styles.summaryCard}>
                        <div className={styles.summaryIcon} style={{ color: '#10b981' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="1" x2="12" y2="23" />
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          </svg>
                        </div>
                        <div className={styles.summaryContent}>
                          <span className={styles.summaryValue}>{formatCurrency(analytics.totalPipelineValue)}</span>
                          <span className={styles.summaryLabel}>Pipeline Value</span>
                        </div>
                      </div>
                      
                      <div className={styles.summaryCard}>
                        <div className={styles.summaryIcon} style={{ color: '#3b82f6' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                        </div>
                        <div className={styles.summaryContent}>
                          <span className={styles.summaryValue}>{analytics.recentActivityCount || 0}</span>
                          <span className={styles.summaryLabel}>Activities (7d)</span>
                        </div>
                      </div>
                      
                      <div className={styles.summaryCard}>
                        <div className={styles.summaryIcon} style={{ color: '#8b5cf6' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                        </div>
                        <div className={styles.summaryContent}>
                          <span className={styles.summaryValue}>{analytics.dealsAddedThisMonth || 0}</span>
                          <span className={styles.summaryLabel}>New This Month</span>
                        </div>
                      </div>
                    </div>

                    {/* Stage Distribution Bar Chart */}
                    {analytics.byStage && Object.keys(analytics.byStage).length > 0 && (
                      <div className={styles.metricCard}>
                        <div className={styles.metricHeader}>
                          <span className={styles.metricName}>Stage Distribution</span>
                        </div>
                        <div className={styles.stageBarChart}>
                          {Object.entries(analytics.byStage)
                            .filter(([_, data]) => (data as any).count > 0)
                            .map(([stage, data]) => {
                              const stageData = data as { count: number; totalValue: number };
                              const maxCount = Math.max(...Object.values(analytics.byStage).map((d: any) => d.count));
                              const percentage = maxCount > 0 ? (stageData.count / maxCount) * 100 : 0;
                              return (
                                <div key={stage} className={styles.stageBarItem}>
                                  <div className={styles.stageBarLabel}>
                                    <span className={styles.stageName}>{stage}</span>
                                    <span className={styles.stageCount}>{stageData.count}</span>
                                  </div>
                                  <div className={styles.stageBarTrack}>
                                    <div 
                                      className={styles.stageBarFill}
                                      style={{ 
                                        width: `${percentage}%`,
                                        backgroundColor: getStageColor(stage)
                                      }}
                                    />
                                  </div>
                                  <span className={styles.stageBarValue}>{formatCurrency(stageData.totalValue)}</span>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {/* Original Stage Breakdown Cards */}
                    <div className={styles.metricCard}>
                      <div className={styles.metricHeader}>
                        <span className={styles.metricName}>Average Deal Size</span>
                      </div>
                      <div className={styles.metricValues}>
                        <div className={styles.metricItem}>
                          <span className={`${styles.metricValue} ${styles.accent}`}>
                            {formatCurrency(analytics.averageDealSize)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
