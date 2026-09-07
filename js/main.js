// UI + hash router. Everything runs on-device; there is no server.

import * as DB from "./db.js";
import * as Specs from "./specs.js";
import * as V from "./varieties.js";
import * as Img from "./imaging.js";

const view = document.getElementById("view");

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const num = (v) => {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const coinTitle = (c) =>
  `${c.year || "????"}${c.mint_mark ? "-" + c.mint_mark : ""} ${
    c.denomination ? c.denomination[0].toUpperCase() + c.denomination.slice(1) : ""
  }`;

function analyzeCoin(coin) {
  return Specs.analyze({
    denomination: coin.denomination,
    year: coin.year,
    weightG: coin.weight_g,
    diameterMm: coin.diameter_mm,
    isMagnetic: coin.is_magnetic == null ? null : !!coin.is_magnetic,
    isProof: !!coin.is_proof,
  });
}

// Object URLs for thumbnails, revoked whenever the view is replaced.
let liveUrls = [];
function objUrl(blob) {
  const u = URL.createObjectURL(blob);
  liveUrls.push(u);
  return u;
}
// Every photo gets a small JPEG companion for list views.
async function storePhoto(coinId, file, side, caption = "") {
  let thumb = null;
  try {
    thumb = await Img.makeThumbnail(file);
  } catch {
    // A thumbnail failure must never lose the original capture.
  }
  return DB.addPhoto(coinId, file, side, caption, thumb);
}

function render(html) {
  liveUrls.forEach(URL.revokeObjectURL);
  liveUrls = [];
  view.innerHTML = html;
  window.scrollTo(0, 0);
}

// --- collection ----------------------------------------------------------

// Filters live in the hash (#/?q=1999&denomination=cent) so the back button
// and a reload both keep them.
function listFilters() {
  const q = location.hash.split("?")[1] ?? "";
  return Object.fromEntries(new URLSearchParams(q));
}

function matchesFilters(coin, f) {
  if (f.denomination && coin.denomination !== f.denomination) return false;
  if (f.status && coin.status !== f.status) return false;
  if (f.verdict && coin.verdict !== f.verdict) return false;
  if (f.q) {
    const hay = [coin.year, coin.mint_mark, coin.notes, coin.findings,
                 coin.grade, coin.acquired, coin.country]
      .join(" ").toLowerCase();
    if (!hay.includes(f.q.toLowerCase())) return false;
  }
  return true;
}

async function viewList() {
  const [all, stats] = await Promise.all([DB.listCoins(), DB.stats()]);
  const f = listFilters();
  const coins = all.filter((c) => matchesFilters(c, f));
  const filtering = Object.values(f).some(Boolean);
  const cards = [];

  for (const coin of coins) {
    const a = analyzeCoin(coin);
    const alerts = a.findings.filter((f) => f.level === "alert");
    const varieties = V.forCoin(coin.denomination, coin.year, coin.mint_mark);
    const photos = await DB.getPhotos(coin.id);
    cards.push(`
      <a class="coin-card ${alerts.length ? "has-alert" : ""}" href="#/coin/${coin.id}">
        <div class="coin-thumb">${
          photos.length
            ? `<img src="${objUrl(photos[0].thumb ?? photos[0].blob)}" alt="" loading="lazy">`
            : `<span class="no-photo">no photo</span>`
        }</div>
        <div class="coin-body">
          <h3>${esc(coinTitle(coin))}</h3>
          <p class="coin-meta">${esc(coin.country)}${
            coin.weight_g != null ? " &middot; " + coin.weight_g.toFixed(2) + "g" : ""
          }${coin.grade ? " &middot; " + esc(coin.grade) : ""}</p>
          ${alerts.slice(0, 2).map((f) => `<p class="badge badge-alert">${esc(f.title)}</p>`).join("")}
          ${varieties.length ? `<p class="badge badge-info">${varieties.length} variet${varieties.length === 1 ? "y" : "ies"} to check</p>` : ""}
          <p class="coin-tags">
            <span class="tag tag-${coin.status}">${esc(coin.status.replace("_", " "))}</span>
            ${coin.verdict !== "none" ? `<span class="tag tag-${coin.verdict}">${esc(coin.verdict.replace("_", " "))}</span>` : ""}
          </p>
        </div>
      </a>`);
  }

  const sel = (name, options, blank) =>
    `<select name="${name}"><option value="">${blank}</option>` +
    options.map((o) =>
      `<option value="${o}" ${f[name] === o ? "selected" : ""}>${o[0].toUpperCase() + o.slice(1).replace("_", " ")}</option>`
    ).join("") + `</select>`;

  render(`
    <div class="stats">
      <div class="stat"><span class="stat-num">${stats.total}</span><span class="stat-label">coins</span></div>
      <div class="stat"><span class="stat-num">${stats.unchecked}</span><span class="stat-label">unchecked</span></div>
      <div class="stat stat-warn"><span class="stat-num">${stats.suspects}</span><span class="stat-label">suspects</span></div>
      <div class="stat stat-good"><span class="stat-num">${stats.confirmed}</span><span class="stat-label">confirmed</span></div>
    </div>
    ${all.length ? `
      <form class="filterbar" id="filters">
        <input type="search" name="q" placeholder="Search year, mint mark, notes..." value="${esc(f.q ?? "")}">
        ${sel("denomination", Specs.denominations(), "All denominations")}
        ${sel("status", ["unchecked", "in_progress", "checked"], "Any status")}
        ${sel("verdict", ["none", "suspect", "confirmed_error", "ruled_out"], "Any verdict")}
        <button type="submit">Filter</button>
        ${filtering ? `<button type="button" class="btn-ghost" id="clear-filters">Clear</button>` : ""}
      </form>
      ${filtering ? `<p class="muted">${coins.length} of ${all.length} coins</p>` : ""}` : ""}
    ${
      coins.length
        ? `<div class="coin-grid">${cards.join("")}</div>`
        : all.length
        ? `<div class="empty"><h2>No matches</h2>
             <p>No coins match those filters.</p>
             <p><a class="btn-ghost" href="#/">Clear filters</a></p></div>`
        : `<div class="empty"><h2>No coins yet</h2>
             <p>Add your first coin to start checking it. Denomination is the only
             required field &mdash; year, mint mark, and weight can come later.</p>
             <p><a class="btn-primary" href="#/new">+ Add your first coin</a></p></div>`
    }`);

  const form = document.getElementById("filters");
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      const params = new URLSearchParams();
      for (const [k, v] of new FormData(e.target)) if (v) params.set(k, v);
      const query = params.toString();
      location.hash = query ? `#/?${query}` : "#/";
      viewList();
    };
    const clear = document.getElementById("clear-filters");
    if (clear) clear.onclick = () => { location.hash = "#/"; viewList(); };
  }
}

