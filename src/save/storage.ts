// Local save storage (plan §7.20): IndexedDB, persistent-storage request, export/import files.
import { migrateSave, readSaveFile, signSaveFile, type SaveData } from '../logic/save';

const DB_NAME = 'rpg-game';
const STORE = 'saves';
/** Number of characters a player can keep. Slot 0 uses the old single-save key, so existing saves stay. */
export const SAVE_SLOTS = 3;
const slotKey = (slot: number) => `slot${slot + 1}`;

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

/** The save in a slot (0..SAVE_SLOTS-1), migrated to the latest version, or null if none (or unreadable). */
export async function loadSave(slot: number): Promise<SaveData | null> {
  try {
    const raw = await run('readonly', (st) => st.get(slotKey(slot)));
    return raw ? migrateSave(raw) : null;
  } catch (e) {
    console.warn('Could not load save', e);
    return null;
  }
}

/** Every slot's save (null for empty ones). */
export function loadAllSaves(): Promise<(SaveData | null)[]> {
  return Promise.all(Array.from({ length: SAVE_SLOTS }, (_, i) => loadSave(i)));
}

export function writeSave(slot: number, data: SaveData): Promise<void> {
  return run('readwrite', (st) => st.put(data, slotKey(slot))).then(() => undefined);
}

/** Permanently removes the character in a slot. */
export function deleteSave(slot: number): Promise<void> {
  return run('readwrite', (st) => st.delete(slotKey(slot))).then(() => undefined);
}

/** Ask the browser not to evict our data under storage pressure (best effort). */
export function requestPersistentStorage(): void {
  void navigator.storage?.persist?.().catch(() => false);
}

/**
 * Runs `fn` when the current tap or click ends. Game buttons react on finger-down, but iPhone
 * only lets a page open a file picker or start a download from a real tap, which it counts when
 * the finger lifts (touchend) — from touchstart the picker silently doesn't open.
 */
function afterTap(fn: () => void): void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    window.removeEventListener('touchend', run, true);
    window.removeEventListener('mouseup', run, true);
    fn();
  };
  window.addEventListener('touchend', run, true);
  window.addEventListener('mouseup', run, true);
  setTimeout(run, 2000); // no release seen (e.g. a keyboard press): try anyway
}

export function exportSaveFile(data: SaveData): void {
  const blob = new Blob([JSON.stringify(signSaveFile(data), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const who = data.player.name ? `${data.player.name}-` : '';
  a.download = `rpg-save-${who}${new Date(data.savedAt).toISOString().slice(0, 10)}.json`;
  afterTap(() => {
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
}

/** Opens a file picker and returns the parsed, migrated save (throws with a reason on failure). */
export function pickSaveFile(): Promise<SaveData> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    // Kept in the page while the picker is open: iPhone may drop the chosen file otherwise.
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = () => {
      input.remove();
      const file = input.files?.[0];
      if (!file) return reject(new Error('沒有選擇檔案'));
      file.text().then((txt) => resolve(readSaveFile(JSON.parse(txt)))).catch(reject);
    };
    input.addEventListener('cancel', () => input.remove());
    afterTap(() => input.click());
  });
}
