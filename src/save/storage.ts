// Local save storage (plan §7.20): IndexedDB, persistent-storage request, export/import files.
import { afterTap } from '../input/afterTap';
import { migrateSave, readSaveFile, signSaveFile, type SaveData } from '../logic/save';
import type { SharedStorage } from '../logic/types';

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

/**
 * Writes a character save, and the shared warehouse with it in the same transaction, so a
 * character and the warehouse can't get out of step (no items lost or doubled when a game is
 * left without saving).
 */
export function writeSave(slot: number, data: SaveData, shared?: SharedStorage): Promise<void> {
  return openDb().then((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put({ ...data, shared: undefined }, slotKey(slot));
    if (shared) store.put(shared, SHARED_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('IndexedDB transaction failed'));
    };
  }));
}

const SHARED_KEY = 'shared';
const emptyShared = (): SharedStorage => ({ items: [], gold: 0 });

/** The warehouse shared by every character on this device (empty if none yet). */
export async function loadShared(): Promise<SharedStorage> {
  try {
    const raw = (await run('readonly', (st) => st.get(SHARED_KEY))) as Partial<SharedStorage> | undefined;
    return { items: Array.isArray(raw?.items) ? raw.items : [], gold: typeof raw?.gold === 'number' ? raw.gold : 0 };
  } catch (e) {
    console.warn('Could not load the warehouse', e);
    return emptyShared();
  }
}

/**
 * An imported save file carries a copy of the warehouse it was exported with. It is used only
 * when this device's warehouse is still empty (e.g. moving to a new device), never merged, so
 * importing can't double anything.
 */
export async function adoptSharedFrom(data: SaveData): Promise<boolean> {
  const sh = data.shared;
  if (!sh || (sh.items.length === 0 && !sh.gold)) return false;
  const cur = await loadShared();
  if (cur.items.length > 0 || cur.gold > 0) return false;
  await run('readwrite', (st) => st.put({ items: sh.items, gold: sh.gold }, SHARED_KEY));
  return true;
}

/** Permanently removes the character in a slot. */
export function deleteSave(slot: number): Promise<void> {
  return run('readwrite', (st) => st.delete(slotKey(slot))).then(() => undefined);
}

/** Ask the browser not to evict our data under storage pressure (best effort). */
export function requestPersistentStorage(): void {
  void navigator.storage?.persist?.().catch(() => false);
}

/** Downloads a character's save file; with the warehouse, a copy of it goes along (see adoptSharedFrom). */
export function exportSaveFile(data: SaveData, shared?: SharedStorage): void {
  const blob = new Blob([JSON.stringify(signSaveFile(shared ? { ...data, shared } : data), null, 2)], { type: 'application/json' });
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