// --- add / edit ----------------------------------------------------------

function coinFormHtml(coin) {
  const d = coin ?? DB.COIN_DEFAULTS;
  const opt = (list, val) =>
    list.map((x) => `<option value="${x}" ${x === val ? "selected" : ""}>${x[0].toUpperCase() + x.slice(1).replace("_", " ")}</option>`).join("");
  return `
    <div class="field-row">
      <label>Denomination *
        <select name="denomination" required>
          <option value="">-- choose --</option>
          ${Specs.denominations().map((x) => `<option value="${x}" ${x === d.denomination ? "selected" : ""}>${x[0].toUpperCase() + x.slice(1)}</option>`).join("")}
          <option value="other" ${d.denomination === "other" ? "selected" : ""}>Other / foreign</option>
        </select>
      </label>
      <label>Country <input name="country" value="${esc(d.country)}"></label>
      <label>Year <input name="year" type="number" inputmode="numeric" value="${d.year ?? ""}"></label>
      <label>Mint mark <input name="mint_mark" maxlength="4" placeholder="P, D, S or blank" value="${esc(d.mint_mark)}"></label>
    </div>
    <fieldset>
      <legend>Measurements &mdash; these drive the automatic checks</legend>
      <div class="field-row">
        <label>Weight (grams)
          <input name="weight_g" type="number" step="0.001" inputmode="decimal" value="${d.weight_g ?? ""}">
          <small>Use a 0.01g scale. Most valuable measurement you can take.</small>
        </label>
        <label>Diameter (mm)
          <input name="diameter_mm" type="number" step="0.01" inputmode="decimal" value="${d.diameter_mm ?? ""}">
        </label>
        <label>Magnetic?
          <select name="is_magnetic">
            <option value="">Not tested</option>
            <option value="yes" ${d.is_magnetic === 1 ? "selected" : ""}>Yes</option>
            <option value="no" ${d.is_magnetic === 0 ? "selected" : ""}>No</option>
          </select>
        </label>
        <label class="check-label"><input type="checkbox" name="is_proof" ${d.is_proof ? "checked" : ""}> Proof coin</label>
      </div>
    </fieldset>
    <div class="field-row">
      <label>Grade <input name="grade" value="${esc(d.grade)}"></label>
      <label>Acquired <input name="acquired" value="${esc(d.acquired)}"></label>
      <label>Est. value ($) <input name="est_value" type="number" step="0.01" inputmode="decimal" value="${d.est_value ?? ""}"></label>
    </div>
    <div class="field-row">
      <label>Status <select name="status">${opt(["unchecked", "in_progress", "checked"], d.status)}</select></label>
      <label>Verdict <select name="verdict">${opt(["none", "suspect", "confirmed_error", "ruled_out"], d.verdict)}</select></label>
    </div>
    <label>Findings <textarea name="findings" rows="2">${esc(d.findings)}</textarea></label>
    <label>Notes <textarea name="notes" rows="3">${esc(d.notes)}</textarea></label>`;
}

