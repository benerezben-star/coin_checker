// IndexedDB storage. Everything lives on this device and is never uploaded.
//
// Photos are stored as Blobs in the same database rather than as data URLs --
// blobs stay compressed on disk, which matters when microscope captures are
// several megabytes each.

const DB_NAME = "coin_checker";
const DB_VERSION = 1;

let _db = null;

export function openDb() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("coins")) {
        const coins = db.createObjectStore("coins", {
          keyPath: "id",
          autoIncrement: true,
        });
        coins.createIndex("denomination", "denomination");
        coins.createIndex("updated_at", "updated_at");
      }
      if (!db.objectStoreNames.contains("photos")) {
        const photos = db.createObjectStore("photos", {
          keyPath: "id",
          autoIncrement: true,
        });
        photos.createIndex("coin_id", "coin_id");
      }
      // Checklist marks and variety verdicts, keyed "<coinId>:<key>".
      if (!db.objectStoreNames.contains("checks")) {
        db.createObjectStore("checks", { keyPath: "id" }).createIndex(
          "coin_id",
          "coin_id"
        );
      }
      if (!db.objectStoreNames.contains("variety_checks")) {
        db.createObjectStore("variety_checks", { keyPath: "id" }).createIndex(
          "coin_id",
          "coin_id"
        );
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = "readonly") {
  return openDb().then((db) => db.transaction(store, mode).objectStore(store));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const now = () => new Date().toISOString().slice(0, 19);

// --- coins ---------------------------------------------------------------

export const COIN_DEFAULTS = {
  country: "US",
  denomination: "",
  year: null,
  mint_mark: "",
  weight_g: null,
  diameter_mm: null,
  is_magnetic: null,
  is_proof: 0,
  grade: "",
  status: "unchecked",
  verdict: "none",
  findings: "",
  notes: "",
  acquired: "",
  est_value: null,
};

export async function createCoin(data) {
  const stamp = now();
  const coin = { ...COIN_DEFAULTS, ...data, created_at: stamp, updated_at: stamp };
  delete coin.id;
  const store = await tx("coins", "readwrite");
  return wrap(store.add(coin));
}

export async function updateCoin(id, data) {
  const store = await tx("coins", "readwrite");
  const existing = await wrap(store.get(id));
  if (!existing) return null;
  const merged = { ...existing, ...data, id, updated_at: now() };
  await wrap(store.put(merged));
  return merged;
}

export async function getCoin(id) {
  return wrap((await tx("coins")).get(id));
}

export async function listCoins() {
  const all = await wrap((await tx("coins")).getAll());
  return all.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

export async function deleteCoin(id) {
  for (const photo of await getPhotos(id)) await deletePhoto(photo.id);
  for (const store of ["checks", "variety_checks"]) {
    const s = await tx(store, "readwrite");
    const keys = await wrap(s.index("coin_id").getAllKeys(id));
    for (const k of keys) await wrap(s.delete(k));
  }
  await wrap((await tx("coins", "readwrite")).delete(id));
}

export async function stats() {
  const coins = await listCoins();
  return {
    total: coins.length,
    unchecked: coins.filter((c) => c.status === "unchecked").length,
    suspects: coins.filter((c) => c.verdict === "suspect").length,
    confirmed: coins.filter((c) => c.verdict === "confirmed_error").length,
    value: coins.reduce((sum, c) => sum + (Number(c.est_value) || 0), 0),
  };
}

// --- photos --------------------------------------------------------------

export async function addPhoto(
  coinId, blob, side = "obverse", caption = "", thumb = null
) {
  const store = await tx("photos", "readwrite");
  return wrap(
    store.add({
      coin_id: coinId,
      blob,
      // A small JPEG kept alongside the original. List views show hundreds of
      // images at once; decoding full microscope captures for that would stall
      // the phone and burn memory.
      thumb,
      type: blob.type || "image/jpeg",
      size: blob.size,
      side,
      caption,
      created_at: now(),
    })
  );
}

export async function getPhotos(coinId) {
  return wrap((await tx("photos")).index("coin_id").getAll(coinId));
}

export async function getPhoto(id) {
  return wrap((await tx("photos")).get(id));
}

export async function allPhotos() {
  return wrap((await tx("photos")).getAll());
}

export async function deletePhoto(id) {
  await wrap((await tx("photos", "readwrite")).delete(id));
}

// --- checklist + varieties -----------------------------------------------

export async function setCheck(coinId, checkKey, result, notes = "") {
  const store = await tx("checks", "readwrite");
  await wrap(
    store.put({
      id: `${coinId}:${checkKey}`,
      coin_id: coinId,
      check_key: checkKey,
      result,
      notes,
      updated_at: now(),
    })
  );
}

export async function getChecks(coinId) {
  const rows = await wrap((await tx("checks")).index("coin_id").getAll(coinId));
  return Object.fromEntries(rows.map((r) => [r.check_key, r]));
}

export async function setVarietyCheck(coinId, varietyId, status, notes = "") {
  const store = await tx("variety_checks", "readwrite");
  await wrap(
    store.put({
      id: `${coinId}:${varietyId}`,
      coin_id: coinId,
      variety_id: varietyId,
      status,
      notes,
      updated_at: now(),
    })
  );
}

export async function getVarietyChecks(coinId) {
  const rows = await wrap(
    (await tx("variety_checks")).index("coin_id").getAll(coinId)
  );
  return Object.fromEntries(rows.map((r) => [r.variety_id, r]));
}

// --- backup --------------------------------------------------------------

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(url) {
  return (await fetch(url)).blob();
}

/** Full backup including photos. This is the only copy of your data, so the
 *  export is deliberately complete rather than a summary. */
export async function exportAll({ includePhotos = true } = {}) {
  const photos = includePhotos ? await allPhotos() : [];
  const encoded = [];
  for (const p of photos) {
    encoded.push({ ...p, blob: await blobToDataUrl(p.blob) });
  }
  const [coins, checks, varietyChecks] = await Promise.all([
    listCoins(),
    wrap((await tx("checks")).getAll()),
    wrap((await tx("variety_checks")).getAll()),
  ]);
  return {
    format: "coin_checker_backup",
    version: 1,
    exported_at: new Date().toISOString(),
    coins,
    photos: encoded,
    checks,
    variety_checks: varietyChecks,
  };
}

/** Restore a backup. Coins are appended with fresh ids so an import can never
 *  overwrite what is already on the device. */
export async function importAll(data) {
  if (data?.format !== "coin_checker_backup") {
    throw new Error("Not a Coin Checker backup file.");
  }
  const idMap = new Map();
  let added = 0;

  for (const coin of data.coins ?? []) {
    const { id: oldId, ...rest } = coin;
    const newId = await createCoin(rest);
    idMap.set(oldId, newId);
    added++;
  }
  for (const p of data.photos ?? []) {
    const coinId = idMap.get(p.coin_id);
    if (coinId == null) continue;
    await addPhoto(coinId, await dataUrlToBlob(p.blob), p.side, p.caption);
  }
  for (const c of data.checks ?? []) {
    const coinId = idMap.get(c.coin_id);
    if (coinId != null) await setCheck(coinId, c.check_key, c.result, c.notes);
  }
  for (const v of data.variety_checks ?? []) {
    const coinId = idMap.get(v.coin_id);
    if (coinId != null)
      await setVarietyCheck(coinId, v.variety_id, v.status, v.notes);
  }
  return added;
}

export function toCsv(coins, photoCounts) {
  const head = [
    "id", "country", "denomination", "year", "mint_mark", "weight_g",
    "diameter_mm", "magnetic", "proof", "grade", "status", "verdict",
    "findings", "notes", "acquired", "est_value", "photos",
  ];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = coins.map((c) =>
    [
      c.id, c.country, c.denomination, c.year, c.mint_mark, c.weight_g,
      c.diameter_mm,
      c.is_magnetic === 1 ? "yes" : c.is_magnetic === 0 ? "no" : "",
      c.is_proof ? "yes" : "no",
      c.grade, c.status, c.verdict, c.findings, c.notes, c.acquired,
      c.est_value, photoCounts[c.id] ?? 0,
    ].map(esc).join(",")
  );
  return [head.join(","), ...rows].join("\n");
}
