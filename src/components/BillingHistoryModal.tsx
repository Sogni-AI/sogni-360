/**
 * Billing History Modal
 *
 * Shows a local tally of SOGNI/Spark spent and a chronological
 * list of charges aggregated into logical line items.
 */

import React, { useState, useCallback } from 'react';
import { LiquidGlassPanel } from './shared/LiquidGlassPanel';
import { useBillingHistory } from '../hooks/useBillingHistory';
import type { BillingLineItem } from '../types/billing';
import '../styles/components/BillingHistory.css';

interface BillingHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Format a timestamp into a readable date/time string */
function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  if (isToday) return `Today ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;

  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ` ${time}`;
}

/** Get the primary label for a line item */
function getLineLabel(item: BillingLineItem): string {
  const count = item.itemCount;
  switch (item.type) {
    case 'angle':
      return `${count} Angle Image${count !== 1 ? 's' : ''}`;
    case 'video':
      return `${count} Video Clip${count !== 1 ? 's' : ''}`;
    case 'enhance':
      return `${count} Enhancement${count !== 1 ? 's' : ''}`;
  }
}

/** Get the detail line for a line item */
function getLineDetail(item: BillingLineItem): string {
  const parts: string[] = [];
  switch (item.type) {
    case 'angle':
      if (item.quality) parts.push(item.quality);
      if (item.steps) parts.push(`${item.steps} steps`);
      break;
    case 'video':
      if (item.quality) parts.push(item.quality);
      if (item.resolution) parts.push(item.resolution);
      if (item.duration) parts.push(`${item.duration}s`);
      if (item.fps) parts.push(`${item.fps}fps`);
      break;
    case 'enhance':
      if (item.steps) parts.push(`${item.steps} steps`);
      break;
  }
  return parts.join(' \u00b7 ');
}

/** Icon component for line item type */
function LineIcon({ type }: { type: 'angle' | 'video' | 'enhance' }) {
  switch (type) {
    case 'angle':
      return (
        <div className={`billing-line-icon ${type}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <circle cx="12" cy="13" r="3" strokeWidth={2} />
          </svg>
        </div>
      );
    case 'video':
      return (
        <div className={`billing-line-icon ${type}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
      );
    case 'enhance':
      return (
        <div className={`billing-line-icon ${type}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
      );
  }
}

const BillingHistoryModal: React.FC<BillingHistoryModalProps> = ({ isOpen, onClose }) => {
  const { lineItems, summary, loading, clearHistory } = useBillingHistory();
  const [confirmClear, setConfirmClear] = useState(false);

  const handleClear = useCallback(async () => {
    await clearHistory();
    setConfirmClear(false);
  }, [clearHistory]);

  if (!isOpen) return null;

  return (
    <div className="billing-history-overlay" onClick={onClose}>
      <LiquidGlassPanel modalTint cornerRadius={24} className="billing-history-glass">
        <div className="billing-history-modal" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="billing-history-header">
            <h2>Billing History</h2>
            <button className="billing-history-close" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Summary Bar */}
          {summary.recordCount > 0 && (
            <div className="billing-summary-bar">
              {summary.totalSpark > 0 && (
                <div className="billing-summary-item">
                  <span className="billing-summary-label">Spark</span>
                  <span className="billing-summary-value spark">{summary.totalSpark.toFixed(2)}</span>
                </div>
              )}
              {summary.totalSogni > 0 && (
                <div className="billing-summary-item">
                  <span className="billing-summary-label">SOGNI</span>
                  <span className="billing-summary-value sogni">{summary.totalSogni.toFixed(2)}</span>
                </div>
              )}
              <div className="billing-summary-item">
                <span className="billing-summary-label">Total USD</span>
                <span className="billing-summary-value usd">${summary.totalUSD.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* List */}
          <div className="billing-list">
            {loading ? (
              <div className="billing-empty">
                <span className="billing-empty-text">Loading...</span>
              </div>
            ) : lineItems.length === 0 ? (
              <div className="billing-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="40" height="40">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span className="billing-empty-text">No billing history yet</span>
              </div>
            ) : (
              lineItems.map((item) => (
                <div key={item.id} className="billing-line-item">
                  <LineIcon type={item.type} />
                  <div className="billing-line-details">
                    <div className="billing-line-primary">{getLineLabel(item)}</div>
                    <div className="billing-line-secondary">
                      {[getLineDetail(item), item.projectName, formatTimestamp(item.timestamp)]
                        .filter(Boolean)
                        .join(' \u00b7 ')}
                    </div>
                  </div>
                  <div className="billing-line-cost">
                    <div className="billing-line-cost-token">
                      {item.totalCostToken.toFixed(2)} {item.tokenType.toUpperCase()}
                    </div>
                    <div className="billing-line-cost-usd">
                      ${item.totalCostUSD.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {lineItems.length > 0 && (
            <div className="billing-footer">
              {confirmClear ? (
                <div className="billing-confirm-clear">
                  <span className="billing-confirm-text">Clear all history?</span>
                  <button className="billing-confirm-yes" onClick={() => void handleClear()}>
                    Clear
                  </button>
                  <button className="billing-confirm-no" onClick={() => setConfirmClear(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button className="billing-clear-btn" onClick={() => setConfirmClear(true)}>
                  Clear History
                </button>
              )}
            </div>
          )}
        </div>
      </LiquidGlassPanel>
    </div>
  );
};

export default BillingHistoryModal;