function readForm(form) {
  const f = new FormData(form);
  return {
    country: (f.get("country") || "US").trim() || "US",
    denomination: (f.get("denomination") || "").trim(),
    year: num(f.get("year")),
    mint_mark: (f.get("mint_mark") || "").trim().toUpperCase(),
    weight_g: num(f.get("weight_g")),
    diameter_mm: num(f.get("diameter_mm")),
    is_magnetic: { yes: 1, no: 0 }[f.get("is_magnetic")] ?? null,
    is_proof: f.get("is_proof") ? 1 : 0,
    grade: (f.get("grade") || "").trim(),
    status: f.get("status") || "unchecked",
    verdict: f.get("verdict") || "none",
    findings: (f.get("findings") || "").trim(),
    notes: (f.get("notes") || "").trim(),
    acquired: (f.get("acquired") || "").trim(),
    est_value: num(f.get("est_value")),
  };
}

async function viewNew() {
  render(`
    <h1>Add a coin</h1>
    <form class="card form" id="coin-form">
      ${coinFormHtml(null)}
      <fieldset>
        <legend>Photos (optional)</legend>
        <div class="field-row">
          <label>Images <input type="file" name="photos" multiple accept="image/*"></label>
          <label>Side <select name="photo_side">
            <option value="obverse">Obverse (heads)</option>
            <option value="reverse">Reverse (tails)</option>
            <option value="edge">Edge</option>
            <option value="detail">Detail</option>
          </select></label>
        </div>
      </fieldset>
      <div class="form-actions">
        <button class="btn-primary" type="submit">Add coin</button>
        <a class="btn-ghost" href="#/">Cancel</a>
      </div>
    </form>`);

  document.getElementById("coin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = readForm(e.target);
    if (!data.denomination) return alert("Denomination is required.");
    const id = await DB.createCoin(data);
    const files = e.target.querySelector('input[name="photos"]').files;
    const side = new FormData(e.target).get("photo_side");
    for (const file of files) await storePhoto(id, file, side);
    location.hash = `#/coin/${id}`;
  });
}

// --- coin detail ---------------------------------------------------------

