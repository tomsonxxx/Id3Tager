// Fix: Provide full implementation for IndexedDB utility functions.
// Simple key-val storage using IndexedDB.
// This is a simplified implementation inspired by idb-keyval.

const DB_NAME = 'id3-tagger-db';
const STORE_NAME = 'keyval';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore(type: IDBTransactionMode, callback: (store: IDBObjectStore) => void): Promise<void> {
  return getDB().then(db => {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, type);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      callback(transaction.objectStore(STORE_NAME));
    });
  });
}

export function get<T>(key: IDBValidKey): Promise<T | undefined> {
  let request: IDBRequest;
  return withStore('readonly', store => {
    request = store.get(key);
  }).then(() => request.result);
}

export function set(key: IDBValidKey, value: any): Promise<void> {
  return withStore('readwrite', store => {
    store.put(value, key);
  });
}

export function del(key: IDBValidKey): Promise<void> {
  return withStore('readwrite', store => {
    store.delete(key);
  });
}

export function keys(): Promise<IDBValidKey[]> {
    let request: IDBRequest;
    return withStore('readonly', store => {
        request = store.getAllKeys();
    }).then(() => request.result);
}

export function clear(): Promise<void> {
  return withStore('readwrite', store => {
    store.clear();
  });
}
