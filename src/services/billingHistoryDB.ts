/**
 * Billing History Database
 *
 * IndexedDB-based storage for billing records.
 * Follows the same pattern as localProjectsDB.ts.
 */

import type { BillingRecord, BillingSummary } from '../types/billing';

const DB_NAME = 'sogni360-billing';
const DB_VERSION = 1;
const STORE_NAME = 'records';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[BillingDB] Failed to open:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
    };
  });

  return dbPromise;
}

/** Add a billing record */
export async function addBillingRecord(record: BillingRecord): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(record);

    request.onerror = () => {
      console.error('[BillingDB] Failed to add record:', request.error);
      reject(request.error);
    };
    request.onsuccess = () => resolve();
  });
}

/** Get all billing records, sorted by timestamp descending (newest first) */
export async function getAllBillingRecords(): Promise<BillingRecord[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev');

    const records: BillingRecord[] = [];

    request.onerror = () => {
      console.error('[BillingDB] Failed to list records:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        records.push(cursor.value as BillingRecord);
        cursor.continue();
      } else {
        resolve(records);
      }
    };
  });
}

/** Get summary totals across all records */
export async function getBillingSummary(): Promise<BillingSummary> {
  const records = await getAllBillingRecords();

  let totalSpark = 0;
  let totalSogni = 0;
  let totalUSD = 0;

  for (const r of records) {
    if (r.tokenType === 'spark') {
      totalSpark += r.costToken;
    } else {
      totalSogni += r.costToken;
    }
    totalUSD += r.costUSD;
  }

  return { totalSpark, totalSogni, totalUSD, recordCount: records.length };
}

/** Clear all billing records */
export async function clearBillingHistory(): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onerror = () => {
      console.error('[BillingDB] Failed to clear:', request.error);
      reject(request.error);
    };
    request.onsuccess = () => resolve();
  });
}