async function viewCoin(id) {
  const coin = await DB.getCoin(id);
  if (!coin) return render(`<div class="empty"><h2>Coin not found</h2></div>`);

  const a = analyzeCoin(coin);
  const hits = V.forCoin(coin.denomination, coin.year, coin.mint_mark);
  const vStatus = await DB.getVarietyChecks(id);
  const checks = await DB.getChecks(id);
  const photos = await DB.getPhotos(id);
  const lesson = V.criticalLesson();

  const optBtns = (opts, attr, key, current) =>
    `<div class="btn-group">${opts
      .map(([val, label]) => `<button type="button" class="opt opt-${val} ${current === val ? "active" : ""}" data-${attr}="${key}" data-value="${val}">${label}</button>`)
      .join("")}</div>`;

  render(`
    <div class="detail-head">
      <div>
        <h1>${esc(coinTitle(coin))} ${coin.is_proof ? '<span class="tag">proof</span>' : ""}</h1>
        <p class="coin-meta">${esc(coin.country)}${coin.weight_g != null ? " &middot; " + coin.weight_g.toFixed(3) + "g" : ""}${coin.diameter_mm != null ? " &middot; " + coin.diameter_mm.toFixed(2) + "mm" : ""}${coin.grade ? " &middot; " + esc(coin.grade) : ""}
          &middot; <span class="tag tag-${coin.status}">${esc(coin.status.replace("_", " "))}</span>
          ${coin.verdict !== "none" ? `<span class="tag tag-${coin.verdict}">${esc(coin.verdict.replace("_", " "))}</span>` : ""}</p>
      </div>
      <div class="detail-actions">
        ${photos.length ? `<a class="btn-ghost" href="#/scope/${id}">Image workbench</a>` : ""}
        <button class="btn-ghost" id="toggle-edit">Edit details</button>
      </div>
    </div>

    <section id="edit-panel" class="card collapsed">
      <form class="form" id="edit-form">${coinFormHtml(coin)}
        <div class="form-actions"><button class="btn-primary" type="submit">Save</button></div>
      </form>
      <button class="btn-danger" id="delete-coin">Delete this coin</button>
    </section>

    <section class="card">
      <h2>Measurement analysis</h2>
      ${a.findings.map((f) => `<div class="finding finding-${f.level}"><strong>${esc(f.title)}</strong><p>${esc(f.detail)}</p></div>`).join("")}
    </section>

    <section class="card">
      <h2>Known varieties <span class="count">${hits.length}</span></h2>
      ${hits.length ? "" : `<p class="muted">No catalogued varieties for this exact date and mint mark. Work the checklist below anyway &mdash; unattributed errors turn up on any date.</p>`}
      ${hits.map((v) => `
        <article class="variety variety-${v.severity}">
          <header><h3>${esc(v.name)}</h3><span class="sev sev-${v.severity}">${v.severity}</span></header>
          <p class="variety-type">${esc(v.type)} &middot; <em>${esc(v.where)}</em></p>
          <p><strong>Look for:</strong> ${esc(v.look_for)}</p>
          <p class="mag">Magnification: ${esc(v.magnification)}</p>
          ${v.beware ? `<p class="beware"><strong>Beware:</strong> ${esc(v.beware)}</p>` : ""}
          ${v.value_note ? `<p class="value"><strong>Value:</strong> ${esc(v.value_note)}</p>` : ""}
          ${optBtns([["unchecked", "Not checked"], ["ruled_out", "Ruled out"], ["possible", "Possible"], ["confirmed", "Confirmed"]], "variety", v.id, vStatus[v.id]?.status ?? "unchecked")}
        </article>`).join("")}
    </section>

    <section class="card card-lesson">
      <h2>${esc(lesson.title)}</h2>
      <p class="why">${esc(lesson.why)}</p>
      <div class="two-col">
        <div><h4>Machine doubling &mdash; worthless</h4><ul>${lesson.machine_doubling.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
        <div><h4>True doubled die &mdash; valuable</h4><ul>${lesson.true_doubled_die.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      </div>
      <p class="test"><strong>The test:</strong> ${esc(lesson.test)}</p>
    </section>

    <section class="card">
      <h2>Inspection checklist</h2>
      <p class="muted">Marks save as you tap.</p>
      ${V.zones().map((z) => `
        <div class="zone"><h3>${esc(z.name)}</h3>
          ${z.checks.map((c) => {
            const state = checks[c.key]?.result ?? "todo";
            return `<div class="check check-${state}" data-row="${c.key}">
              <div class="check-main"><strong>${esc(c.label)}</strong><p>${esc(c.detail)}</p>
              ${c.finds?.length ? `<p class="finds">${c.finds.map((f) => `<span class="chip">${esc(f)}</span>`).join("")}</p>` : ""}</div>
              ${optBtns([["todo", "To do"], ["pass", "Looks normal"], ["suspect", "Suspect!"], ["na", "N/A"]], "check", c.key, state)}
            </div>`;
          }).join("")}
        </div>`).join("")}
    </section>

    <section class="card">
      <h2>Photos <span class="count">${photos.length}</span></h2>
      <form class="upload-form" id="photo-form">
        <input type="file" name="photos" multiple accept="image/*" required>
        <select name="side"><option value="obverse">Obverse</option><option value="reverse">Reverse</option><option value="edge">Edge</option><option value="detail">Detail</option></select>
        <input name="caption" placeholder="Caption">
        <button class="btn-primary" type="submit">Add</button>
      </form>
      <div class="photo-grid">
        ${photos.map((p) => `
          <figure class="photo">
            <img src="${objUrl(p.thumb ?? p.blob)}" alt="" loading="lazy">
            <figcaption><span class="tag">${esc(p.side)}</span> ${esc(p.caption)}
              <button class="link-danger" data-del-photo="${p.id}">delete</button></figcaption>
          </figure>`).join("") || `<p class="muted">No photos yet.</p>`}
      </div>
    </section>`);

  // --- handlers
  document.getElementById("toggle-edit").onclick = () =>
    document.getElementById("edit-panel").classList.toggle("collapsed");

  document.getElementById("edit-form").onsubmit = async (e) => {
    e.preventDefault();
    await DB.updateCoin(id, readForm(e.target));
    viewCoin(id);
  };

  document.getElementById("delete-coin").onclick = async () => {
    if (!confirm("Delete this coin and all its photos permanently?")) return;
    await DB.deleteCoin(id);
    location.hash = "#/";
  };

  document.getElementById("photo-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    for (const file of e.target.querySelector('input[type=file]').files) {
      await storePhoto(id, file, f.get("side"), f.get("caption") || "");
    }
    viewCoin(id);
  };

}

