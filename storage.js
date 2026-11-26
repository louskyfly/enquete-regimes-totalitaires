const DB_NAME = "enquete-regimes-totalitaires";
const DB_VERSION = 1;
const STORE = "etat";
const KEY = "courant";

function openDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB indisponible"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveState(state) {
  const payload = JSON.parse(JSON.stringify(state));
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(payload, KEY);
    await txDone(tx);
    db.close();
    try {
      localStorage.setItem(KEY, JSON.stringify(payload));
    } catch (_) {
      /* localStorage peut être plein ou bloqué : IndexedDB suffit */
    }
    return true;
  } catch (_) {
    try {
      localStorage.setItem(KEY, JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }
}

export async function loadState() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(KEY);
    const value = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (value) return value;
  } catch (_) {
    /* on essaie localStorage */
  }
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export async function clearState() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    await txDone(tx);
    db.close();
  } catch (_) {
    /* ignore */
  }
  try {
    localStorage.removeItem(KEY);
  } catch (_) {
    /* ignore */
  }
}
