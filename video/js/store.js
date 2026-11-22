// Armazenamento local (IndexedDB): projetos, mídias e caixa de entrada de compartilhamento.
const DB_NAME = 'rolo-db';
const DB_VER = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of ['projects', 'media', 'inbox']) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    const r = fn(s);
    if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

export const db = {
  put: (store, obj) => tx(store, 'readwrite', s => s.put(obj)),
  get: (store, id) => tx(store, 'readonly', s => s.get(id)),
  del: (store, id) => tx(store, 'readwrite', s => s.delete(id)),
  all: (store) => tx(store, 'readonly', s => s.getAll()),
  clear: (store) => tx(store, 'readwrite', s => s.clear()),
};

export async function persistStorage() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
}
