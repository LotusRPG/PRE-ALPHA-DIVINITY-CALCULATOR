/**
 * app.js — Divinity Config Builder application core.
 *
 * Public API (APP.*):
 *   navigate(sectionId)
 *   filterTable(tableId, query)
 *
 *   downloadAllJson()                         — export all loaded sections as one JSON file
 *   importJson(file)                          — restore all sections from a JSON snapshot
 *   pickDirectory()                           — open directory picker for auto-save (Chrome/Edge)
 *   setAutoSaveInterval(minutes)              — 0 = disabled
 *   setAutoSaveFormat(format)                 — 'yaml' | 'json'
 *   autoSaveNow()                             — trigger immediate save
 *
 *   updateField(sid, path, value)           — edit any scalar
 *   updateFormulaExpr(sid, path, value)     — edit formula + recalc preview
 *   setFormulaMode(sid, mode)               — switch FACTOR/CUSTOM/LEGACY
 *   setPreviewDmg(v) / setPreviewDef(v)     — update custom preview row
 *   recalcFormulaPreview()                  — refresh preview cells in-place
 *
 *   updateJsonField(sid, path, jsonText)    — parse JSON, write array/object back to STATE
 *
 *   addEntry(sid, key, template)            — add top-level entry, re-renders
 *   removeEntry(sid, key)                   — delete top-level entry
 *   renameEntry(sid, oldKey, newKey)        — rename top-level key
 *
 *   download(sectionId)                     — serialize STATE → YAML download
 *   onDragOver / onDragLeave / onDrop / onFileInput
 */

'use strict';

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

/** Parsed YAML per section. */
const STATE = { loaded: {}, errors: {} };

/** Persistent search queries per section — survives re-renders. */
const SECTION_SEARCH = {};

/** Build preview state — persists across renders. */
const BUILD_STATE = {
  playerLevel: 1,
  slots: {
    weapon:  { fname: '', level: 1, gems: ['','',''], gemLevels: [1,1,1], essence: '', essenceLevel: 1, rune: '', runeLevel: 1 },
    offhand: { fname: '', level: 1, gems: ['','',''], gemLevels: [1,1,1], essence: '', essenceLevel: 1, rune: '', runeLevel: 1 },
    helmet:  { fname: '', level: 1, gems: ['','',''], gemLevels: [1,1,1], essence: '', essenceLevel: 1, rune: '', runeLevel: 1 },
    chest:   { fname: '', level: 1, gems: ['','',''], gemLevels: [1,1,1], essence: '', essenceLevel: 1, rune: '', runeLevel: 1 },
    legs:    { fname: '', level: 1, gems: ['','',''], gemLevels: [1,1,1], essence: '', essenceLevel: 1, rune: '', runeLevel: 1 },
    boots:   { fname: '', level: 1, gems: ['','',''], gemLevels: [1,1,1], essence: '', essenceLevel: 1, rune: '', runeLevel: 1 },
  },
};

/**
 * Keys added during the last sync operation (per section).
 * Used by renderers to show a "new" badge on freshly synced entries.
 * @type {Record<string, Set<string>>}
 */
const SYNCED_NEW = {};

/**
 * Custom formula-preview row values (persisted across formula re-renders).
 */
const FORMULA_PREVIEW = { dmgIn: 100, defIn: 50 };

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => {
    if (typeof o[k] !== 'object' || o[k] === null) o[k] = {};
    return o[k];
  }, obj);
  target[last] = value;
}

/** Count top-level object entries (for nav badges). */
function countEntries(data) {
  if (!data || typeof data !== 'object') return 0;
  if (data._multiFile) return Object.keys(data.files || {}).length;
  return Object.values(data).filter(v => v && typeof v === 'object').length;
}

/**
 * Per-section YAML slim-down: strip unnecessary fields after loading single-file sections.
 * Keeps only what Builder needs, reducing JSON export size significantly.
 */
const SECTION_SLIM = {
  fabledAttributes(data) {
    const out = {};
    Object.entries(data).forEach(([k, v]) => {
      if (v && typeof v === 'object')
        out[k] = { display: v.display ?? k, max: v.max ?? '', 'icon-lore': v['icon-lore'] ?? [] };
    });
    return out;
  },
};

/**
 * Per-section YAML slim-down for multiFile sections (applied per loaded file).
 */
const SECTION_FILE_SLIM = {
  skills(fileData) {
    const out = {};
    Object.entries(fileData).forEach(([k, v]) => {
      if (v && typeof v === 'object') out[k] = { name: v.name ?? k };
    });
    return out;
  },
  classes(fileData) {
    const out = {};
    Object.entries(fileData).forEach(([k, v]) => {
      if (v && typeof v === 'object') out[k] = { name: v.name ?? k };
    });
    return out;
  },
};

/** Load one YAML file into a multiFile section's files map. */
async function loadMultiFile(sid, file) {
  if (!STATE.loaded[sid] || !STATE.loaded[sid]._multiFile) {
    STATE.loaded[sid] = { _multiFile: true, files: {} };
  }
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => {
      try {
        let parsed = YAML.parse(e.target.result);
        if (SECTION_FILE_SLIM[sid]) parsed = SECTION_FILE_SLIM[sid](parsed);
        STATE.loaded[sid].files[file.name] = parsed;
        delete STATE.errors[sid];
      } catch (err) {
        STATE.errors[sid] = err.message;
      }
      resolve();
    };
    r.onerror = () => { STATE.errors[sid] = 'Could not read file.'; resolve(); };
    r.readAsText(file, 'UTF-8');
  });
}

