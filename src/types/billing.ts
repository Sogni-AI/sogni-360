/**
 * Billing History Types
 *
 * Types for tracking estimated costs of completed generation jobs.
 * Since SDK completion events don't return actual cost data, we record
 * the estimated cost (same values shown in the UI pre-generation)
 * at the moment each job successfully completes.
 */

/** A single completed job's billing record */
export interface BillingRecord {
  id: string;
  timestamp: number;
  type: 'angle' | 'video' | 'enhance';
  tokenType: 'spark' | 'sogni';
  costToken: number;
  costUSD: number;
  projectName?: string;
  model?: string;
  quality?: string;
  resolution?: string;
  steps?: number;
  duration?: number;
  fps?: number;
  imageCount?: number;
}

/** Aggregated display item (groups same-type records within a time window) */
export interface BillingLineItem {
  id: string;
  type: 'angle' | 'video' | 'enhance';
  tokenType: 'spark' | 'sogni';
  totalCostToken: number;
  totalCostUSD: number;
  itemCount: number;
  timestamp: number;
  projectName?: string;
  quality?: string;
  resolution?: string;
  steps?: number;
  duration?: number;
  fps?: number;
}

/** Summary totals across all billing records */
export interface BillingSummary {
  totalSpark: number;
  totalSogni: number;
  totalUSD: number;
  recordCount: number;
}
