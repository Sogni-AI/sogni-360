/**
 * React hook for billing history data.
 *
 * Loads records from IndexedDB, subscribes to real-time changes,
 * and returns aggregated line items for display.
 */

import { useState, useEffect, useCallback } from 'react';
import type { BillingLineItem, BillingSummary } from '../types/billing';
import {
  subscribeToChanges,
  aggregateRecords,
  getAllBillingRecords,
  clearBillingHistory
} from '../services/billingHistoryService';

interface UseBillingHistoryResult {
  lineItems: BillingLineItem[];
  summary: BillingSummary;
  loading: boolean;
  allProjectNames: string[];
  clearHistory: () => Promise<void>;
  refresh: () => void;
}

const emptySummary: BillingSummary = { totalSpark: 0, totalSogni: 0, totalUSD: 0, recordCount: 0 };

export function useBillingHistory(filterProjectName?: string): UseBillingHistoryResult {
  const [lineItems, setLineItems] = useState<BillingLineItem[]>([]);
  const [summary, setSummary] = useState<BillingSummary>(emptySummary);
  const [allProjectNames, setAllProjectNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const allRecords = await getAllBillingRecords();

      // Extract unique project names from ALL records (unfiltered)
      const nameSet = new Set<string>();
      for (const r of allRecords) {
        if (r.projectName) nameSet.add(r.projectName);
      }
      setAllProjectNames([...nameSet].sort((a, b) => a.localeCompare(b)));

      // Apply project filter if set
      const records = filterProjectName
        ? allRecords.filter(r => r.projectName === filterProjectName)
        : allRecords;

      // Compute summary from filtered records
      let totalSpark = 0;
      let totalSogni = 0;
      let totalUSD = 0;
      for (const r of records) {
        if (r.tokenType === 'spark') totalSpark += r.costToken;
        else totalSogni += r.costToken;
        totalUSD += r.costUSD;
      }
      setSummary({ totalSpark, totalSogni, totalUSD, recordCount: records.length });

      // Aggregate filtered records for display
      setLineItems(aggregateRecords(records));
    } catch (err) {
      console.error('[useBillingHistory] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, [filterProjectName]);

  // Load on mount and when filter changes
  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Subscribe to changes
  useEffect(() => {
    return subscribeToChanges(() => {
      void loadData();
    });
  }, [loadData]);

  const handleClear = useCallback(async () => {
    await clearBillingHistory();
    setLineItems([]);
    setSummary(emptySummary);
    setAllProjectNames([]);
  }, []);

  return {
    lineItems,
    summary,
    loading,
    allProjectNames,
    clearHistory: handleClear,
    refresh: loadData
  };
}