// Checklist and variety taps are handled here, once, for the whole app rather
// than per render. Binding this inside viewCoin() left a live listener behind
// on every visit, each closing over the coin id it was created with -- so one
// tap wrote the same mark to every coin opened since the app started, and
// deleting a photo re-rendered whichever coin was visited first. The id comes
// from the route instead, so only the coin actually on screen is written to.
view.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const { part, arg } = parseRoute();
  if (part !== "coin" || !arg) return;
  const id = Number(arg);

  if (btn.dataset.delPhoto) {
    if (!confirm("Delete this photo?")) return;
    Img.clearCache(Number(btn.dataset.delPhoto));
    await DB.deletePhoto(Number(btn.dataset.delPhoto));
    return viewCoin(id);
  }
  if (btn.dataset.check) {
    btn.parentElement.querySelectorAll(".opt").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    btn.closest(".check").className = "check check-" + btn.dataset.value;
    await DB.setCheck(id, btn.dataset.check, btn.dataset.value);
  }
  if (btn.dataset.variety) {
    btn.parentElement.querySelectorAll(".opt").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    await DB.setVarietyCheck(id, btn.dataset.variety, btn.dataset.value);
  }
});

// --- image workbench -----------------------------------------------------

async function viewScope(id) {
  const coin = await DB.getCoin(id);
  const photos = await DB.getPhotos(id);
  if (!coin || !photos.length) return render(`<div class="empty"><h2>No photos on this coin</h2></div>`);
  const others = (await DB.allPhotos()).filter((p) => p.coin_id !== id);
  const all = [...photos, ...others];

  const photoOpts = (sel) =>
    all.map((p, i) => `<option value="${p.id}" ${i === sel ? "selected" : ""}>${p.coin_id === id ? "" : "[other] "}${esc(p.side)}${p.caption ? " - " + esc(p.caption) : ""}</option>`).join("");
  const filterOpts = Object.entries(Img.FILTERS)
    .map(([k, m]) => `<option value="${k}">${m.label}</option>`).join("");

  render(`
    <div class="detail-head">
      <div><h1>Image workbench</h1><p class="coin-meta">${esc(coinTitle(coin))}</p></div>
      <a class="btn-ghost" href="#/coin/${id}">Back to coin</a>
    </div>
    <div class="card"><div class="zoom-row">
      <label>Zoom <input id="zoom" type="range" min="100" max="600" value="100" step="10"> <span id="zoom-val">100%</span></label>
      <p class="muted">Put the suspect coin in one pane and a known-normal coin in the other.</p>
    </div></div>
    <div class="workbench">
      ${["a", "b"].map((p, i) => `
        <div class="pane" data-pane="${p}">
          <div class="pane-controls">
            <select class="pane-photo">${photoOpts(Math.min(i, all.length - 1))}</select>
            <select class="pane-filter">${filterOpts}</select>
          </div>
          <div class="pane-viewport"><img class="pane-img" alt=""></div>
          <p class="pane-help muted"></p>
        </div>`).join("")}
    </div>`);

  const refresh = async (pane) => {
    const pid = Number(pane.querySelector(".pane-photo").value);
    const name = pane.querySelector(".pane-filter").value;
    const img = pane.querySelector(".pane-img");
    pane.querySelector(".pane-help").textContent = "Working...";
    const photo = await DB.getPhoto(pid);
    img.src = await Img.renderFiltered(pid, photo.blob, name);
    pane.querySelector(".pane-help").textContent = Img.FILTERS[name].help;
  };

  document.querySelectorAll(".pane").forEach((pane) => {
    pane.addEventListener("change", () => refresh(pane));
    refresh(pane);
  });

  const zoom = document.getElementById("zoom");
  zoom.oninput = () => {
    document.getElementById("zoom-val").textContent = zoom.value + "%";
    document.querySelectorAll(".pane-img").forEach((i) => (i.style.transform = `scale(${zoom.value / 100})`));
  };
}

