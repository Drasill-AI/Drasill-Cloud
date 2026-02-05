/**
 * Usage Tracking Module
 * Tracks AI messages, deals created, and documents indexed
 * Stores data locally in SQLite and can sync to Supabase
 */

import { getDatabase } from './database';

export interface UsageStats {
  aiMessagesThisMonth: number;
  aiMessagesToday: number;
  dealsCreatedThisMonth: number;
  documentsIndexedThisMonth: number;
  lastResetDate: string;
}

export interface UsageLimits {
  aiMessagesPerMonth: number;
  dealsPerMonth: number;
  documentsPerMonth: number;
}

// Default limits for $99/month plan
const DEFAULT_LIMITS: UsageLimits = {
  aiMessagesPerMonth: 1000,  // ~30-35 messages per day
  dealsPerMonth: 100,        // More than enough for solo/small team
  documentsPerMonth: 500,    // Good for active deal flow
};

/**
 * Initialize usage tracking table
 */
export function initUsageTracking(): void {
  const db = getDatabase();
  if (!db) return;
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_tracking (
      id INTEGER PRIMARY KEY,
      metric TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      period TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(metric, period)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * Get current month period string (YYYY-MM)
 */
function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get today's date string (YYYY-MM-DD)
 */
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Increment usage count for a metric
 */
export function incrementUsage(metric: 'ai_messages' | 'deals_created' | 'documents_indexed'): void {
  const db = getDatabase();
  if (!db) return;
  
  const period = getCurrentPeriod();
  
  // Use upsert pattern
  db.prepare(`
    INSERT INTO usage_tracking (metric, count, period, updated_at)
    VALUES (?, 1, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(metric, period) DO UPDATE SET
      count = count + 1,
      updated_at = CURRENT_TIMESTAMP
  `).run(metric, period);

  // Also track daily for AI messages
  if (metric === 'ai_messages') {
    const today = getToday();
    db.prepare(`
      INSERT INTO usage_tracking (metric, count, period, updated_at)
      VALUES ('ai_messages_daily', 1, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(metric, period) DO UPDATE SET
        count = count + 1,
        updated_at = CURRENT_TIMESTAMP
    `).run(today);
  }

  // Log event for detailed tracking
  db.prepare(`
    INSERT INTO usage_events (event_type, metadata)
    VALUES (?, ?)
  `).run(metric, JSON.stringify({ timestamp: new Date().toISOString() }));
}

/**
 * Get usage stats for current period
 */
export function getUsageStats(): UsageStats {
  const db = getDatabase();
  const currentPeriod = getCurrentPeriod();
  const today = getToday();
  
  const getCount = (metric: string, period: string): number => {
    if (!db) return 0;
    const result = db.prepare(`
      SELECT count FROM usage_tracking WHERE metric = ? AND period = ?
    `).get(metric, period) as { count: number } | undefined;
    return result?.count ?? 0;
  };

  return {
    aiMessagesThisMonth: getCount('ai_messages', currentPeriod),
    aiMessagesToday: getCount('ai_messages_daily', today),
    dealsCreatedThisMonth: getCount('deals_created', currentPeriod),
    documentsIndexedThisMonth: getCount('documents_indexed', currentPeriod),
    lastResetDate: currentPeriod,
  };
}

/**
 * Get usage limits based on subscription plan
 */
export function getUsageLimits(_plan?: string): UsageLimits {
  // For now, everyone gets the same limits
  // In the future, could check Supabase for plan-specific limits
  return DEFAULT_LIMITS;
}

/**
 * Check if user is within usage limits
 */
export function checkUsageLimits(): {
  withinLimits: boolean;
  warnings: string[];
  aiMessagesRemaining: number;
  dealsRemaining: number;
  documentsRemaining: number;
} {
  const stats = getUsageStats();
  const limits = getUsageLimits();
  
  const warnings: string[] = [];
  const aiMessagesRemaining = Math.max(0, limits.aiMessagesPerMonth - stats.aiMessagesThisMonth);
  const dealsRemaining = Math.max(0, limits.dealsPerMonth - stats.dealsCreatedThisMonth);
  const documentsRemaining = Math.max(0, limits.documentsPerMonth - stats.documentsIndexedThisMonth);

  // Warn at 80% usage
  if (stats.aiMessagesThisMonth >= limits.aiMessagesPerMonth * 0.8) {
    warnings.push(`You've used ${stats.aiMessagesThisMonth}/${limits.aiMessagesPerMonth} AI messages this month`);
  }
  if (stats.dealsCreatedThisMonth >= limits.dealsPerMonth * 0.8) {
    warnings.push(`You've created ${stats.dealsCreatedThisMonth}/${limits.dealsPerMonth} deals this month`);
  }
  if (stats.documentsIndexedThisMonth >= limits.documentsPerMonth * 0.8) {
    warnings.push(`You've indexed ${stats.documentsIndexedThisMonth}/${limits.documentsPerMonth} documents this month`);
  }

  const withinLimits = 
    stats.aiMessagesThisMonth < limits.aiMessagesPerMonth &&
    stats.dealsCreatedThisMonth < limits.dealsPerMonth &&
    stats.documentsIndexedThisMonth < limits.documentsPerMonth;

  return {
    withinLimits,
    warnings,
    aiMessagesRemaining,
    dealsRemaining,
    documentsRemaining,
  };
}

/**
 * Get usage percentage for display
 */
export function getUsagePercentages(): {
  aiMessages: number;
  deals: number;
  documents: number;
} {
  const stats = getUsageStats();
  const limits = getUsageLimits();
  
  return {
    aiMessages: Math.min(100, Math.round((stats.aiMessagesThisMonth / limits.aiMessagesPerMonth) * 100)),
    deals: Math.min(100, Math.round((stats.dealsCreatedThisMonth / limits.dealsPerMonth) * 100)),
    documents: Math.min(100, Math.round((stats.documentsIndexedThisMonth / limits.documentsPerMonth) * 100)),
  };
}
