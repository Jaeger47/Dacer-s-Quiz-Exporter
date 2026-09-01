import type { QuizResult } from '@/lib/quiz-types';

const DB_NAME = 'quiq-offline';
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('results')) {
        const store = db.createObjectStore('results', { keyPath: 'resultId' });
        store.createIndex('quizId', 'quizId');
        store.createIndex('studentId', 'studentId');
        store.createIndex('submittedAt', 'submittedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open local storage.'));
  });
}

async function runStoreOperation<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('results', mode);
    const request = operation(transaction.objectStore('results'));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Local database operation failed.'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error || new Error('Local database transaction failed.'));
  });
}

export function getResults(): Promise<QuizResult[]> {
  return runStoreOperation('readonly', (store) => store.getAll());
}

export async function findSecondaryDuplicate(result: QuizResult): Promise<QuizResult | undefined> {
  const results = await getResults();
  return results.find(
    (item) =>
      item.resultId === result.resultId ||
      (item.quizId === result.quizId && item.studentId === result.studentId && item.attempt === result.attempt),
  );
}

export function saveResult(result: QuizResult): Promise<IDBValidKey> {
  return runStoreOperation('readwrite', (store) => store.put({ ...result, recordedAt: result.recordedAt || new Date().toISOString() }));
}

export function deleteResult(resultId: string): Promise<undefined> {
  return runStoreOperation('readwrite', (store) => store.delete(resultId) as IDBRequest<undefined>);
}

export function clearAllResults(): Promise<undefined> {
  return runStoreOperation('readwrite', (store) => store.clear() as IDBRequest<undefined>);
}

export async function exportDatabase() {
  return {
    format: 'QUIQ_BACKUP',
    version: '1.0',
    createdAt: new Date().toISOString(),
    results: await getResults(),
  };
}

export async function restoreDatabase(value: unknown, mode: 'merge' | 'replace') {
  const backup = value as { format?: string; version?: string; results?: QuizResult[] };
  if (backup?.format !== 'QUIQ_BACKUP' || backup.version !== '1.0' || !Array.isArray(backup.results)) {
    throw new Error('This file is not a supported Quiq backup.');
  }
  if (mode === 'replace') await clearAllResults();
  for (const result of backup.results) {
    if (result?.format !== 'QUIQ_RESULT' || !result.resultId) throw new Error('The backup contains an invalid result record.');
    await saveResult(result);
  }
  return backup.results.length;
}
