/* ================================================================== */
/* Liaison avec la base Firebase Realtime Database                    */
/*                                                                     */
/* Rempli au déploiement : l'adresse de la base du projet.           */
/* Tant que la valeur est vide, l'envoi direct est désactivé et       */
/* l'application garde le lien de correction et le fichier .json.     */
/* ================================================================== */

export const DATABASE_URL =
  "https://sync-3626f-default-rtdb.europe-west1.firebasedatabase.app";

/* Alphabet sans I, O, 0 et 1 : le code se lit et se tape sans erreur. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function isSyncEnabled() {
  return Boolean(DATABASE_URL);
}

export function normalizeCode(value) {
  const clean = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (clean.length !== 8) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

export function isValidCode(value) {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizeCode(value));
}

export function randomCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/* Racine réservée à cette application dans une base partagée. */
const ROOT = "enquete-regimes-totalitaires";

function sessionPath(code) {
  return `${DATABASE_URL}/${ROOT}/sessions/${normalizeCode(code)}`;
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function readJson(url) {
  return request(url, { cache: "no-store" });
}

async function writeJson(url, value) {
  return request(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value)
  });
}

export async function openSession(code) {
  if (!isSyncEnabled() || !isValidCode(code)) return null;
  const meta = await readJson(`${sessionPath(code)}/meta.json`);
  return meta || null;
}

export async function createSession(code, label = "") {
  if (!isSyncEnabled()) throw new Error("sync-desactive");
  const existing = await openSession(code);
  if (existing) {
    const error = new Error("session-existe");
    error.code = "exists";
    throw error;
  }
  await writeJson(`${sessionPath(code)}/meta.json`, {
    createdAt: Date.now(),
    label: String(label || ""),
    app: "enquete-regimes-totalitaires"
  });
  return normalizeCode(code);
}

export async function publishCopy(code, payload) {
  if (!isSyncEnabled()) throw new Error("sync-desactive");
  if (!isValidCode(code)) throw new Error("code-invalide");
  if (!payload || !payload.id) throw new Error("copie-invalide");
  await writeJson(`${sessionPath(code)}/copies/${payload.id}.json`, payload);
  return payload.id;
}

export async function fetchCopies(code) {
  if (!isSyncEnabled() || !isValidCode(code)) return {};
  const data = await readJson(`${sessionPath(code)}/copies.json`);
  return data && typeof data === "object" ? data : {};
}

/**
 * Suit les copies d'une session en direct (Server-Sent Events de Firebase),
 * avec un repli par interrogation régulière si le flux est coupé.
 * handlers : { onData(copies, info), onStatus(state) }
 */
export function watchCopies(code, handlers = {}) {
  const copies = new Map();
  let closed = false;
  let source = null;
  let timer = null;
  let lastStatus = "";

  const emitData = (info = {}) => {
    const plain = {};
    copies.forEach((value, key) => {
      plain[key] = value;
    });
    if (handlers.onData) handlers.onData(plain, info);
  };

  const setStatus = (state, detail = "") => {
    if (closed || lastStatus === state + detail) return;
    lastStatus = state + detail;
    if (handlers.onStatus) handlers.onStatus(state, detail);
  };

  const stopWatch = () => {
    if (source) {
      source.close();
      source = null;
    }
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const applySnapshot = (data) => {
    copies.clear();
    if (data && typeof data === "object") {
      Object.entries(data).forEach(([key, value]) => copies.set(key, value));
    }
  };

  const applyPatch = (data) => {
    if (!data || typeof data !== "object") return;
    Object.entries(data).forEach(([key, value]) => {
      if (value === null) copies.delete(key);
      else copies.set(key, value);
    });
  };

  const startPolling = () => {
    if (timer || closed) return;
    timer = setInterval(async () => {
      try {
        const data = await fetchCopies(code);
        applySnapshot(data);
        emitData({ source: "poll" });
        setStatus("live");
      } catch (_) {
        setStatus("offline");
      }
    }, 8000);
  };

  const connect = () => {
    if (closed || typeof EventSource === "undefined") {
      startPolling();
      return;
    }
    try {
      source = new EventSource(`${sessionPath(code)}/copies.json`);
    } catch (_) {
      startPolling();
      return;
    }
    source.addEventListener("put", (event) => {
      const payload = JSON.parse(event.data || "{}");
      if (payload.path === "/" || !payload.path) applySnapshot(payload.data);
      else applyPatch({ [payload.path.replace(/^\//, "")]: payload.data });
      setStatus("live");
      emitData({ source: "stream" });
    });
    source.addEventListener("patch", (event) => {
      const payload = JSON.parse(event.data || "{}");
      applyPatch(payload.data);
      setStatus("live");
      emitData({ source: "stream" });
    });
    source.addEventListener("open", () => setStatus("live"));
    source.addEventListener("error", () => {
      if (closed) return;
      setStatus("reconnect");
      /* EventSource retente seul ; le repli prend le relais après 20 s. */
      setTimeout(() => {
        if (!closed && source && source.readyState === EventSource.CLOSED) startPolling();
      }, 20000);
    });
  };

  setStatus("connecting");
  connect();

  return {
    close() {
      closed = true;
      stopWatch();
    }
  };
}