// --- reference -----------------------------------------------------------

function viewReference() {
  const lesson = V.criticalLesson();
  const damage = V.damageNotError();
  render(`
    <h1>Reference</h1>
    <form class="filterbar" id="ref-search">
      <input type="search" name="q" placeholder="Search: doubled die, wide AM, 1982...">
      <button type="submit">Search</button>
    </form>
    <div id="ref-results"></div>
    <div class="card card-lesson">
      <h2>${esc(lesson.title)}</h2>
      <p class="why">${esc(lesson.why)}</p>
      <div class="two-col">
        <div><h4>Machine doubling</h4><ul>${lesson.machine_doubling.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
        <div><h4>True doubled die</h4><ul>${lesson.true_doubled_die.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      </div>
      <p class="test"><strong>The test:</strong> ${esc(lesson.test)}</p>
    </div>
    <div class="card">
      <h2>${esc(damage.title)}</h2>
      ${damage.items.map((i) => `<div class="finding finding-warn"><strong>${esc(i.name)}</strong><p>${esc(i.why)}</p></div>`).join("")}
    </div>`);

  const results = document.getElementById("ref-results");
  const show = (list) => {
    results.innerHTML = `<p class="muted">${list.length} variet${list.length === 1 ? "y" : "ies"}</p>` +
      list.map((v) => `
        <article class="variety variety-${v.severity}">
          <header><h3>${esc(v.name)}</h3><span class="sev sev-${v.severity}">${v.severity}</span></header>
          <p class="variety-type">${esc(v.denomination)} &middot; ${esc(v.type)} &middot; <em>${esc(v.where)}</em></p>
          <p><strong>Look for:</strong> ${esc(v.look_for)}</p>
          <p class="mag">Magnification: ${esc(v.magnification)}</p>
          ${v.beware ? `<p class="beware"><strong>Beware:</strong> ${esc(v.beware)}</p>` : ""}
          ${v.value_note ? `<p class="value"><strong>Value:</strong> ${esc(v.value_note)}</p>` : ""}
        </article>`).join("");
  };
  show(V.allVarieties());
  document.getElementById("ref-search").onsubmit = (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get("q");
    show(q ? V.search(q) : V.allVarieties());
  };
}

