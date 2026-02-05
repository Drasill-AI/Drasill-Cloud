import { useState, useEffect } from 'react';
import styles from './UsageStats.module.css';

interface UsageData {
  stats: {
    aiMessagesThisMonth: number;
    aiMessagesToday: number;
    dealsCreatedThisMonth: number;
    documentsIndexedThisMonth: number;
  };
  limits: {
    aiMessagesPerMonth: number;
    dealsPerMonth: number;
    documentsPerMonth: number;
  };
  percentages: {
    aiMessages: number;
    deals: number;
    documents: number;
  };
}

export function UsageStats() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUsageData();
  }, []);

  const loadUsageData = async () => {
    try {
      const [stats, limits, percentages] = await Promise.all([
        window.electronAPI.getUsageStats(),
        window.electronAPI.getUsageLimits(),
        window.electronAPI.getUsagePercentages(),
      ]);
      setUsage({ stats, limits, percentages });
    } catch (error) {
      console.error('Failed to load usage data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getProgressBarColor = (percentage: number): string => {
    if (percentage >= 90) return '#ef4444'; // Red
    if (percentage >= 75) return '#f59e0b'; // Amber
    return '#22c55e'; // Green
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading usage data...</div>
      </div>
    );
  }

  if (!usage) {
    return null;
  }

  const { stats, limits, percentages } = usage;

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          <path d="M9 12h6" />
          <path d="M12 9v6" />
        </svg>
        Monthly Usage
      </h3>

      <div className={styles.metricsGrid}>
        {/* AI Messages */}
        <div className={styles.metric}>
          <div className={styles.metricHeader}>
            <span className={styles.metricIcon}>💬</span>
            <span className={styles.metricLabel}>AI Messages</span>
          </div>
          <div className={styles.progressContainer}>
            <div 
              className={styles.progressBar}
              style={{ 
                width: `${percentages.aiMessages}%`,
                backgroundColor: getProgressBarColor(percentages.aiMessages)
              }}
            />
          </div>
          <div className={styles.metricValue}>
            {stats.aiMessagesThisMonth.toLocaleString()} / {limits.aiMessagesPerMonth.toLocaleString()}
            <span className={styles.metricSubtext}>
              ({stats.aiMessagesToday} today)
            </span>
          </div>
        </div>

        {/* Deals Created */}
        <div className={styles.metric}>
          <div className={styles.metricHeader}>
            <span className={styles.metricIcon}>📋</span>
            <span className={styles.metricLabel}>Deals Created</span>
          </div>
          <div className={styles.progressContainer}>
            <div 
              className={styles.progressBar}
              style={{ 
                width: `${percentages.deals}%`,
                backgroundColor: getProgressBarColor(percentages.deals)
              }}
            />
          </div>
          <div className={styles.metricValue}>
            {stats.dealsCreatedThisMonth} / {limits.dealsPerMonth}
          </div>
        </div>

        {/* Documents Indexed */}
        <div className={styles.metric}>
          <div className={styles.metricHeader}>
            <span className={styles.metricIcon}>📄</span>
            <span className={styles.metricLabel}>Documents Indexed</span>
          </div>
          <div className={styles.progressContainer}>
            <div 
              className={styles.progressBar}
              style={{ 
                width: `${percentages.documents}%`,
                backgroundColor: getProgressBarColor(percentages.documents)
              }}
            />
          </div>
          <div className={styles.metricValue}>
            {stats.documentsIndexedThisMonth} / {limits.documentsPerMonth}
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <span className={styles.resetInfo}>
          Resets on the 1st of each month
        </span>
        <button className={styles.refreshButton} onClick={loadUsageData} title="Refresh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>
    </div>
  );
}