/** Coerce value to match the existing type at path. */
function coerce(existing, value) {
  if (typeof existing === 'boolean') return Boolean(value);
  if (typeof existing === 'number')  { const n = Number(value); return isNaN(n) ? existing : n; }
  return value;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderSection(sectionId) {
  const content = document.getElementById('content');
  if (sectionId === 'load')     { content.innerHTML = buildLoadSection();     refreshAutoSaveStatus(); return; }
  if (sectionId === 'settings') { content.innerHTML = buildSettingsSection(); refreshAutoSaveStatus(); return; }

  // Save open/closed state of all keyed <details> before wiping the DOM
  const detailsOpen   = new Set();
  const detailsClosed = new Set();
  content.querySelectorAll('details[data-key]').forEach(el => {
    (el.open ? detailsOpen : detailsClosed).add(el.dataset.key);
  });

  const def = SCHEMA.sections[sectionId];
  if (!def) {
    content.innerHTML = `<div class="alert alert-error">Unknown section: ${sectionId}</div>`;
    return;
  }

  let html = `
    <div class="section-header">
      <div class="section-title">${def.icon} ${def.label}</div>
      ${def.description ? `<div class="section-desc">${def.description}</div>` : ''}
    </div>`;

  if (STATE.loaded[sectionId] && def.file) {
    const isMulti = !!def.multiFile;
    const dlBtn   = isMulti
      ? `<button class="btn-download" onclick="APP.igDownloadAll('${sectionId}')">⬇ Download all (ZIP)</button>`
      : `<button class="btn-download" onclick="APP.download('${sectionId}')">⬇ Download <code>${def.file.split('/').pop()}</code></button>`;
    html += `
      <div class="section-toolbar">
        <span class="toolbar-hint">✏️ Edit fields directly. Changes are in memory until downloaded.</span>
        ${dlBtn}
      </div>`;
  }

  if (!STATE.loaded[sectionId] && def.file) {
    const err = STATE.errors[sectionId];
    html += err
      ? `<div class="alert alert-error">❌ Load error: ${err}
           <div style="margin-top:10px">
             <button class="btn-setting" onclick="APP.createEmpty('${sectionId}')">✨ Start with empty file anyway</button>
           </div>
         </div>`
      : `<div class="empty-state">
           <div style="font-size:36px;margin-bottom:12px">📂</div>
           <div>Load <code>${def.file}</code> in <b>Load Files</b> first.</div>
           <div style="margin-top:14px;color:var(--muted);font-size:13px">— or —</div>
           <button class="btn-setting" style="margin-top:10px"
                   onclick="APP.createEmpty('${sectionId}')">✨ Start with empty file</button>
         </div>`;
    content.innerHTML = html;
    return;
  }

  const rendererFn = RENDERERS[def.renderer];
  if (typeof rendererFn !== 'function') {
    html += `<div class="alert alert-error">Missing renderer: ${def.renderer}</div>`;
    content.innerHTML = html;
    return;
  }

  try {
    html += rendererFn(STATE.loaded[sectionId], sectionId);
  } catch (e) {
    html += `<div class="alert alert-error">❌ Render error: ${e.message}
      <pre style="margin-top:8px;font-size:11px">${e.stack}</pre></div>`;
  }

  content.innerHTML = html;

  // Inject search box for searchable sections
  if (def.searchable && STATE.loaded[sectionId]) {
    const toolbar = content.querySelector('.section-toolbar');
    if (toolbar) {
      const q = SECTION_SEARCH[sectionId] ?? '';
      const searchEl = document.createElement('div');
      searchEl.style.cssText = 'margin-left:auto;display:flex;align-items:center;gap:6px';
      searchEl.innerHTML = `<input id="section-search-${sectionId}" type="search" placeholder="🔍 Search…"
        value="${q.replace(/"/g, '&quot;')}"
        style="padding:4px 8px;border-radius:4px;border:1px solid #444;background:#1a1a1a;color:#ddd;font-size:13px;width:180px"
        oninput="APP.filterSection('${sectionId}',this.value)">`;
      toolbar.appendChild(searchEl);
      if (q) applyCardFilter(content, q);
    }
  }

  // Restore open/closed state: override defaults only for elements seen before this render
  if (detailsOpen.size || detailsClosed.size) {
    content.querySelectorAll('details[data-key]').forEach(el => {
      const key = el.dataset.key;
      if (detailsOpen.has(key))        el.open = true;
      else if (detailsClosed.has(key)) el.open = false;
      // New elements (not seen before) keep their default from the rendered HTML
    });
  }
}

/** Filter .item-card elements by text content match (case-insensitive). */
function applyCardFilter(root, query) {
  const q = query.trim().toLowerCase();
  root.querySelectorAll('.item-card').forEach(card => {
    if (!q) {
      card.style.display = '';
    } else {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(q) ? '' : 'none';
    }
  });
}

// ---------------------------------------------------------------------------
// Load section
// ---------------------------------------------------------------------------

function buildLoadSection() {
  const defs = Object.values(SCHEMA.sections).filter(s => s.id !== 'load' && s.file);

  const zones = defs.map(def => {
    const isMulti = !!def.multiFile;
    const loadedRaw = STATE.loaded[def.id];
    const fileCount = isMulti && loadedRaw?._multiFile ? Object.keys(loadedRaw.files).length : 0;
    const isLoaded  = isMulti ? fileCount > 0 : !!loadedRaw;
    const hasError  = !!STATE.errors[def.id];
    let statusText = '', statusClass = '';
    if (isLoaded && isMulti)    { statusText = `✅ ${fileCount} file(s)`; statusClass = 'loaded'; }
    else if (isLoaded)          { statusText = '✅ Loaded'; statusClass = 'loaded'; }
    else if (hasError)          { statusText = '❌ Error';  statusClass = 'error';  }

    const loadedFiles = isMulti && loadedRaw?._multiFile ? Object.keys(loadedRaw.files) : [];
    const fileChips   = loadedFiles.length
      ? `<div class="zone-loaded-files">${loadedFiles.map(f => `<span class="zone-file-chip">${f}</span>`).join('')}</div>`
      : '';
    const hintText = isMulti ? `${def.file} (folder — drop files)` : def.file;

    return `
      <div class="file-drop-zone-wrap">
        <label class="file-drop-zone" id="zone-${def.id}"
               ondragover="APP.onDragOver(event,'${def.id}')"
               ondragleave="APP.onDragLeave(event,'${def.id}')"
               ondrop="APP.onDrop(event,'${def.id}')">
          <input type="file" accept=".yml,.yaml"${isMulti ? ' multiple' : ''}
                 onchange="APP.onFileInput(event,'${def.id}')">
          <div class="file-drop-zone__label">
            <span style="font-size:22px">${def.icon}</span>
            <div>
              <div class="file-drop-zone__name">${def.label}</div>
              <div class="file-drop-zone__hint">${hintText}</div>
            </div>
            <span class="file-drop-zone__status ${statusClass}">${statusText}</span>
          </div>
        </label>
        ${fileChips}
        ${!isLoaded ? `<button class="btn-create-empty" title="Start editing without a file"
          onclick="APP.createEmpty('${def.id}');APP.navigate('${def.id}')">✨ Start empty</button>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="section-header">
      <div class="section-title">📂 Load Files</div>
      <div class="section-desc">
        Click a tile or drag-and-drop a YAML file onto it.
        All parsing is local — nothing is sent over the network.
      </div>
    </div>
    <div id="section-load">${zones}</div>`;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

let _activeSection = 'load';

function buildNav() {
  const nav = document.getElementById('nav');
  let html = `<div class="nav-logo">⚔️ Divinity Builder<span>config visualizer & editor</span></div>`;

  SCHEMA.groups.forEach(group => {
    html += `<div class="nav-group">${group.label}</div>`;
    group.sections.forEach(sid => {
      const def = SCHEMA.sections[sid];
      if (!def) return;
      const badge = def.badge !== false
        ? `<span class="nav-badge" id="badge-${sid}"></span>` : '';
      html += `
        <div class="nav-item" id="nav-${sid}" onclick="APP.navigate('${sid}')">
          <span class="nav-icon">${def.icon}</span>
          <span>${def.label}</span>
          ${badge}
        </div>`;
    });
  });

  nav.innerHTML = html;
  updateActiveNav(_activeSection);
}

function updateActiveNav(sid) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`nav-${sid}`)?.classList.add('active');
}

function updateBadge(sid) {
  const el = document.getElementById(`badge-${sid}`);
  if (!el) return;
  const count = countEntries(STATE.loaded[sid]);
  el.textContent = count > 0 ? count : '';
}

// ---------------------------------------------------------------------------
// File loading
// ---------------------------------------------------------------------------

function parseAndStore(sid, text) {
  try {
    let parsed = YAML.parse(text);
    if (SECTION_SLIM[sid]) parsed = SECTION_SLIM[sid](parsed);
    STATE.loaded[sid] = parsed;
    delete STATE.errors[sid];
  } catch (e) {
    delete STATE.loaded[sid];
    STATE.errors[sid] = e.message;
  }
}

function readFile(file, sid) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload  = e => { parseAndStore(sid, e.target.result); resolve(); };
    r.onerror = ()  => { STATE.errors[sid] = 'Could not read file.'; delete STATE.loaded[sid]; resolve(); };
    r.readAsText(file, 'UTF-8');
  });
}

function afterLoad(sid) {
  updateBadge(sid);
  if (_activeSection === 'load') {
    renderSection('load');
  } else if (_activeSection === sid) {
    renderSection(sid);
  } else {
    // Silently refresh zone status indicator
    const statusEl = document.querySelector(`#zone-${sid} .file-drop-zone__status`);
    if (statusEl) {
      const raw = STATE.loaded[sid];
      const def = SCHEMA.sections[sid];
      let text = '', cls = '';
      if (raw && def?.multiFile) {
        const n = Object.keys(raw.files || {}).length;
        text = `✅ ${n} file(s)`; cls = 'loaded';
      } else if (raw) {
        text = '✅ Loaded'; cls = 'loaded';
      } else if (STATE.errors[sid]) {
        text = '❌ Error';  cls = 'error';
      }
      statusEl.textContent = text;
      statusEl.className   = `file-drop-zone__status ${cls}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const APP = {

  // ---- Navigation ----

  navigate(sid) {
    _activeSection = sid;
    updateActiveNav(sid);
    renderSection(sid);
    document.getElementById('content').scrollTop = 0;
  },

  // ---- Section card search ----

  filterSection(sectionId, query) {
    SECTION_SEARCH[sectionId] = query;
    applyCardFilter(document.getElementById('content'), query);
  },

  // ---- Table search ----

  filterTable(tableId, query) {
    const tbl = document.getElementById(tableId);
    if (!tbl) return;
    const q = query.trim().toLowerCase();
    tbl.querySelectorAll('tbody tr').forEach(row => {
      row.style.display = (!q || row.textContent.toLowerCase().includes(q)) ? '' : 'none';
    });
  },

  // ---- Scalar field editing ----

  /**
   * Checkbox that updates STATE and immediately patches the adjacent badge span
   * without re-rendering the whole section.
   *
   * @param {string}  sid
   * @param {string}  path      Dot-path to the boolean field
   * @param {boolean} checked
   * @param {string}  badgeId   DOM id of the <span> badge to patch
   * @param {string}  type      'enabled' | 'percent-pen'
   */
  updateCheckbox(sid, path, checked, badgeId, type) {
    // Write value to STATE
    const data = STATE.loaded[sid];
    if (data) setPath(data, path, checked);

    // Patch badge in-place — no re-render needed
    const el = document.getElementById(badgeId);
    if (!el) return;

    if (type === 'enabled') {
      el.className   = `badge ${checked ? 'badge-green' : 'badge-red'}`;
      el.textContent = checked ? 'enabled' : 'disabled';
    } else if (type === 'percent-pen') {
      el.className   = `badge ${checked ? 'badge-blue' : 'badge-yellow'}`;
      el.textContent = checked ? '% percent' : 'flat';
    }
  },

  updateField(sid, path, value) {
    const data = STATE.loaded[sid];
    if (!data) return;
    const existing = getPath(data, path);
    setPath(data, path, coerce(existing, value));

    // Live-update mc-preview span for format fields
    if (path.endsWith('.format') || path.endsWith('-formula')) {
      document.querySelectorAll('.mc-preview--live').forEach(el => {
        const inp = el.previousElementSibling;
        if (inp?.classList.contains('edit-input--format') && inp.value === String(value)) {
          el.innerHTML = mc.toHtml(String(value));
        }
      });
    }
  },

  // ---- Formula ----

  /**
   * Update formula text in STATE and recalculate preview in-place.
   */
  updateFormulaExpr(sid, path, value) {
    this.updateField(sid, path, value);
    this.recalcFormulaPreview();
  },

  /**
   * Switch formula mode (FACTOR / CUSTOM / LEGACY) and re-render formula section.
   */
  setFormulaMode(sid, mode) {
    const data = STATE.loaded[sid];
    if (!data) return;
    const combat = data.combat || data;
    combat['defense-formula'] = mode;
    combat['legacy-combat']   = mode === 'LEGACY';
    renderSection(sid);
  },

  setPreviewDmg(v) {
    FORMULA_PREVIEW.dmgIn = v;
    this.recalcFormulaPreview();
  },

  setPreviewDef(v) {
    FORMULA_PREVIEW.defIn = v;
    this.recalcFormulaPreview();
  },

  /**
   * Recalculate all formula preview cells without touching the inputs.
   */
  recalcFormulaPreview() {
    const data    = STATE.loaded['formula'];
    if (!data) return;
    const combat  = data.combat || data;
    const mode    = String(combat['defense-formula'] || 'FACTOR').toUpperCase();
    const formula = combat['custom-defense-formula'] || 'damage*(25/(25+defense))';

    // Fixed rows (damage=100, defense varies per case)
    SCHEMA.formulaPreviewCases.forEach((c, i) => {
      const result = evalForMode(mode, formula, c);
      const outEl  = document.getElementById(`preview-out-${i}`);
      const redEl  = document.getElementById(`preview-red-${i}`);
      if (!outEl) return;
      const dmgOut    = result !== null ? result.toFixed(2) : '?';
      const reduction = result !== null ? ((1 - result / c.damage) * 100).toFixed(1) + '%' : '?';
      outEl.textContent = dmgOut;
      outEl.style.color = result !== null && result < c.damage / 2 ? 'var(--green)' : 'var(--red)';
      if (redEl) redEl.textContent = reduction;
    });

    // Custom editable row — reads current input values
    const dmgIn = FORMULA_PREVIEW.dmgIn;
    const defIn = FORMULA_PREVIEW.defIn;
    const res   = evalForMode(mode, formula, { damage: dmgIn, defense: defIn, toughness: 0 });
    const outEl = document.getElementById('custom-dmg-out');
    const redEl = document.getElementById('custom-reduction');
    if (!outEl) return;
    outEl.textContent = res !== null ? res.toFixed(2) : '?';
    outEl.style.color = res !== null && res < dmgIn / 2 ? 'var(--green)' : 'var(--red)';
    if (redEl) redEl.textContent = res !== null ? ((1 - res / dmgIn) * 100).toFixed(1) + '%' : '?';
  },

  // ---- List editors ----

  addListItem(sid, path, value) {
    if (!value || !value.trim()) return;
    const data = STATE.loaded[sid];
    if (!data) return;
    let arr = getPath(data, path);
    if (!Array.isArray(arr)) { arr = []; setPath(data, path, arr); }
    arr.push(value.trim());
    renderSection(_activeSection);
  },

  addListItemFromInput(sid, path, inputId) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    this.addListItem(sid, path, inp.value);
    inp.value = '';
  },

  removeListItem(sid, path, idx) {
    const data = STATE.loaded[sid];
    if (!data) return;
    const arr = getPath(data, path);
    if (!Array.isArray(arr)) return;
    arr.splice(idx, 1);
    renderSection(_activeSection);
  },

  updateListItem(sid, path, idx, value) {
    const data = STATE.loaded[sid];
    if (!data) return;
    const arr = getPath(data, path);
    if (!Array.isArray(arr)) return;
    arr[idx] = value;
    // No re-render needed — input already shows updated value
  },

  // ---- Key-value editors ----

  addKvPairFromInputs(sid, path, keyInputId, valInputId, numVal) {
    const kEl = document.getElementById(keyInputId);
    const vEl = document.getElementById(valInputId);
    if (!kEl || !vEl || !kEl.value.trim()) return;
    const data = STATE.loaded[sid];
    if (!data) return;
    let obj = getPath(data, path);
    if (!obj || typeof obj !== 'object') { obj = {}; setPath(data, path, obj); }
    obj[kEl.value.trim()] = numVal ? (parseFloat(vEl.value) || 0) : vEl.value;
    kEl.value = '';
    vEl.value = '';
    renderSection(_activeSection);
  },

  removeKvPair(sid, path, key) {
    const data = STATE.loaded[sid];
    if (!data) return;
    const obj = getPath(data, path);
    if (obj && typeof obj === 'object') { delete obj[key]; renderSection(_activeSection); }
  },

  renameKvKey(sid, path, oldKey, newKey) {
    if (!newKey.trim() || newKey === oldKey) return;
    const data = STATE.loaded[sid];
    if (!data) return;
    const obj = getPath(data, path);
    if (!obj || typeof obj !== 'object') return;
    obj[newKey.trim()] = obj[oldKey];
    delete obj[oldKey];
    renderSection(_activeSection);
  },

  updateKvVal(sid, path, key, value) {
    const data = STATE.loaded[sid];
    if (!data) return;
    const obj = getPath(data, path);
    if (obj && typeof obj === 'object') obj[key] = value;
  },

  // ---- JSON textarea editor ----

  updateJsonField(sid, path, jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      setPath(STATE.loaded[sid], path, parsed);
    } catch (_) { /* invalid JSON — ignore, user is still editing */ }
  },

  /** Line-by-line textarea → string array. Empty lines are filtered out. */
  updateLineArray(sid, path, text) {
    const arr = text.split('\n').map(s => s.trim()).filter(Boolean);
    setPath(STATE.loaded[sid], path, arr);
  },

  // ---- Entry management (top-level keys) ----

  /**
   * Add a new top-level entry. Re-renders.
   * For damage types: also auto-creates matching pen + dmgbuff entries.
   * For defense types: also auto-creates matching defbuff entry.
   */
  addEntry(sid, key, template) {
    if (!STATE.loaded[sid]) {
      // Auto-initialize with empty object so Add button works without loading a file
      const def = SCHEMA.sections[sid];
      if (!def || def.multiFile) return;
      STATE.loaded[sid] = {};
      delete STATE.errors[sid];
    }
    const data = STATE.loaded[sid];

    // Ensure unique key
    let uniqueKey = key;
    let i = 2;
    while (Object.prototype.hasOwnProperty.call(data, uniqueKey)) {
      uniqueKey = `${key}_${i++}`;
    }
    data[uniqueKey] = JSON.parse(JSON.stringify(template)); // deep clone

    updateBadge(sid);
    renderSection(_activeSection === sid ? sid : _activeSection);
  },

  /**
   * Initialize a section with a sensible empty default — no file needed.
   */
  createEmpty(sid) {
    const def = SCHEMA.sections[sid];
    if (def?.multiFile) {
      STATE.loaded[sid] = { _multiFile: true, files: {} };
      delete STATE.errors[sid];
      updateBadge(sid);
      renderSection(sid);
      return;
    }
    const DEFAULTS = {
      formula:     { 'defense-formula': 'FACTOR', 'custom-defense-formula': 'damage*(25/(25+defense))', 'legacy-combat': false },
      general:     {},
      damage:      {},
      defense:     {},
      penetration: {},
      dmgbuff:     {},
      defbuff:     {},
    };
    if (!DEFAULTS[sid]) return;
    STATE.loaded[sid] = JSON.parse(JSON.stringify(DEFAULTS[sid]));
    delete STATE.errors[sid];
    updateBadge(sid);
    renderSection(sid);
  },

  // ---- Build Preview ----

  buildSetSlot(slot, fname) {
    if (!BUILD_STATE.slots[slot]) return;
    BUILD_STATE.slots[slot].fname = fname;
    if (_activeSection === 'build') renderSection('build');
  },

  buildSetLevel(slot, level) {
    if (!BUILD_STATE.slots[slot]) return;
    BUILD_STATE.slots[slot].level = Math.max(1, +level || 1);
    if (_activeSection === 'build') renderSection('build');
  },

  buildSetGem(slot, idx, fname) {
    if (!BUILD_STATE.slots[slot]) return;
    BUILD_STATE.slots[slot].gems[idx] = fname;
    if (_activeSection === 'build') renderSection('build');
  },

  buildSetGemLevel(slot, idx, level) {
    if (!BUILD_STATE.slots[slot]) return;
    BUILD_STATE.slots[slot].gemLevels[idx] = Math.max(1, +level || 1);
    if (_activeSection === 'build') renderSection('build');
  },

  buildSetEssence(slot, fname) {
    if (!BUILD_STATE.slots[slot]) return;
    BUILD_STATE.slots[slot].essence = fname;
    if (_activeSection === 'build') renderSection('build');
  },

  buildSetEssenceLevel(slot, level) {
    if (!BUILD_STATE.slots[slot]) return;
    BUILD_STATE.slots[slot].essenceLevel = Math.max(1, +level || 1);
    if (_activeSection === 'build') renderSection('build');
  },

  buildSetRune(slot, fname) {
    if (!BUILD_STATE.slots[slot]) return;
    BUILD_STATE.slots[slot].rune = fname;
    if (_activeSection === 'build') renderSection('build');
  },

  buildSetRuneLevel(slot, level) {
    if (!BUILD_STATE.slots[slot]) return;
    BUILD_STATE.slots[slot].runeLevel = Math.max(1, +level || 1);
    if (_activeSection === 'build') renderSection('build');
  },

  buildSetPlayerLevel(level) {
    BUILD_STATE.playerLevel = Math.max(1, +level || 1);
    if (_activeSection === 'build') renderSection('build');
  },

  // ---- Entries ----

  removeEntry(sid, key) {
    const data = STATE.loaded[sid];
    if (!data) return;
    delete data[key];
    updateBadge(sid);
    renderSection(_activeSection);
  },

  /**
   * Rename a top-level key. Re-renders so all edit-path attributes are updated.
   */
  renameEntry(sid, oldKey, newKey) {
    if (!newKey || newKey === oldKey) return;
    const data = STATE.loaded[sid];
    if (!data) return;
    if (Object.prototype.hasOwnProperty.call(data, newKey)) {
      alert(`Key "${newKey}" already exists.`);
      renderSection(_activeSection); // reset input
      return;
    }
    // Rebuild object to preserve insertion order at same position
    const rebuilt = {};
    for (const [k, v] of Object.entries(data)) {
      rebuilt[k === oldKey ? newKey : k] = v;
    }
    Object.keys(data).forEach(k => delete data[k]);
    Object.assign(data, rebuilt);
    renderSection(_activeSection);
  },

  // ---- Download ----

  download(sid) {
    const data = STATE.loaded[sid];
    const def  = SCHEMA.sections[sid];
    if (!data || !def?.file) return;
    if (def.multiFile && data._multiFile) {
      this.igDownloadAll(sid);
      return;
    }
    const blob = new Blob([YAML.stringify(data)], { type: 'text/yaml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: def.file.split('/').pop() });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // ---- Drag-and-drop / file input ----

  onDragOver(event, sid) {
    event.preventDefault();
    document.getElementById(`zone-${sid}`)?.classList.add('drag-over');
  },

  onDragLeave(event, sid) {
    document.getElementById(`zone-${sid}`)?.classList.remove('drag-over');
  },

  async onDrop(event, sid) {
    event.preventDefault();
    document.getElementById(`zone-${sid}`)?.classList.remove('drag-over');
    const def = SCHEMA.sections[sid];
    if (def?.multiFile) {
      const files = Array.from(event.dataTransfer.files).filter(f => /\.ya?ml$/i.test(f.name));
      for (const f of files) await loadMultiFile(sid, f);
      updateBadge(sid);
      afterLoad(sid);
      return;
    }
    const file = event.dataTransfer.files[0];
    if (file) { await readFile(file, sid); afterLoad(sid); }
  },

  async onFileInput(event, sid) {
    const def = SCHEMA.sections[sid];
    if (def?.multiFile) {
      const files = Array.from(event.target.files);
      for (const f of files) await loadMultiFile(sid, f);
      updateBadge(sid);
      afterLoad(sid);
      return;
    }
    const file = event.target.files[0];
    if (file) { await readFile(file, sid); afterLoad(sid); }
  },

  // ---- Multi-file (ig*) methods ----

  igUpdateField(sid, fname, path, value) {
    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname]) return;
    const existing = getPath(files[fname], path);
    setPath(files[fname], path, coerce(existing, value));
  },

  igUpdateJson(sid, fname, path, jsonText) {
    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname]) return;
    try { setPath(files[fname], path, JSON.parse(jsonText)); } catch (_) {}
  },

  igToggleFlag(sid, fname, flag) {
    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname]) return;
    const file  = files[fname];
    let flags = getPath(file, 'item-flags');
    if (!Array.isArray(flags)) flags = [];
    const idx = flags.indexOf(flag);
    if (idx === -1) flags.push(flag);
    else            flags.splice(idx, 1);
    setPath(file, 'item-flags', flags);
    renderSection(_activeSection);
  },

  /** Line-by-line textarea → string array for item-gen files. */
  igUpdateLineArray(sid, fname, path, text) {
    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname]) return;
    const arr = text.split('\n').map(s => s.trim()).filter(Boolean);
    setPath(files[fname], path, arr);
  },

  /** Line-by-line "key value" textarea → object for item-gen files. */
  igUpdateLineKv(sid, fname, path, text) {
    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname]) return;
    const obj = {};
    text.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
      const idx = line.indexOf(' ');
      if (idx === -1) obj[line] = '';
      else obj[line.slice(0, idx)] = line.slice(idx + 1).trim();
    });
    setPath(files[fname], path, obj);
  },

  /** Update a single key inside a type-picker object (ammo-types / hand-types). */
  igUpdateTypeWeight(sid, fname, path, typeKey, weight) {
    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname]) return;
    const file = files[fname];
    let obj = getPath(file, path);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      setPath(file, path, {});
      obj = getPath(file, path);
    }
    obj[typeKey] = weight;
  },

  /* ── Bonus entry helpers ─────────────────────────────────── */

  /** Remove a single key from an object at path inside an ig file. */
  igBonusRemoveKey(sid, fname, path, key) {
    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname]) return;
    const obj = getPath(files[fname], path);
    if (obj && typeof obj === 'object') {
      delete obj[key];
      renderSection(_activeSection);
    }
  },

  /** Add a key with a default value to an object at path inside an ig file. */
  igBonusAddKey(sid, fname, path, key, defaultVal = 1) {
    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname]) return;
    const file = files[fname];
    let obj = getPath(file, path);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      setPath(file, path, {});
      obj = getPath(file, path);
    }
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      obj[key] = defaultVal;
    }
    renderSection(_activeSection);
  },

  /** Add a blank entry to one of the 3 bonus categories (material-modifiers / material / class). */
  igBonusAddEntry(sid, fname, bonusCat) {
    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname]) return;
    const file = files[fname];
    const path = `generator.bonuses.${bonusCat}`;
    let cat = getPath(file, path);
    if (!cat || typeof cat !== 'object' || Array.isArray(cat)) {
      setPath(file, path, {});
      cat = getPath(file, path);
    }
    const key = 'new-entry-' + Date.now();
    cat[key] = {};
    renderSection(_activeSection);
  },

  /** Remove a named entry from a bonus category. */
  igBonusRemoveEntry(sid, fname, bonusCat, key) {
    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname]) return;
    const cat = getPath(files[fname], `generator.bonuses.${bonusCat}`);
    if (cat && typeof cat === 'object') {
      delete cat[key];
      renderSection(_activeSection);
    }
  },

  /** Rename a bonus entry key, preserving insertion order. */
  igBonusRenameEntry(sid, fname, bonusCat, oldKey, newKey) {
    if (oldKey === newKey || !newKey) return;
    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname]) return;
    const path = `generator.bonuses.${bonusCat}`;
    const cat  = getPath(files[fname], path);
    if (!cat || typeof cat !== 'object') return;
    if (Object.prototype.hasOwnProperty.call(cat, newKey)) return; // already exists
    const reordered = {};
    Object.keys(cat).forEach(k => { reordered[k === oldKey ? newKey : k] = cat[k]; });
    setPath(files[fname], path, reordered);
    renderSection(_activeSection);
  },

  /** Add a new blank skill entry to generator.skills.list (or any skills path). */
  igAddSkill(sid, fname, basePath) {
    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname]) return;
    const file    = files[fname];
    const listPath = `${basePath}.list`;
    let list = getPath(file, listPath);
    if (!list || typeof list !== 'object') { setPath(file, listPath, {}); list = getPath(file, listPath); }
    const key = 'new-skill-' + Date.now();
    list[key] = { chance: 0, 'min-level': 1, 'max-level': 1, 'lore-format': [] };
    renderSection(_activeSection);
  },

  /** Remove a skill entry from skills.list. */
  igRemoveSkill(sid, fname, listPath, key) {
    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname]) return;
    const list = getPath(files[fname], listPath);
    if (list && Object.prototype.hasOwnProperty.call(list, key)) {
      delete list[key];
      renderSection(_activeSection);
    }
  },

  /** Rename a skill key inside skills.list. */
  igRenameSkill(sid, fname, listPath, oldKey, newKey) {
    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname] || !newKey || newKey === oldKey) return;
    const list = getPath(files[fname], listPath);
    if (!list || !Object.prototype.hasOwnProperty.call(list, oldKey)) return;
    const val = list[oldKey];
    const reordered = {};
    Object.entries(list).forEach(([k, v]) => { reordered[k === oldKey ? newKey : k] = v; });
    setPath(files[fname], listPath, reordered);
    renderSection(_activeSection);
  },

  // Drag state — readable by renderers.js for the ondragover inline check
  _igDragging: null,

  igToggleCollapse(sid, fname) {
    const d = STATE.loaded[sid];
    if (!d) return;
    if (!d._collapsed) d._collapsed = {};
    d._collapsed[fname] = !d._collapsed[fname];
    renderSection(_activeSection);
  },

  igCollapseAll(sid) {
    const d = STATE.loaded[sid];
    if (!d?._multiFile) return;
    d._collapsed = {};
    Object.keys(d.files || {}).forEach(fn => { d._collapsed[fn] = true; });
    renderSection(_activeSection);
  },

  igExpandAll(sid) {
    const d = STATE.loaded[sid];
    if (!d) return;
    d._collapsed = {};
    renderSection(_activeSection);
  },

  igDragStart(sid, fname, event) {
    // Only allow drag when the grab handle (⠿) is clicked — nothing else on the card should drag
    if (!event.target.closest('.ig-drag-handle')) {
      event.preventDefault();
      return;
    }
    this._igDragging = { sid, fname };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', fname);
    // Let the browser show the default drag ghost; dim the card slightly
    setTimeout(() => {
      event.target.style.opacity = '0.5';
    }, 0);
    event.target.addEventListener('dragend', () => {
      event.target.style.opacity = '';
      this._igDragging = null;
    }, { once: true });
  },

  igDrop(sid, family, event) {
    event.preventDefault();
    document.querySelectorAll('.ig-folder-group').forEach(el => el.classList.remove('drag-over'));
    if (!this._igDragging || this._igDragging.sid !== sid) return;
    const fname = this._igDragging.fname;
    this._igDragging = null;
    clearTimeout(this._igFamilyTimer); // cancel any pending debounced rename
    const d = STATE.loaded[sid];
    if (!d?._multiFile) return;
    if (!d._families) d._families = {};
    if (family) {
      d._families[fname] = family;
    } else {
      delete d._families[fname];
    }
    renderSection(_activeSection);
  },

  igAddGroup(sid) {
    const name = prompt('New folder name:');
    if (!name || !name.trim()) return;
    const folderName = name.trim();
    const d = STATE.loaded[sid];
    if (!d?._multiFile) return;
    if (!d._emptyGroups) d._emptyGroups = [];
    const existing = new Set([
      ...Object.values(d._families || {}),
      ...d._emptyGroups,
    ]);
    if (existing.has(folderName)) return;
    d._emptyGroups.push(folderName);
    renderSection(_activeSection);
  },

  igRemoveGroup(sid, family) {
    const d = STATE.loaded[sid];
    if (!d?._multiFile) return;
    if (d._emptyGroups) d._emptyGroups = d._emptyGroups.filter(g => g !== family);
    renderSection(_activeSection);
  },

  igSetFamily(sid, fname, family) {
    const d = STATE.loaded[sid];
    if (!d?._multiFile) return;
    if (!d._families) d._families = {};
    if (family) {
      d._families[fname] = family;
    } else {
      delete d._families[fname];
    }
    // Debounce re-render so typing doesn't reset focus
    clearTimeout(this._igFamilyTimer);
    this._igFamilyTimer = setTimeout(() => {
      updateBadge(sid);
      renderSection(_activeSection);
    }, 600);
  },

  igDownload(sid, fname) {
    const d = STATE.loaded[sid];
    if (!d?.files?.[fname]) return;
    const blob = new Blob([YAML.stringify(d.files[fname])], { type: 'text/yaml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: fname });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /** Download one folder group: real subfolder via File System Access API, or ZIP fallback. */
  async igDownloadGroup(sid, family) {
    const d = STATE.loaded[sid];
    if (!d?._multiFile) return;
    const families = d._families || {};
    const files = Object.entries(d.files || {}).filter(([fn]) => (families[fn] ?? '') === family);
    if (!files.length) return;

    if (typeof window.showDirectoryPicker === 'function') {
      try {
        const rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        const targetDir  = family
          ? await rootHandle.getDirectoryHandle(family, { create: true })
          : rootHandle;
        for (const [fname, fdata] of files) {
          const fh = await targetDir.getFileHandle(fname, { create: true });
          const wr = await fh.createWritable();
          await wr.write(YAML.stringify(fdata));
          await wr.close();
        }
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        // fall through to ZIP
      }
    }

    const z = new ZipBuilder();
    for (const [fname, fdata] of files) {
      z.add(family ? `${family}/${fname}` : fname, YAML.stringify(fdata));
    }
    const blob = z.blob();
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url, download: family ? `${family}.zip` : 'items.zip',
    });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /** Download all files across all groups: full folder tree via File System Access API, or one ZIP. */
  async igDownloadAll(sid) {
    const d = STATE.loaded[sid];
    if (!d?._multiFile) return;
    const files = Object.entries(d.files || {});
    if (!files.length) return;
    const families = d._families || {};

    if (typeof window.showDirectoryPicker === 'function') {
      try {
        const rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        const dirCache   = {};
        for (const [fname, fdata] of files) {
          const family = families[fname] ?? '';
          let targetDir;
          if (family) {
            if (!dirCache[family]) dirCache[family] = await rootHandle.getDirectoryHandle(family, { create: true });
            targetDir = dirCache[family];
          } else {
            targetDir = rootHandle;
          }
          const fh = await targetDir.getFileHandle(fname, { create: true });
          const wr = await fh.createWritable();
          await wr.write(YAML.stringify(fdata));
          await wr.close();
        }
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        // fall through to ZIP
      }
    }

    const z = new ZipBuilder();
    for (const [fname, fdata] of files) {
      const family = families[fname] ?? '';
      z.add(family ? `${family}/${fname}` : fname, YAML.stringify(fdata));
    }
    const blob = z.blob();
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url, download: `${sid}-items.zip`,
    });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Resolve stat IDs from a source spec.
   * "section:<sid>"  — top-level loaded section (damage, defense, penetration, dmgbuff, defbuff)
   * "local:<path>"   — sub-object inside the given multiFile entry
   */
  _igResolveIds(source, sid, fname) {
    if (source.startsWith('section:')) {
      const secData = STATE.loaded[source.slice(8)];
      if (!secData || typeof secData !== 'object') return [];
      // multiFile section (e.g. skills): extract names from loaded files
      if (secData._multiFile) {
        const names = [];
        Object.values(secData.files || {}).forEach(fileData => {
          if (!fileData || typeof fileData !== 'object') return;
          const entry = Object.values(fileData).find(v => v && typeof v === 'object');
          if (entry?.name) names.push(entry.name);
          else {
            // fallback: use top-level key
            const key = Object.keys(fileData)[0];
            if (key) names.push(key);
          }
        });
        return names;
      }
      return Object.entries(secData)
        .filter(([, v]) => v && typeof v === 'object')
        .map(([k]) => k);
    } else if (source.startsWith('local:')) {
      const fileData  = STATE.loaded[sid]?.files?.[fname];
      const container = fileData ? getPath(fileData, source.slice(6)) : null;
      if (container && typeof container === 'object') {
        return Object.keys(container).filter(k => k !== 'lore-format');
      }
    }
    return [];
  },

  /**
   * Sync BOTH lore-format AND the stat pool from a loaded STATS section.
   *
   * loreFormatPath : dot-path to the lore-format array in the file
   * poolPath       : dot-path to the pool object (where stat entries live)
   * source         : "section:<sid>" | "local:<path>"
   * prefix         : placeholder prefix, e.g. "DAMAGE_", "ITEM_STAT_"
   *
   * Pool entries added with defaults: { chance:0, scale-by-level:1.0, min:0, max:0, flat-range:false, round:false }
   */
  igSync(sid, fname, loreFormatPath, poolPath, source, prefix) {
    const ids = this._igResolveIds(source, sid, fname);
    if (!ids.length) {
      alert('No entries found. Load the relevant stats section first (Damage, Defense, Penetration, etc.).');
      return;
    }
    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname]) return;
    const file = files[fname];

    // 1. Sync lore-format
    const format = ids.map(id => `%${prefix}${id.toUpperCase().replace(/-/g, '_')}%`);
    setPath(file, loreFormatPath, format);

    // 2. Sync pool — ensure every ID has an entry (don't overwrite existing ones)
    const STAT_DEFAULT = { chance: 0, 'scale-by-level': 1.0, min: 0, max: 0, 'flat-range': false, round: false };
    let pool = getPath(file, poolPath);
    if (!pool || typeof pool !== 'object') {
      setPath(file, poolPath, {});
      pool = getPath(file, poolPath);
    }
    ids.forEach(id => {
      // Normalize pool key to lowercase-underscore to avoid capitalization duplicates
      const poolKey = id.toLowerCase().replace(/[\s-]+/g, '_');
      if (!Object.prototype.hasOwnProperty.call(pool, poolKey)) {
        pool[poolKey] = JSON.parse(JSON.stringify(STAT_DEFAULT));
      }
    });

    renderSection(_activeSection);
  },

  /** Add a raw entry to any plain-object section (ammo, hand, etc.) without STATS-specific logic. */
  addRawEntry(sid, key, template) {
    key = key.trim();
    if (!key) return;
    const data = STATE.loaded[sid];
    if (!data || typeof data !== 'object') return;
    if (Object.prototype.hasOwnProperty.call(data, key)) { alert(`"${key}" already exists.`); return; }
    data[key] = JSON.parse(JSON.stringify(template));
    renderSection(_activeSection);
  },

  /** @deprecated use igSync instead */
  igSyncLoreFormat(sid, fname, path, source, prefix) {
    this.igSync(sid, fname, path, path.replace(/\.lore-format$/, '.list'), source, prefix);
  },

  /**
   * Sync socket lore-format AND pool for a single socket type (GEM / ESSENCE / RUNE).
   *
   * Reads unique `tier` values from all loaded files in `modSid` (gems / essences / runes).
   * - lore-format  → ['%SOCKET_GEM_COMMON%', '%SOCKET_GEM_RARE%', ...]
   * - pool entries → { common: { chance: 0 }, rare: { chance: 0 }, ... }
   *   (existing entries are not overwritten)
   */
  igSyncSocket(sid, fname, type, modSid) {
    const modData = STATE.loaded[modSid];
    if (!modData?._multiFile || !modData.files) {
      alert(`Load the ${modSid} section first so tier values can be read.`);
      return;
    }

    // Collect unique tier values from all files in the module
    const tiers = [...new Set(
      Object.values(modData.files)
        .map(f => f?.tier)
        .filter(Boolean)
        .map(String)
    )];

    if (!tiers.length) {
      alert(`No tier values found in loaded ${modSid} files.`);
      return;
    }

    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname]) return;
    const file = files[fname];

    const loreFormatPath = `generator.sockets.${type}.lore-format`;
    const poolPath       = `generator.sockets.${type}.list`;

    // 1. Sync lore-format
    const format = tiers.map(t => `%SOCKET_${type}_${t.toUpperCase().replace(/-/g, '_')}%`);
    setPath(file, loreFormatPath, format);

    // 2. Sync pool — add missing tiers with { chance: 0 }
    let pool = getPath(file, poolPath);
    if (!pool || typeof pool !== 'object') {
      setPath(file, poolPath, {});
      pool = getPath(file, poolPath);
    }
    tiers.forEach(t => {
      if (!Object.prototype.hasOwnProperty.call(pool, t)) {
        pool[t] = { chance: 0 };
      }
    });

    renderSection(_activeSection);
  },

  igRemoveFile(sid, fname) {
    const d = STATE.loaded[sid];
    if (!d?._multiFile) return;
    delete d.files[fname];
    if (d._families)  delete d._families[fname];
    if (d._collapsed) delete d._collapsed[fname];
    updateBadge(sid);
    renderSection(_activeSection);
  },

  /** Create a new file entry in a multiFile section, optionally from a template. */
  igAddNewFile(sid, fname, tplKey) {
    if (!fname || !fname.trim()) return;
    const name = /\.ya?ml$/i.test(fname.trim()) ? fname.trim() : fname.trim() + '.yml';
    const d = STATE.loaded[sid];
    if (!d?._multiFile) return;
    if (d.files[name]) { alert(`"${name}" already exists.`); return; }
    const tpl = (window.ITEM_TEMPLATES?.[sid]?.[tplKey]) ?? {};
    d.files[name] = JSON.parse(JSON.stringify(tpl));
    updateBadge(sid);
    renderSection(_activeSection);
  },

  /** Add a key to a nested object at containerPath inside a multiFile entry. */
  igAddToPath(sid, fname, containerPath, key, defaultValue) {
    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname]) return;
    let container = getPath(files[fname], containerPath);
    if (!container || typeof container !== 'object') {
      setPath(files[fname], containerPath, {});
      container = getPath(files[fname], containerPath);
    }
    const k = String(key).trim();
    if (!k) return;
    if (Object.prototype.hasOwnProperty.call(container, k)) { alert(`"${k}" already exists.`); return; }
    container[k] = defaultValue;
    renderSection(_activeSection);
  },

  /** Remove a key from a nested object at containerPath inside a multiFile entry. */
  igRemoveFromPath(sid, fname, containerPath, key) {
    const files = STATE.loaded[sid]?.files;
    if (!files?.[fname]) return;
    const container = getPath(files[fname], containerPath);
    if (container && typeof container === 'object') {
      delete container[String(key)];
      renderSection(_activeSection);
    }
  },

  /** Add a new element to a Set file's `elements` map. */
  igAddSetElement(sid, fname, inputId) {
    const input  = document.getElementById(inputId);
    const elemId = input?.value?.trim();
    if (!elemId) return;
    this.igAddToPath(sid, fname, 'elements', elemId, { materials: [], name: '' });
    if (input) input.value = '';
  },

  /** Add a new bonus tier to a Set file's `bonuses.by-elements-amount` map. */
  igAddBonusTier(sid, fname, inputId) {
    const input = document.getElementById(inputId);
    const cnt   = String(input?.value ?? '2').trim();
    if (!cnt) return;
    this.igAddToPath(sid, fname, 'bonuses.by-elements-amount', cnt, {
      lore: [], 'item-stats': {}, 'damage-types': {}, 'defense-types': {}, 'potion-effects': {},
    });
  },

  /** Add a new level to a Gem file's `bonuses-by-level` map. */
  igAddGemLevel(sid, fname, inputId) {
    const input = document.getElementById(inputId);
    const lvl   = String(input?.value ?? '1').trim();
    if (!lvl) return;
    this.igAddToPath(sid, fname, 'bonuses-by-level', lvl, {
      'item-stats': {}, 'damage-types': {}, 'defense-types': {}, skills: {},
    });
  },

  async onIgAddInput(event, sid) {
    const files = Array.from(event.target.files);
    for (const f of files) await loadMultiFile(sid, f);
    updateBadge(sid);
    renderSection(_activeSection);
  },

};

// ---------------------------------------------------------------------------
// Auto-save state
// ---------------------------------------------------------------------------

/**
 * Auto-save configuration (runtime). Interval and format are persisted
 * to localStorage; dirHandle cannot be serialized so it must be re-selected
 * each session.
 */
const AUTOSAVE = {
  interval:   0,        // minutes; 0 = disabled
  timer:      null,     // setInterval handle
  dirHandle:  null,     // FileSystemDirectoryHandle (File System Access API)
  dirName:    '',       // display name of selected directory
  lastSaved:  null,     // Date of last successful save
  format:     'yaml',   // 'yaml' | 'json'
};

const LS_KEY = 'divinity-builder-autosave';

/** Load persisted settings from localStorage. */
function loadSavedSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    AUTOSAVE.interval = Number(s.interval) || 0;
    AUTOSAVE.format   = s.format === 'json' ? 'json' : 'yaml';
  } catch (_) { /* ignore */ }
}

/** Write current settings to localStorage. */
function persistSettings() {
  localStorage.setItem(LS_KEY, JSON.stringify({
    interval: AUTOSAVE.interval,
    format:   AUTOSAVE.format,
  }));
}

/** (Re)start the auto-save timer based on AUTOSAVE.interval. */
function applyAutoSaveTimer() {
  if (AUTOSAVE.timer) { clearInterval(AUTOSAVE.timer); AUTOSAVE.timer = null; }
  if (AUTOSAVE.interval > 0) {
    AUTOSAVE.timer = setInterval(() => APP.autoSaveNow(), AUTOSAVE.interval * 60 * 1000);
  }
}

/** Update the status line in the settings section (if visible). */
function refreshAutoSaveStatus() {
  const el = document.getElementById('autosave-status');
  if (!el) return;

  if (AUTOSAVE.interval === 0) {
    el.innerHTML = '<span class="as-off">⏸ Auto-save disabled (interval = 0).</span>';
    return;
  }

  const dirInfo = AUTOSAVE.dirHandle
    ? `📁 <b>${AUTOSAVE.dirName}</b>`
    : '⚠️ No directory selected — will download a JSON snapshot instead.';
  const lastInfo = AUTOSAVE.lastSaved
    ? ` &nbsp;·&nbsp; Last saved: <b>${AUTOSAVE.lastSaved.toLocaleTimeString()}</b>`
    : '';

  el.innerHTML = `<span class="as-on">⏱ Auto-saving every <b>${AUTOSAVE.interval} min</b>. ${dirInfo}${lastInfo}</span>`;
}

// ---------------------------------------------------------------------------
// Settings section HTML builder
// ---------------------------------------------------------------------------

function buildSettingsSection() {
  const def = SCHEMA.sections['settings'];
  const fsApiAvailable = typeof window.showDirectoryPicker === 'function';

  const sectionList = Object.values(SCHEMA.sections)
    .filter(s => s.file && STATE.loaded[s.id])
    .map(s => `<li><code>${s.file.split('/').pop()}</code> — ${s.label}</li>`)
    .join('');

  const loadedCount = Object.keys(STATE.loaded).length;

  return `
    <div class="section-header">
      <div class="section-title">${def.icon} ${def.label}</div>
      <div class="section-desc">${def.description}</div>
    </div>

    <!-- ── Export ─────────────────────────────────────────── -->
    <div class="settings-card">
      <h3>Export</h3>
      <p class="muted small" style="margin-bottom:12px">
        Download all currently-loaded sections as a single JSON snapshot.
        You can re-import it later to restore the full editor state in one click.
      </p>

      ${loadedCount === 0
        ? '<div class="alert alert-warn">⚠️ No files loaded yet. Load YAML files in <b>Load Files</b> first.</div>'
        : `<ul class="loaded-list">${sectionList}</ul>`}

      <div class="settings-row" style="margin-top:12px">
        <button class="btn-setting btn-export" onclick="APP.downloadAllJson()"
                ${loadedCount === 0 ? 'disabled' : ''}>
          ⬇ Download all as JSON
        </button>
        <span class="muted small">Includes all ${loadedCount} loaded section(s).</span>
      </div>
    </div>

    <!-- ── Import ─────────────────────────────────────────── -->
    <div class="settings-card">
      <h3>Import snapshot</h3>
      <p class="muted small" style="margin-bottom:12px">
        Load a previously exported JSON snapshot. Restores all sections at once.
      </p>
      <div class="settings-row">
        <label class="btn-setting btn-import">
          📂 Load JSON snapshot
          <input type="file" accept=".json" style="display:none"
                 onchange="APP.importJsonFromInput(event)">
        </label>
      </div>
    </div>

    <!-- ── Auto-save ──────────────────────────────────────── -->
    <div class="settings-card">
      <h3>Auto-save</h3>

      <div class="settings-row">
        <label class="settings-label">Save interval (minutes)</label>
        <input class="edit-input edit-input--num" type="number" min="0" step="1"
               value="${AUTOSAVE.interval}" style="width:80px"
               oninput="APP.setAutoSaveInterval(+this.value)">
        <span class="muted small">0 = disabled</span>
      </div>

      <div class="settings-row">
        <label class="settings-label">Format</label>
        <label class="radio-label">
          <input type="radio" name="as-format" value="yaml"
                 ${AUTOSAVE.format === 'yaml' ? 'checked' : ''}
                 onchange="APP.setAutoSaveFormat('yaml')">
          YAML (individual files)
        </label>
        <label class="radio-label">
          <input type="radio" name="as-format" value="json"
                 ${AUTOSAVE.format === 'json' ? 'checked' : ''}
                 onchange="APP.setAutoSaveFormat('json')">
          JSON snapshot
        </label>
      </div>

      ${AUTOSAVE.format === 'yaml' ? `
      <div class="settings-row">
        <label class="settings-label">Save directory</label>
        ${fsApiAvailable ? `
          <button class="btn-setting" onclick="APP.pickDirectory()">
            📁 ${AUTOSAVE.dirHandle ? `Change (current: <b>${AUTOSAVE.dirName}</b>)` : 'Select directory…'}
          </button>
          ${!AUTOSAVE.dirHandle
            ? '<span class="muted small">No directory selected.</span>'
            : `<span class="muted small">Files will be saved to: <b>${AUTOSAVE.dirName}</b></span>`}
        ` : `
          <span class="alert alert-warn" style="display:inline-block">
            ⚠️ File System Access API is not supported in this browser.
            YAML auto-save will trigger individual downloads instead.
            Use Chrome or Edge for directory-based saving.
          </span>
        `}
      </div>` : ''}

      <div class="settings-row">
        <div id="autosave-status" class="autosave-status"></div>
      </div>

      <div class="settings-row" style="gap:8px">
        <button class="btn-setting btn-save-now" onclick="APP.autoSaveNow()"
                ${loadedCount === 0 ? 'disabled' : ''}>
          💾 Save now
        </button>
        ${AUTOSAVE.interval > 0
          ? '<button class="btn-setting btn-stop" onclick="APP.setAutoSaveInterval(0);APP.navigate(\'settings\')">⏹ Stop auto-save</button>'
          : ''}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

Object.assign(APP, {

  /**
   * Download all loaded sections as a single JSON snapshot.
   * Format: { version, exported, sections: { [sectionId]: parsedData } }
   */
  downloadAllJson() {
    const snapshot = {
      version:  1,
      exported: new Date().toISOString(),
      sections: {},
    };
    Object.entries(STATE.loaded).forEach(([sid, data]) => {
      snapshot.sections[sid] = data;
    });

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: `divinity-builder-${ts}.json`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /** Called by the file input on the import card. */
  importJsonFromInput(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const snapshot = JSON.parse(e.target.result);
        if (!snapshot.sections || typeof snapshot.sections !== 'object') {
          alert('Invalid snapshot: missing "sections" key.');
          return;
        }
        let count = 0;
        Object.entries(snapshot.sections).forEach(([sid, data]) => {
          if (!SCHEMA.sections[sid]) return;
          // Re-apply slimming so old snapshots with full data are also trimmed
          if (SECTION_SLIM[sid] && data && typeof data === 'object' && !data._multiFile) {
            data = SECTION_SLIM[sid](data);
          }
          if (data && data._multiFile && data.files) {
            const slim = SECTION_FILE_SLIM[sid];
            if (slim) {
              const slimmedFiles = {};
              Object.entries(data.files).forEach(([fname, fdata]) => {
                slimmedFiles[fname] = slim(fdata);
              });
              data = { ...data, files: slimmedFiles };
            }
          }
          STATE.loaded[sid] = data;
          delete STATE.errors[sid];
          updateBadge(sid);
          count++;
        });
        alert(`✅ Imported ${count} section(s) from snapshot (v${snapshot.version || '?'}, exported ${snapshot.exported || 'unknown'}).`);
        renderSection(_activeSection);
      } catch (err) {
        alert('❌ Failed to parse JSON: ' + err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  },

  // ---------------------------------------------------------------------------
  // Directory picker & auto-save
  // ---------------------------------------------------------------------------

  /** Open the File System Access API directory picker. */
  async pickDirectory() {
    if (typeof window.showDirectoryPicker !== 'function') {
      alert('File System Access API is not supported in this browser.\nUse Chrome or Edge.');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      AUTOSAVE.dirHandle = handle;
      AUTOSAVE.dirName   = handle.name;
      renderSection('settings'); // re-render to show new dir name
    } catch (err) {
      if (err.name !== 'AbortError') alert('Could not open directory: ' + err.message);
    }
  },

  /** Set auto-save interval in minutes. 0 disables. */
  setAutoSaveInterval(minutes) {
    AUTOSAVE.interval = Math.max(0, Math.floor(minutes));
    persistSettings();
    applyAutoSaveTimer();
    refreshAutoSaveStatus();
  },

  /** Set auto-save format: 'yaml' | 'json'. */
  setAutoSaveFormat(format) {
    AUTOSAVE.format = format === 'json' ? 'json' : 'yaml';
    persistSettings();
    renderSection('settings'); // re-render to show/hide directory picker
  },

  /**
   * Perform an immediate save:
   *  - If format='yaml' and dirHandle available → write individual YAML files to dir
   *  - If format='yaml' and no dirHandle       → trigger individual downloads
   *  - If format='json'                         → download JSON snapshot
   */
  async autoSaveNow() {
    const loadedSections = Object.entries(STATE.loaded)
      .filter(([sid]) => SCHEMA.sections[sid]?.file);

    if (loadedSections.length === 0) {
      alert('Nothing to save — no YAML files are loaded yet.');
      return;
    }

    if (AUTOSAVE.format === 'json') {
      this.downloadAllJson();
      AUTOSAVE.lastSaved = new Date();
      refreshAutoSaveStatus();
      return;
    }

    // YAML mode
    if (AUTOSAVE.dirHandle) {
      // Write YAML files directly to the chosen directory
      let saved = 0, failed = 0;
      for (const [sid, data] of loadedSections) {
        const def = SCHEMA.sections[sid];
        // Multi-file: save each sub-file
        if (def.multiFile && data._multiFile) {
          const families = data._families || {};
          for (const [fname, fdata] of Object.entries(data.files || {})) {
            try {
              const family = families[fname] ?? '';
              let targetDir = AUTOSAVE.dirHandle;
              if (family) {
                // Create subfolder if it doesn't exist
                targetDir = await AUTOSAVE.dirHandle.getDirectoryHandle(family, { create: true });
              }
              const fh = await targetDir.getFileHandle(fname, { create: true });
              const wr = await fh.createWritable();
              await wr.write(YAML.stringify(fdata));
              await wr.close();
              saved++;
            } catch (err) { console.error(`Failed to save ${fname}:`, err); failed++; }
          }
          continue;
        }
        const fname = def.file.split('/').pop();
        try {
          const fileHandle = await AUTOSAVE.dirHandle.getFileHandle(fname, { create: true });
          const writable   = await fileHandle.createWritable();
          await writable.write(YAML.stringify(data));
          await writable.close();
          saved++;
        } catch (err) {
          console.error(`Failed to save ${fname}:`, err);
          failed++;
        }
      }
      AUTOSAVE.lastSaved = new Date();
      refreshAutoSaveStatus();
      if (failed > 0) alert(`⚠️ Saved ${saved} file(s), but ${failed} failed. Check console.`);
    } else {
      // No dir — trigger individual downloads
      for (const [sid, data] of loadedSections) {
        const def = SCHEMA.sections[sid];
        if (def.multiFile && data._multiFile) {
          Object.keys(data.files || {}).forEach(fname => this.igDownload(sid, fname));
          continue;
        }
        const blob = new Blob([YAML.stringify(data)], { type: 'text/yaml;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), {
          href: url, download: def.file.split('/').pop(),
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      AUTOSAVE.lastSaved = new Date();
      refreshAutoSaveStatus();
    }
  },
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  loadSavedSettings();
  applyAutoSaveTimer();
  buildNav();
  renderSection('load');
});
