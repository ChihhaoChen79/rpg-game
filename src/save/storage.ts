// Local save storage (plan §7.20): IndexedDB, persistent-storage request, export/import files.
import { migrateSave, type SaveData } from '../logic/save';

const DB_NAME = 'rpg-game';
const STORE = 'saves';
const SLOT = 'slot1';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('IndexedDB transaction failed'));
    };
  }));
}

/** The current save, migrated to the latest version, or null if none (or unreadable). */
export async function loadSave(): Promise<SaveData | null> {
  try {
    const raw = await run('readonly', (st) => st.get(SLOT));
    return raw ? migrateSave(raw) : null;
  } catch (e) {
    console.warn('Could not load save', e);
    return null;
  }
}

export function writeSave(data: SaveData): Promise<void> {
  return run('readwrite', (st) => st.put(data, SLOT)).then(() => undefined);
}

/** Permanently removes the saved character. */
export function deleteSave(): Promise<void> {
  return run('readwrite', (st) => st.delete(SLOT)).then(() => undefined);
}

/** Ask the browser not to evict our data under storage pressure (best effort). */
export function requestPersistentStorage(): void {
  void navigator.storage?.persist?.().catch(() => false);
}

export function exportSaveFile(data: SaveData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rpg-save-${new Date(data.savedAt).toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Opens a file picker and returns the parsed, migrated save (throws with a reason on failure). */
export function pickSaveFile(): Promise<SaveData> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('沒有選擇檔案'));
      file.text().then((txt) => resolve(migrateSave(JSON.parse(txt)))).catch(reject);
    };
    input.click();
  });
}