// --- backup --------------------------------------------------------------

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function viewData() {
  render(`
    <h1>Backup &amp; restore</h1>
    <div class="card">
      <p class="muted">Your collection lives only on this device. Nothing is uploaded
        anywhere. If you lose or wipe the phone without a backup, the data is gone
        &mdash; so export regularly.</p>
      <div class="form-actions">
        <button class="btn-primary" id="export-json">Export backup (with photos)</button>
        <button class="btn-ghost" id="export-csv">Export CSV (spreadsheet)</button>
      </div>
    </div>
    <div class="card">
      <h2>Restore from a backup</h2>
      <p class="muted">Coins are added alongside what is already here &mdash; an import
        never overwrites or deletes existing coins.</p>
      <input type="file" id="import-file" accept="application/json,.json">
      <p id="import-status" class="muted"></p>
    </div>`);

  document.getElementById("export-json").onclick = async (e) => {
    e.target.textContent = "Exporting...";
    const data = await DB.exportAll();
    download(`coin-checker-backup-${new Date().toISOString().slice(0, 10)}.json`,
      new Blob([JSON.stringify(data)], { type: "application/json" }));
    e.target.textContent = "Export backup (with photos)";
  };

  document.getElementById("export-csv").onclick = async () => {
    const coins = await DB.listCoins();
    const counts = {};
    for (const c of coins) counts[c.id] = (await DB.getPhotos(c.id)).length;
    download("coin-collection.csv", new Blob([DB.toCsv(coins, counts)], { type: "text/csv" }));
  };

  document.getElementById("import-file").onchange = async (e) => {
    const status = document.getElementById("import-status");
    const file = e.target.files[0];
    if (!file) return;
    status.textContent = "Importing...";
    try {
      const added = await DB.importAll(JSON.parse(await file.text()), {
        makeThumb: Img.makeThumbnail,
      });
      status.textContent = `Imported ${added} coin(s).`;
    } catch (err) {
      status.textContent = "Import failed: " + err.message;
    }
  };
}

// --- router --------------------------------------------------------------

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, "").split("?")[0];
  const [part, arg] = hash.split("/");
  return { part, arg };
}

function route() {
  const { part, arg } = parseRoute();
  if (part === "new") return viewNew();
  if (part === "coin" && arg) return viewCoin(Number(arg));
  if (part === "scope" && arg) return viewScope(Number(arg));
  if (part === "reference") return viewReference();
  if (part === "data") return viewData();
  return viewList();
}

async function boot() {
  const [specs, varieties, errors] = await Promise.all(
    ["us_specs.json", "varieties.json", "error_types.json"].map((f) =>
      fetch(`data/${f}`).then((r) => r.json())
    )
  );
  Specs.initSpecs(specs);
  V.initVarieties(varieties, errors);
  await DB.openDb();

  window.addEventListener("hashchange", route);
  route();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

boot().catch((err) => {
  view.innerHTML = `<div class="empty"><h2>Failed to start</h2><p>${esc(err.message)}</p></div>`;
});
