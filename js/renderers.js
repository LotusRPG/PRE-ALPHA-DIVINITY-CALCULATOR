/**
 * renderers.js — Section render functions.
 *
 * Each function receives (data, sectionId) and returns an HTML string.
 * Interactive elements call APP.* defined in app.js.
 *
 * All list / object fields are rendered as open JSON textareas —
 * user types raw JSON, onblur writes back to STATE.
 */

'use strict';

// ---------------------------------------------------------------------------
// Minecraft color helpers
// ---------------------------------------------------------------------------

const mc = {
  colorMap: {
    '0':'mc0','1':'mc1','2':'mc2','3':'mc3','4':'mc4','5':'mc5',
    '6':'mc6','7':'mc7','8':'mc8','9':'mc9','a':'mca','b':'mcb',
    'c':'mcc','d':'mcd','e':'mce','f':'mcf',
    'l':'mcl','o':'mco','m':'mcm','n':'mcn','r':'mcr',
  },
  strip(s) { return s ? String(s).replace(/[&§][0-9a-fklmnoqr]/gi, '') : ''; },
  toHtml(s) {
    if (!s) return '';
    s = String(s);
    let html = '', openTags = 0, i = 0;
    while (i < s.length) {
      if ((s[i] === '&' || s[i] === '§') && i + 1 < s.length) {
        const code = s[i + 1].toLowerCase();
        if (this.colorMap[code] !== undefined) {
          if (code === 'r' || openTags > 0) { html += '</span>'.repeat(openTags); openTags = 0; }
          if (code !== 'r') { html += `<span class="${this.colorMap[code]}">`;  openTags++; }
          i += 2; continue;
        }
      }
      const c = s[i];
      html += c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c;
      i++;
    }
    return `<span class="mcf">${html}</span>`;
  },
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/** Stable DOM id for live-update badges. */
function safeId(sid, entryId, field) {
  return `chk-${sid}-${String(entryId).replace(/[^a-z0-9]/gi, '_')}-${field}`;
}

// ---------------------------------------------------------------------------
// Input helpers
// ---------------------------------------------------------------------------

function editText(sid, path, val, cls = '') {
  return `<input class="edit-input ${cls}" type="text" value="${esc(val)}"
    oninput="APP.updateField('${sid}','${esc(path)}',this.value)">`;
}

function editNum(sid, path, val, cls = '') {
  return `<input class="edit-input edit-input--num ${cls}" type="number" value="${esc(val)}"
    oninput="APP.updateField('${sid}','${esc(path)}',+this.value)">`;
}

/** Renameable key input — renames the top-level entry on blur/Enter. */
function editId(sid, id) {
  return `<input class="edit-input edit-id" value="${esc(id)}" title="Edit to rename"
    onblur="if(this.value.trim()&&this.value.trim()!=='${esc(id)}')APP.renameEntry('${sid}','${esc(id)}',this.value.trim())"
    onkeydown="if(event.key==='Enter')this.blur()">`;
}

/**
 * Checkbox that patches its badge span in-place (no re-render).
 * @param {string} type  'enabled' | 'percent-pen'
 */
function liveCheck(sid, path, val, badgeId, type) {
  return `<input class="edit-check" type="checkbox" ${val ? 'checked' : ''}
    onchange="APP.updateCheckbox('${sid}','${esc(path)}',this.checked,'${badgeId}','${type}')">`;
}

/** Badge span with stable id so liveCheck can update it. */
function liveBadge(val, badgeId, type) {
  if (type === 'enabled') {
    return `<span class="badge ${val ? 'badge-green' : 'badge-red'}" id="${badgeId}">${val ? 'enabled' : 'disabled'}</span>`;
  }
  if (type === 'percent-pen') {
    return `<span class="badge ${val ? 'badge-blue' : 'badge-yellow'}" id="${badgeId}">${val ? '% percent' : 'flat'}</span>`;
  }
  return '';
}

/**
 * Open JSON textarea for any value (array or object).
 * User types raw JSON; onblur → APP.updateJsonField writes back to STATE.
 */
function jsonTextarea(sid, path, value) {
  const isArr = Array.isArray(value);
  const json  = JSON.stringify(value ?? (isArr ? [] : {}), null, 2);
  const rows  = isArr
    ? Math.max(3, (value?.length ?? 0) + 2)
    : Math.max(3, Object.keys(value ?? {}).length + 2);
  return `<textarea class="obj-textarea" rows="${rows}"
    onblur="APP.updateJsonField('${sid}','${esc(path)}',this.value)">${esc(json)}</textarea>`;
}

/**
 * Simple line-by-line textarea for string arrays (one value per line).
 * onblur → APP.updateLineArray splits by newline and writes array back.
 */
function lineArrayField(sid, path, value) {
  const arr  = Array.isArray(value) ? value : [];
  const text = arr.join('\n');
  const rows = Math.max(2, arr.length + 1);
  return `<textarea class="obj-textarea" rows="${rows}" placeholder="one value per line"
    onblur="APP.updateLineArray('${sid}','${esc(path)}',this.value)">${esc(text)}</textarea>`;
}

// ---------------------------------------------------------------------------
// Action buttons
// ---------------------------------------------------------------------------

function addEntryBtn(sid, template, label) {
  // JSON goes in data-template (HTML-encoded) to avoid breaking the onclick attribute with double quotes
  const tpl = esc(JSON.stringify(template));
  return `<button class="btn-add-entry" data-template="${tpl}"
    onclick="APP.addEntry('${sid}','_new_${sid}',JSON.parse(this.dataset.template))">+ ${label}</button>`;
}

function collapseAllBtn() {
  return `<button class="btn-add-entry"
    onclick="document.querySelectorAll('#content .card-details').forEach(d=>d.open=false)">▶ Collapse all</button>
    <button class="btn-add-entry"
    onclick="document.querySelectorAll('#content .card-details').forEach(d=>d.open=true)">▼ Expand all</button>`;
}

// ---------------------------------------------------------------------------
// Templates for "New blank" in multiFile sections
// ---------------------------------------------------------------------------

const ITEM_TEMPLATES = {

  itemgen: {

    // Full template matching the plugin's complete item generator structure
    common: {
      name: '%BASE_NAME% %prefix_tier% %prefix_material% %prefix_type% %item_type% %suffix_material% %suffix_type% %suffix_tier%',
      lore: [
        '%BASE_LORE%', '&7Tier: %TIER_NAME%', '&7Level: &f%ITEM_LEVEL%',
        '%ITEM_AMMO%', '%ITEM_HAND%', '%ENCHANTS%', '',
        '%USER_CLASS%', '%USER_BANNED_CLASS%', '%USER_LEVEL%', '',
        '%ITEM_SET%', '%GENERATOR_DAMAGE_BUFFS%', '%GENERATOR_DEFENSE_BUFFS%', '%GENERATOR_PENETRATION%',
        '', '%GENERATOR_SKILLS%',
        '%GENERATOR_DEFENSE%', '%GENERATOR_DAMAGE%',
        '%GENERATOR_STATS%', '%GENERATOR_FABLED_ATTR%',
        '%GENERATOR_SOCKETS_GEM%', '%GENERATOR_SOCKETS_ESSENCE%', '%GENERATOR_SOCKETS_RUNE%',
      ],
      color: '-1,-1,-1', unbreakable: false, 'item-flags': ['*'], tier: 'common',
      level: { min: 1, max: 50 },
      generator: {
        'prefix-chance': 100.0, 'suffix-chance': 100.0,
        materials: {
          reverse: false,
          'black-list': ['DIAMOND*', 'IRON*', 'CHAINMAIL*'],
          'model-data': {
            default: [1, 2, 3],
            special: { diamond_sword: [10, 11], golden_sword: [12, 13], axe: [30, 40], armor: [20, 22] },
          },
        },
        bonuses: {
          'material-modifiers': { 'diamond*': { 'damage-types': { physical: 1.15 } } },
          material: {
            iron_sword:  { 'damage-types': { physical: 1.15 } },
            iron_helmet: { 'defense-types': { physical: 1.25 } },
            axe:         { 'item-stats': { CRITICAL_DAMAGE: 1.5 } },
          },
        },
        'user-requirements-by-level': {
          level:         { '1': '1:10', '11': '11:20', '21': '0 + %ITEM_LEVEL%' },
          class:         { '1': 'Warrior,Cleric' },
          'banned-class':{ '1': 'Gunner,Archer' },
        },
        enchantments: {
          minimum: 1, maximum: 2, 'safe-only': false, 'safe-levels': true,
          list: { sharpness: '1:2', knockback: '1:2', efficiency: '1:2', silk_touch: '0:1', smite: '1:2' },
        },
        'ammo-types': { ARROW: 100.0 },
        'hand-types': { ONE: 70.0, TWO: 30.0 },
        'damage-types': {
          minimum: 1, maximum: 2,
          'lore-format': [
            '%DAMAGE_PHYSICAL%', '%DAMAGE_MAGICAL%', '%DAMAGE_POISON%', '%DAMAGE_FIRE%',
            '%DAMAGE_WATER%', '%DAMAGE_WIND%', '',
            '%DAMAGE_SLASHING%', '%DAMAGE_PIERCING%', '%DAMAGE_BLUDGEONING%',
            '%DAMAGE_ICE%', '%DAMAGE_BLEED%', '%DAMAGE_CURSE%', '%DAMAGE_NECROTIC%',
            '%DAMAGE_EARTH%', '%DAMAGE_DUMMY%',
          ],
          list: {
            physical:    { chance: 100.0, 'scale-by-level': 1.025, min: 2.6, max: 5.8, 'flat-range': false, round: false },
            magical:     { chance: 0.0,   'scale-by-level': 1.0,   min: 0,   max: 0,   'flat-range': false, round: false },
            slashing:    { chance: 0.0,   'scale-by-level': 1.0,   min: 0,   max: 0,   'flat-range': false, round: false },
            piercing:    { chance: 0.0,   'scale-by-level': 1.0,   min: 0,   max: 0,   'flat-range': false, round: false },
            bludgeoning: { chance: 0.0,   'scale-by-level': 1.0,   min: 0,   max: 0,   'flat-range': false, round: false },
            fire:        { chance: 0.0,   'scale-by-level': 1.0,   min: 0,   max: 0,   'flat-range': false, round: false },
            ice:         { chance: 0.0,   'scale-by-level': 1.0,   min: 0,   max: 0,   'flat-range': false, round: false },
            poison:      { chance: 0.0,   'scale-by-level': 1.0,   min: 0,   max: 0,   'flat-range': false, round: false },
            wind:        { chance: 0.0,   'scale-by-level': 1.0,   min: 0,   max: 0,   'flat-range': false, round: false },
            water:       { chance: 0.0,   'scale-by-level': 1.0,   min: 0,   max: 0,   'flat-range': false, round: false },
            bleed:       { chance: 0.0,   'scale-by-level': 1.0,   min: 0,   max: 0,   'flat-range': false, round: false },
            curse:       { chance: 0.0,   'scale-by-level': 1.0,   min: 0,   max: 0,   'flat-range': false, round: false },
            necrotic:    { chance: 0.0,   'scale-by-level': 1.0,   min: 0,   max: 0,   'flat-range': false, round: false },
            earth:       { chance: 0.0,   'scale-by-level': 1.0,   min: 0,   max: 0,   'flat-range': false, round: false },
            dummy:       { chance: 0.0,   'scale-by-level': 1.0,   min: 0,   max: 0,   'flat-range': false, round: false },
          },
        },
        'defense-types': {
          minimum: 1, maximum: 2,
          'lore-format': [
            '%DEFENSE_PHYSICAL%', '%DEFENSE_MAGICAL%', '%DEFENSE_POISON%', '%DEFENSE_FIRE%',
            '%DEFENSE_WATER%', '%DEFENSE_WIND%', '',
            '%DEFENSE_SLASHING%', '%DEFENSE_PIERCING%', '%DEFENSE_BLUDGEONING%',
            '%DEFENSE_ICE%', '%DEFENSE_BLEED%', '%DEFENSE_CURSE%', '%DEFENSE_NECROTIC%',
            '%DEFENSE_WEAPON%', '%DEFENSE_ELEMENTAL%', '%DEFENSE_EARTH%',
          ],
          list: {
            physical:    { chance: 100.0, 'scale-by-level': 1.025, min: 3.25, max: 8.75, 'flat-range': false, round: false },
            magical:     { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,    'flat-range': false, round: false },
            slashing:    { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,    'flat-range': false, round: false },
            piercing:    { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,    'flat-range': false, round: false },
            bludgeoning: { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,    'flat-range': false, round: false },
            fire:        { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,    'flat-range': false, round: false },
            ice:         { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,    'flat-range': false, round: false },
            poison:      { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,    'flat-range': false, round: false },
            wind:        { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,    'flat-range': false, round: false },
            water:       { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,    'flat-range': false, round: false },
            bleed:       { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,    'flat-range': false, round: false },
            curse:       { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,    'flat-range': false, round: false },
            necrotic:    { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,    'flat-range': false, round: false },
            weapon:      { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,    'flat-range': false, round: false },
            elemental:   { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,    'flat-range': false, round: false },
            earth:       { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,    'flat-range': false, round: false },
          },
        },
        'item-stats': {
          minimum: 1, maximum: 4,
          'lore-format': [
            '%ITEM_STAT_AOE_DAMAGE%', '%ITEM_STAT_CRITICAL_RATE%', '%ITEM_STAT_CRITICAL_DAMAGE%',
            '%ITEM_STAT_ACCURACY_RATE%', '%ITEM_STAT_DODGE_RATE%', '%ITEM_STAT_BLOCK_RATE%',
            '%ITEM_STAT_BLOCK_DAMAGE%', '%ITEM_STAT_LOOT_RATE%', '%ITEM_STAT_MOVEMENT_SPEED%',
            '%ITEM_STAT_BASE_ATTACK_SPEED%', '%ITEM_STAT_ATTACK_SPEED%', '%ITEM_STAT_MAX_HEALTH%',
            '%ITEM_STAT_PENETRATION%', '%ITEM_STAT_VAMPIRISM%', '%ITEM_STAT_BURN_RATE%',
            '%ITEM_STAT_PVP_DEFENSE%', '%ITEM_STAT_THORNMAIL%', '%ITEM_STAT_MANA_REGEN%',
            '%ITEM_STAT_BLEED_RATE%', '%ITEM_STAT_HEALTH_REGEN%', '%ITEM_STAT_SALE_PRICE%',
            '%ITEM_STAT_DISARM_RATE%', '%ITEM_STAT_PVE_DAMAGE%', '%ITEM_STAT_PVP_DAMAGE%',
            '%ITEM_STAT_PVE_DEFENSE%', '%ITEM_STAT_ARMOR_TOUGHNESS%', '',
            '%ITEM_STAT_DURABILITY%', '',
            '%ITEM_STAT_SCALE%', '%ITEM_STAT_KNOCKBACK_RESISTANCE%',
            '%ITEM_STAT_HEALING_CAST%', '%ITEM_STAT_ARMOR%', '%ITEM_STAT_CC_RESISTANCE%',
            '%ITEM_STAT_HEALING_RECEIVED%',
          ],
          list: {
            critical_rate:        { chance: 20.0,  'scale-by-level': 1.025, min: 3.0,  max: 6.25,  'flat-range': false, round: false },
            critical_damage:      { chance: 20.0,  'scale-by-level': 1.025, min: 1.1,  max: 1.25,  'flat-range': false, round: false },
            dodge_rate:           { chance: 10.0,  'scale-by-level': 1.025, min: 2.5,  max: 4.0,   'flat-range': false, round: false },
            accuracy_rate:        { chance: 10.0,  'scale-by-level': 1.025, min: 4.5,  max: 7.5,   'flat-range': false, round: false },
            block_rate:           { chance: 10.0,  'scale-by-level': 1.025, min: 1.5,  max: 7.0,   'flat-range': false, round: false },
            block_damage:         { chance: 10.0,  'scale-by-level': 1.025, min: 3.0,  max: 10.0,  'flat-range': false, round: false },
            vampirism:            { chance: 5.0,   'scale-by-level': 1.025, min: 1.5,  max: 4.5,   'flat-range': false, round: false },
            burn_rate:            { chance: 8.0,   'scale-by-level': 1.025, min: 4.5,  max: 12.5,  'flat-range': false, round: false },
            durability:           { chance: 100.0, 'scale-by-level': 1.025, min: 150,  max: 700,   'flat-range': false, round: false },
            penetration:          { chance: 6.0,   'scale-by-level': 1.025, min: 4.5,  max: 10.0,  'flat-range': false, round: false },
            loot_rate:            { chance: 7.5,   'scale-by-level': 1.025, min: 2.0,  max: 10.0,  'flat-range': false, round: false },
            movement_speed:       { chance: 3.5,   'scale-by-level': 1.025, min: 7.5,  max: 15.0,  'flat-range': false, round: false },
            attack_speed:         { chance: 4.75,  'scale-by-level': 1.025, min: 5.0,  max: 10.0,  'flat-range': false, round: false },
            max_health:           { chance: -1,    'scale-by-level': 1.025, min: 5.0,  max: 10.0,  'flat-range': false, round: false },
            aoe_damage:           { chance: 5.0,   'scale-by-level': 1.025, min: 5.0,  max: 10.0,  'flat-range': false, round: false },
            range:                { chance: 20.0,  'scale-by-level': 1.025, min: 5.0,  max: 25.0,  'flat-range': false },
            armor_toughness:      { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
            scale:                { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
            disarm_rate:          { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
            bleed_rate:           { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
            sale_price:           { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
            pve_damage:           { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
            knockback_resistance: { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
            pvp_defense:          { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
            pvp_damage:           { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
            base_attack_speed:    { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
            thornmail:            { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
            healing_cast:         { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
            mana_regen:           { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
            armor:                { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
            health_regen:         { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
            pve_defense:          { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
            cc_resistance:        { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
            healing_received:     { chance: 0.0,   'scale-by-level': 1.0,   min: 0,    max: 0,     'flat-range': false, round: false },
          },
          'list-damage-buffs': {
            'lore-format': [
              '%DAMAGE_BUFF_PHYSICAL%', '%DAMAGE_BUFF_MAGICAL%', '%DAMAGE_BUFF_SLASHING%',
              '%DAMAGE_BUFF_PIERCING%', '%DAMAGE_BUFF_BLUDGEONING%', '%DAMAGE_BUFF_FIRE%',
              '%DAMAGE_BUFF_ICE%', '%DAMAGE_BUFF_POISON%', '%DAMAGE_BUFF_WIND%',
              '%DAMAGE_BUFF_WATER%', '%DAMAGE_BUFF_BLEED%', '%DAMAGE_BUFF_CURSE%',
              '%DAMAGE_BUFF_NECROTIC%', '%DAMAGE_BUFF_EARTH%', '%DAMAGE_BUFF_DUMMY%',
            ],
            physical:    { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            magical:     { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            slashing:    { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            piercing:    { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            bludgeoning: { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            fire:        { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            ice:         { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            poison:      { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            wind:        { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            water:       { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            bleed:       { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            curse:       { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            necrotic:    { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            earth:       { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            dummy:       { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
          },
          'list-defense-buffs': {
            'lore-format': [
              '%DEFENSE_BUFF_PHYSICAL%', '%DEFENSE_BUFF_MAGICAL%', '%DEFENSE_BUFF_SLASHING%',
              '%DEFENSE_BUFF_PIERCING%', '%DEFENSE_BUFF_BLUDGEONING%', '%DEFENSE_BUFF_FIRE%',
              '%DEFENSE_BUFF_ICE%', '%DEFENSE_BUFF_POISON%', '%DEFENSE_BUFF_WIND%',
              '%DEFENSE_BUFF_WATER%', '%DEFENSE_BUFF_BLEED%', '%DEFENSE_BUFF_CURSE%',
              '%DEFENSE_BUFF_NECROTIC%', '%DEFENSE_BUFF_WEAPON%', '%DEFENSE_BUFF_ELEMENTAL%',
              '%DEFENSE_BUFF_EARTH%',
            ],
            physical:    { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            magical:     { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            slashing:    { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            piercing:    { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            bludgeoning: { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            fire:        { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            ice:         { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            poison:      { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            wind:        { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            water:       { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            bleed:       { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            curse:       { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            necrotic:    { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            weapon:      { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            elemental:   { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            earth:       { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
          },
          'list-penetration': {
            'lore-format': [
              '%PENETRATION_PHYSICAL_PEN%', '%PENETRATION_MAGICAL_PEN%', '%PENETRATION_FIRE_PEN%',
              '%PENETRATION_POISON_PEN%', '%PENETRATION_WATER_PEN%', '%PENETRATION_WIND_PEN%',
              '%PENETRATION_SLASHING_PEN%', '%PENETRATION_PIERCING_PEN%', '%PENETRATION_BLUDGEONING_PEN%',
              '%PENETRATION_ICE_PEN%', '%PENETRATION_BLEED_PEN%', '%PENETRATION_CURSE_PEN%',
              '%PENETRATION_NECROTIC_PEN%', '%PENETRATION_EARTH_PEN%', '%PENETRATION_DUMMY_PEN%',
            ],
            physical_pen:    { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            magical_pen:     { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            fire_pen:        { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            poison_pen:      { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            water_pen:       { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            wind_pen:        { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            slashing_pen:    { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            piercing_pen:    { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            bludgeoning_pen: { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            ice_pen:         { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            bleed_pen:       { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            curse_pen:       { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            necrotic_pen:    { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            earth_pen:       { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
            dummy_pen:       { chance: 0.0, 'scale-by-level': 1.0, min: 0.0, max: 0.0, 'flat-range': false, round: false },
          },
        },
        'fabled-attributes': {
          minimum: 1, maximum: 4,
          'lore-format': [
            '%FABLED_ATTRIBUTE_VITALITY%', '%FABLED_ATTRIBUTE_SPIRIT%', '%FABLED_ATTRIBUTE_INTELLIGENCE%',
            '%FABLED_ATTRIBUTE_DEXTERITY%', '%FABLED_ATTRIBUTE_STRENGTH%', '%FABLED_ATTRIBUTE_STAMINA%',
          ],
          list: {
            dexterity:    { chance: 0.0, 'scale-by-level': 1.0, min: 0, max: 0, 'flat-range': false },
            intelligence: { chance: 0.0, 'scale-by-level': 1.0, min: 0, max: 0, 'flat-range': false },
            spirit:       { chance: 0.0, 'scale-by-level': 1.0, min: 0, max: 0, 'flat-range': false },
            stamina:      { chance: 0.0, 'scale-by-level': 1.0, min: 0, max: 0, 'flat-range': false },
            strength:     { chance: 0.0, 'scale-by-level': 1.0, min: 0, max: 0, 'flat-range': false },
          },
        },
        sockets: {
          GEM: {
            minimum: 0, maximum: 2,
            'lore-format': ['&8&m               &f  「 GEMS 」  &8&m               ', '%SOCKET_GEM_COMMON%', '%SOCKET_GEM_RARE%'],
            list: { common: { chance: 35.0 }, rare: { chance: 15.0 } },
          },
          ESSENCE: {
            minimum: 0, maximum: 2,
            'lore-format': ['&8&m               &f  「 ESSENCES 」  &8&m               ', '%SOCKET_ESSENCE_DEFAULT%'],
            list: { default: { chance: 35.0 } },
          },
          RUNE: {
            minimum: 0, maximum: 2,
            'lore-format': ['&8&m               &f  「 RUNES 」  &8&m               ', '%SOCKET_RUNE_DEFAULT%'],
            list: { default: { chance: 35.0 } },
          },
        },
        skills: {
          minimum: 10, maximum: 10,
          list: {
            'ability-1': { chance: 0.0, 'min-level': 1, 'max-level': 1, 'lore-format': ['&bSample Ability: &7[&f%level%&7]'] },
            Assasin:     { chance: 100.0, 'min-level': 1, 'max-level': 1, 'lore-format': ['&bAssasin &7Lvl. &f%level%'] },
          },
        },
        'shield-patterns': {
          random: true,
          'base-colors': ['LIGHT_GRAY', 'GRAY'],
          'pattern-colors': ['LIGHT_GRAY', 'GRAY'],
          patterns: ['BASE', 'BORDER'],
        },
      },
    },

    weapon: {
      name: '%BASE_NAME% %prefix_tier% %item_type%',
      lore: ['%BASE_LORE%', '&7Tier: %TIER_NAME%', '&7Level: &f%ITEM_LEVEL%', '', '%GENERATOR_DAMAGE%', '%GENERATOR_STATS%', '%GENERATOR_SOCKETS_GEM%', '%GENERATOR_SOCKETS_ESSENCE%', '%GENERATOR_SOCKETS_RUNE%'],
      tier: 'common', unbreakable: false, 'item-flags': ['*'], color: '-1,-1,-1',
      level: { min: 1, max: 50 },
      generator: {
        'prefix-chance': 80.0, 'suffix-chance': 0.0,
        materials: { reverse: false, 'black-list': [] },
        enchantments: { minimum: 1, maximum: 2, 'safe-only': true, list: {} },
        'damage-types': {
          minimum: 1, maximum: 1,
          'lore-format': ['%DAMAGE_PHYSICAL%'],
          list: { physical: { chance: 100, 'scale-by-level': 1.025, min: 3, max: 8, 'flat-range': false } },
        },
        'item-stats': {
          minimum: 1, maximum: 3,
          'lore-format': ['%ITEM_STAT_CRITICAL_RATE%', '%ITEM_STAT_CRITICAL_DAMAGE%'],
          list: {},
        },
        sockets: {
          GEM:     { minimum: 0, maximum: 2, 'lore-format': ['%SOCKET_GEM_COMMON%'], list: { common: { chance: 35 } } },
          ESSENCE: { minimum: 0, maximum: 1, 'lore-format': ['%SOCKET_ESSENCE_DEFAULT%'], list: { default: { chance: 25 } } },
          RUNE:    { minimum: 0, maximum: 1, 'lore-format': ['%SOCKET_RUNE_DEFAULT%'], list: { default: { chance: 20 } } },
        },
      },
    },

    armor: {
      name: '%BASE_NAME% %prefix_tier% %item_type%',
      lore: ['%BASE_LORE%', '&7Tier: %TIER_NAME%', '&7Level: &f%ITEM_LEVEL%', '', '%GENERATOR_DEFENSE%', '%GENERATOR_STATS%', '%GENERATOR_SOCKETS_GEM%', '%GENERATOR_SOCKETS_ESSENCE%', '%GENERATOR_SOCKETS_RUNE%'],
      tier: 'common', unbreakable: false, 'item-flags': ['*'], color: '-1,-1,-1',
      level: { min: 1, max: 50 },
      generator: {
        'prefix-chance': 80.0, 'suffix-chance': 0.0,
        materials: { reverse: false, 'black-list': [] },
        enchantments: { minimum: 1, maximum: 2, 'safe-only': true, list: {} },
        'defense-types': {
          minimum: 1, maximum: 1,
          'lore-format': ['%DEFENSE_PHYSICAL%'],
          list: { physical: { chance: 100, 'scale-by-level': 1.025, min: 3, max: 8, 'flat-range': false } },
        },
        'item-stats': {
          minimum: 1, maximum: 3,
          'lore-format': ['%ITEM_STAT_MAX_HEALTH%', '%ITEM_STAT_DODGE_RATE%'],
          list: {},
        },
        sockets: {
          GEM:     { minimum: 0, maximum: 2, 'lore-format': ['%SOCKET_GEM_COMMON%'], list: { common: { chance: 35 } } },
          ESSENCE: { minimum: 0, maximum: 1, 'lore-format': ['%SOCKET_ESSENCE_DEFAULT%'], list: { default: { chance: 25 } } },
          RUNE:    { minimum: 0, maximum: 1, 'lore-format': ['%SOCKET_RUNE_DEFAULT%'], list: { default: { chance: 20 } } },
        },
      },
    },

  },

  sets: {

    'armor-4pc': {
      name: '&eNew Set',
      prefix: '&f',
      suffix: '',
      color: { active: '&a', inactive: '&8' },
      elements: {
        helmet:     { materials: ['DIAMOND_HELMET'],     name: '%prefix%Helmet %suffix%'     },
        chestplate: { materials: ['DIAMOND_CHESTPLATE'], name: '%prefix%Chestplate %suffix%' },
        leggings:   { materials: ['DIAMOND_LEGGINGS'],   name: '%prefix%Leggings %suffix%'   },
        boots:      { materials: ['DIAMOND_BOOTS'],      name: '%prefix%Boots %suffix%'      },
      },
      bonuses: { 'by-elements-amount': {
        '2': { lore: ['%c%&lSet Bonuses (2/4):'], 'item-stats': {}, 'damage-types': {}, 'defense-types': {}, 'potion-effects': {} },
        '4': { lore: ['%c%&lSet Bonuses (4/4):'], 'item-stats': {}, 'damage-types': {}, 'defense-types': {}, 'potion-effects': {} },
      } },
    },

    'weapon-2pc': {
      name: '&cNew Weapon Set',
      prefix: '&f',
      suffix: '',
      color: { active: '&c', inactive: '&8' },
      elements: {
        weapon: { materials: ['DIAMOND_SWORD'], name: '%prefix%Sword %suffix%'    },
        offhand: { materials: ['GOLDEN_SWORD'], name: '%prefix%Offhand %suffix%' },
      },
      bonuses: { 'by-elements-amount': {
        '2': { lore: ['%c%&lSet Bonuses (2/2):'], 'item-stats': {}, 'damage-types': {}, 'defense-types': {}, 'potion-effects': {} },
      } },
    },

  },

  gems: {

    'damage-gem': {
      material: 'DIAMOND',
      name: 'New Damage Gem',
      'socket-display': '&6%name% %ITEM_LEVEL_ROMAN% &7(&f+%value%&7)',
      lore: ['&7Damage: &f+%value%'],
      enchanted: false, 'item-flags': ['*'], tier: 'common',
      level: { min: 1, max: 3 },
      'uses-by-level':         { '1': 3, '2': 3, '3': 3 },
      'success-rate-by-level': { '1': '70:90', '2': '50:70', '3': '35:60' },
      'bonuses-by-level': {
        '1': { 'item-stats': {}, 'damage-types': { physical: '3%' },   'defense-types': {}, skills: {} },
        '2': { 'item-stats': {}, 'damage-types': { physical: '5%' },   'defense-types': {}, skills: {} },
        '3': { 'item-stats': {}, 'damage-types': { physical: '7.5%' }, 'defense-types': {}, skills: {} },
      },
      'target-requirements': { level: {}, type: ['WEAPON'], socket: 'common', module: ['*'] },
    },

    'defense-gem': {
      material: 'EMERALD',
      name: 'New Defense Gem',
      'socket-display': '&a%name% %ITEM_LEVEL_ROMAN% &7(&f+%value%&7)',
      lore: ['&7Defense: &f+%value%'],
      enchanted: false, 'item-flags': ['*'], tier: 'common',
      level: { min: 1, max: 3 },
      'uses-by-level':         { '1': 3, '2': 3, '3': 3 },
      'success-rate-by-level': { '1': '70:90', '2': '50:70', '3': '35:60' },
      'bonuses-by-level': {
        '1': { 'item-stats': {}, 'damage-types': {}, 'defense-types': { physical: '3%' },   skills: {} },
        '2': { 'item-stats': {}, 'damage-types': {}, 'defense-types': { physical: '5%' },   skills: {} },
        '3': { 'item-stats': {}, 'damage-types': {}, 'defense-types': { physical: '7.5%' }, skills: {} },
      },
      'target-requirements': { level: {}, type: ['ARMOR'], socket: 'common', module: ['*'] },
    },

    'stat-gem': {
      material: 'AMETHYST_SHARD',
      name: 'New Stat Gem',
      'socket-display': '&d%name% %ITEM_LEVEL_ROMAN% &7(&f+%value%&7)',
      lore: ['&7Stat bonus: &f+%value%'],
      enchanted: false, 'item-flags': ['*'], tier: 'rare',
      level: { min: 1, max: 3 },
      'uses-by-level':         { '1': 2, '2': 2, '3': 2 },
      'success-rate-by-level': { '1': '50:70', '2': '35:55', '3': '20:45' },
      'bonuses-by-level': {
        '1': { 'item-stats': { MAX_HEALTH: '10' }, 'damage-types': {}, 'defense-types': {}, skills: {} },
        '2': { 'item-stats': { MAX_HEALTH: '20' }, 'damage-types': {}, 'defense-types': {}, skills: {} },
        '3': { 'item-stats': { MAX_HEALTH: '30' }, 'damage-types': {}, 'defense-types': {}, skills: {} },
      },
      'target-requirements': { level: {}, type: ['*'], socket: 'rare', module: ['*'] },
    },

  },

  essences: {

    'foot-trail': {
      material: 'GLOWSTONE_DUST',
      name: '&eFoot Trail',
      lore: ['&7Creates a &fglowing trail &7behind you.'],
      'socket-display': '&eTrail %ITEM_LEVEL_ROMAN%',
      enchanted: true,
      'item-flags': ['*'],
      tier: 'common',
      level: { min: 1, max: 1 },
      'uses-by-level': { '1': 1 },
      'success-rate-by-level': { '1': '75' },
      effect: { type: 'FOOT', name: 'DUST:225,225,125', amount: 15, speed: 0.2, 'offset-x': 0.25, 'offset-y': 0.1, 'offset-z': 0.25 },
      'target-requirements': { type: ['ARMOR'], socket: 'default', module: ['*'], level: {} },
    },

    'magic-helix': {
      material: 'REDSTONE',
      name: '&dMagic Helix',
      lore: ['&7Creates a &dhelical aura &7around you.'],
      'socket-display': '&dHelix %ITEM_LEVEL_ROMAN%',
      enchanted: true,
      'item-flags': ['*'],
      tier: 'rare',
      level: { min: 1, max: 2 },
      'uses-by-level': { '1': 1, '2': 1 },
      'success-rate-by-level': { '1': '75', '2': '50' },
      effect: { type: 'HELIX', name: 'WITCH', amount: 10, speed: 0.1, 'offset-x': 0.5, 'offset-y': 0.5, 'offset-z': 0.5 },
      'target-requirements': { type: ['ARMOR'], socket: 'default', module: ['*'], level: {} },
    },

  },

  runes: {

    'rune-speed': {
      material: 'PRISMARINE_SHARD',
      name: '&bRune of Speed',
      lore: ['&7Grants &fSpeed %ITEM_LEVEL_ROMAN% &7effect.'],
      'socket-display': '&bRune: Speed %ITEM_LEVEL_ROMAN%',
      'item-flags': ['*'],
      tier: 'rare',
      level: { min: 1, max: 3 },
      'uses-by-level': { '1': 1, '2': 1, '3': 1 },
      'success-rate-by-level': { '1': '75', '2': '55', '3': '35' },
      effect: 'SPEED',
      'target-requirements': { type: ['boots'], socket: 'default', module: ['*'], level: {} },
    },

    'rune-strength': {
      material: 'PRISMARINE_SHARD',
      name: '&cRune of Strength',
      lore: ['&7Grants &fStrength %ITEM_LEVEL_ROMAN% &7effect.'],
      'socket-display': '&cRune: Strength %ITEM_LEVEL_ROMAN%',
      'item-flags': ['*'],
      tier: 'rare',
      level: { min: 1, max: 3 },
      'uses-by-level': { '1': 1, '2': 1, '3': 1 },
      'success-rate-by-level': { '1': '75', '2': '55', '3': '35' },
      effect: 'STRENGTH',
      'target-requirements': { type: ['WEAPON'], socket: 'default', module: ['*'], level: {} },
    },

  },

  arrows: {

    basic: {
      material: 'ARROW',
      name: '&fNew Arrow',
      lore: ['&7A custom arrow.'],
      tier: 'common',
      enchanted: false,
      'item-flags': ['HIDE_ATTRIBUTES'],
      unbreakable: false,
      level: { min: 1, max: 10 },
      'bonuses-by-level': {
        '1':  { 'additional-stats': {}, 'additional-damage': {}, 'defense-ignoring': {} },
        '5':  { 'additional-stats': {}, 'additional-damage': { physical: '10%' }, 'defense-ignoring': {} },
        '10': { 'additional-stats': {}, 'additional-damage': { physical: '20%' }, 'defense-ignoring': {} },
      },
      'on-hit-actions': {},
      'on-fly-actions': {},
    },

    explosive: {
      material: 'ARROW',
      name: '&cExplosive Arrow',
      lore: ['&7Explodes on impact.'],
      tier: 'rare',
      enchanted: true,
      'item-flags': ['HIDE_ATTRIBUTES', 'HIDE_ENCHANTS'],
      unbreakable: false,
      level: { min: 1, max: 10 },
      'bonuses-by-level': {
        '1': { 'additional-stats': {}, 'additional-damage': { physical: '15%' }, 'defense-ignoring': {} },
      },
      'on-hit-actions': {
        default: {
          'target-selectors': {},
          conditions: { list: [], 'actions-on-fail': 'CANCEL' },
          'action-executors': [],
        },
      },
      'on-fly-actions': {},
    },

  },

  consumables: {

    potion: {
      material: 'POTION',
      name: '&aHealth Potion',
      lore: ['&7Restores &f%health% &7health.'],
      tier: 'common',
      enchanted: false,
      'item-flags': ['HIDE_ATTRIBUTES', 'HIDE_POTION_EFFECTS'],
      unbreakable: false,
      level: { min: 1, max: 5 },
      'uses-by-level': { '1': 1, '2': 1, '3': 1, '4': 1, '5': 1 },
      'variables-by-level': {
        '1': { health: 20 }, '2': { health: 35 }, '3': { health: 55 },
        '4': { health: 80 }, '5': { health: 110 },
      },
      effects: { health: 20, hunger: 0, saturation: 0 },
      'user-requirements-by-level': { level: {}, class: {} },
      usage: {
        RIGHT: {
          cooldown: 3.0,
          actions: {
            default: {
              'target-selectors': {},
              conditions: { list: [], 'actions-on-fail': 'CANCEL' },
              'action-executors': [],
            },
          },
        },
      },
    },

    food: {
      material: 'BREAD',
      name: '&6Hearty Burger',
      lore: ['&7Restores hunger and saturation.'],
      tier: 'common',
      enchanted: false,
      'item-flags': ['HIDE_ATTRIBUTES'],
      unbreakable: false,
      level: { min: 1, max: 1 },
      'uses-by-level': { '1': 1 },
      'variables-by-level': { '1': { hunger: 6, saturation: 12 } },
      effects: { health: 0, hunger: 6, saturation: 12 },
      'user-requirements-by-level': { level: {}, class: {} },
      usage: {
        RIGHT: {
          cooldown: 1.0,
          actions: { default: { 'target-selectors': {}, conditions: { list: [] }, 'action-executors': [] } },
        },
      },
    },

  },

};
window.ITEM_TEMPLATES = ITEM_TEMPLATES;

// ---------------------------------------------------------------------------

function removeEntryBtn(sid, key) {
  return `<button class="btn-icon btn-del" title="Remove entry"
    onclick="if(confirm('Remove \\'${esc(key)}\\'?'))APP.removeEntry('${sid}','${esc(key)}')">🗑</button>`;
}

// ---------------------------------------------------------------------------
// Shared card helpers
// ---------------------------------------------------------------------------

function cardRow(label, content) {
  return `<div class="info-row"><span class="info-label">${label}</span><div style="flex:1">${content}</div></div>`;
}

function cardRowFormat(sid, id, format) {
  return cardRow('Lore format',
    `${editText(sid, `${id}.format`, format, 'edit-input--format')}
     <span class="mc-preview mc-preview--live">${mc.toHtml(format)}</span>`);
}

// ---------------------------------------------------------------------------
// Formula helpers (evalFormula used by app.js recalcFormulaPreview)
// ---------------------------------------------------------------------------

function evalFormula(formula, vars) {
  try {
    let expr = formula
      .replace(/damage/g,    vars.damage)
      .replace(/defense/g,   vars.defense)
      .replace(/toughness/g, vars.toughness || 0);
    if (/[a-zA-Z_$]/.test(expr)) return null;
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + expr + ')')();
    return typeof result === 'number' && isFinite(result) ? Math.max(0, result) : null;
  } catch (_) { return null; }
}

/**
 * Calculate damage output using the correct formula for the active mode.
 * @param {string} mode        'FACTOR' | 'CUSTOM' | 'LEGACY'
 * @param {string} customExpr  Custom formula expression (only used for CUSTOM mode)
 * @param {{damage:number, defense:number, toughness?:number}} vars
 * @returns {number|null}
 */
function evalForMode(mode, customExpr, vars) {
  if (mode === 'LEGACY') {
    // Legacy: simple 1:1 subtraction, minimum 0
    return Math.max(0, vars.damage - vars.defense);
  }
  if (mode === 'FACTOR') {
    // Divinity default factor formula (Minecraft-like diminishing returns)
    return evalFormula('damage*(25/(25+defense))', vars);
  }
  // CUSTOM: user-defined expression
  return evalFormula(customExpr, vars);
}

function buildFormulaPreviewRows(mode, customF) {
  let rows = '';

  // Fixed rows — Damage in is always 100, defense varies per case.
  SCHEMA.formulaPreviewCases.forEach((c, i) => {
    const result    = evalForMode(mode, customF, c);
    const dmgOut    = result !== null ? result.toFixed(2) : '?';
    const reduction = result !== null ? ((1 - result / c.damage) * 100).toFixed(1) + '%' : '?';
    const clr       = result !== null && result < c.damage / 2 ? 'var(--green)' : 'var(--red)';
    rows += `
      <tr>
        <td class="num">100</td>
        <td class="num">${c.defense}</td>
        <td class="num" style="color:${clr}" id="preview-out-${i}">${dmgOut}</td>
        <td class="num" id="preview-red-${i}">${reduction}</td>
      </tr>`;
  });

  // Custom editable row — user sets any damage + defense, output is live-calculated.
  const { dmgIn, defIn } = FORMULA_PREVIEW;
  const res = evalForMode(mode, customF, { damage: dmgIn, defense: defIn, toughness: 0 });
  const out = res !== null ? res.toFixed(2) : '?';
  const red = res !== null ? ((1 - res / dmgIn) * 100).toFixed(1) + '%' : '?';
  const clr = res !== null && res < dmgIn / 2 ? 'var(--green)' : 'var(--red)';
  rows += `
    <tr class="custom-preview-row" title="Custom test — edit damage and defense">
      <td class="num">
        <input id="custom-dmg-in" class="edit-input edit-input--inline" type="number"
               value="${dmgIn}" oninput="APP.setPreviewDmg(+this.value)" style="width:64px">
      </td>
      <td class="num">
        <input id="custom-def-in" class="edit-input edit-input--inline" type="number"
               value="${defIn}" oninput="APP.setPreviewDef(+this.value)" style="width:64px">
      </td>
      <td class="num" style="color:${clr}" id="custom-dmg-out">${out}</td>
      <td class="num" id="custom-reduction">${red}</td>
    </tr>`;
  return rows;
}

// ===========================================================================
// SECTION RENDERERS
// ===========================================================================

// ---------------------------------------------------------------------------
// Formula (engine.yml)
// ---------------------------------------------------------------------------

function renderFormula(data, sid) {
  const combat  = data.combat || data;
  const mode    = String(combat['defense-formula'] || 'FACTOR').toUpperCase();
  const customF = combat['custom-defense-formula'] || 'damage*(25/(25+defense))';
  const legacy  = combat['legacy-combat'] === true;
  const modeDef = SCHEMA.formulaModes[mode] || SCHEMA.formulaModes['FACTOR'];

  const modeButtons = Object.entries(SCHEMA.formulaModes).map(([m, def]) => {
    const active = m === mode
      ? `style="border-color:${def.color};color:${def.color};background:${def.color}18"` : '';
    return `<span class="mode-btn mode-btn--click" ${active}
      onclick="APP.setFormulaMode('${sid}','${m}')" title="${def.description}">${m}${m === mode ? ' ✓' : ''}</span>`;
  }).join('');

  const fPath = data.combat ? 'combat.custom-defense-formula' : 'custom-defense-formula';

  return `
    <div class="info-banner" style="border-color:${modeDef.color}">
      <div class="info-banner__title" style="color:${modeDef.color}">Active mode: ${mode}</div>
      <div class="info-banner__desc">${modeDef.description}</div>
    </div>
    ${legacy ? '<div class="alert alert-warn">⚠️ <b>legacy-combat: true</b> is enabled.</div>' : ''}
    ${modeDef.flatPenWarn ? '<div class="alert alert-warn">⚠️ Flat penetration does not work in this mode. Requires CUSTOM.</div>' : ''}

    <h3>Formula mode</h3>
    <div class="mode-btns">${modeButtons}</div>
    <p class="muted small" style="margin-top:6px">Click a mode to switch.</p>

    <h3 style="margin-top:20px">Custom defense formula</h3>
    <input class="edit-input edit-input--formula" type="text" value="${esc(customF)}"
           oninput="APP.updateFormulaExpr('${sid}','${fPath}',this.value)">
    <p class="muted small" style="margin-top:4px">
      Variables: <code>damage</code>, <code>defense</code>, <code>defense_&lt;id&gt;</code>, <code>toughness</code>
    </p>

    <h3 style="margin-top:20px">Formula preview</h3>
    <p class="muted small" style="margin-bottom:8px">
      Last row is editable — enter any damage + defense values.
    </p>
    <table class="tbl">
      <thead><tr><th>Damage in</th><th>Defense</th><th>Damage out</th><th>Reduction %</th></tr></thead>
      <tbody id="formula-preview-body">${buildFormulaPreviewRows(mode, customF)}</tbody>
    </table>`;
}

// ---------------------------------------------------------------------------
// General Stats (general_stats.yml)
// ---------------------------------------------------------------------------

function renderGeneralStats(data, sid) {
  const entries = Object.entries(data).filter(([, v]) => v && typeof v === 'object');
  const TPL = { name: 'New Stat', format: '&7%value%', capacity: 200, enabled: true };

  const rows = entries.map(([id, stat]) => {
    const enabled = stat.enabled !== false;
    const enId    = safeId(sid, id, 'en');
    const isNew   = (SYNCED_NEW[sid] || new Set()).has(id);
    return `
      <tr class="data-row${enabled ? '' : ' row-disabled'}${isNew ? ' entry-new' : ''}">
        <td>${editId(sid, id)} ${isNew ? '<span class="badge badge-blue">new</span>' : ''}</td>
        <td>${editText(sid, `${id}.name`, stat.name ?? id)}</td>
        <td>
          ${editText(sid, `${id}.format`, stat.format ?? '', 'edit-input--format')}
          <span class="mc-preview mc-preview--live">${mc.toHtml(stat.format ?? '')}</span>
        </td>
        <td>${editNum(sid, `${id}.capacity`, stat.capacity ?? -1)}</td>
        <td>
          ${liveCheck(sid, `${id}.enabled`, enabled, enId, 'enabled')}
          ${liveBadge(enabled, enId, 'enabled')}
        </td>
        <td>${removeEntryBtn(sid, id)}</td>
      </tr>`;
  }).join('');

  return `
    <div class="entry-actions">${addEntryBtn(sid, TPL, 'Add stat')}</div>
    <input class="search-input" type="text" placeholder="🔍 Search stats…"
           oninput="APP.filterTable('tbl-general',this.value)">
    <table class="tbl" id="tbl-general">
      <thead><tr><th>ID</th><th>Name</th><th>Lore format</th><th>Capacity</th><th>Enabled</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ---------------------------------------------------------------------------
// Damage Types (damage.yml)
// ---------------------------------------------------------------------------

function renderDamage(data, sid) {
  const entries = Object.entries(data)
    .filter(([, v]) => v && typeof v === 'object')
    .sort(([, a], [, b]) => (b.priority || 0) - (a.priority || 0));

  const TPL = {
    name: 'New Type', format: '&2▸ %name%: &f%value%', priority: 1,
    'attached-damage-causes': [],
    'biome-damage-modifiers': {},
    'on-hit-actions': {},
    'entity-type-modifier': {},
    'mythic-mob-faction-modifier': {},
  };

  const cards = entries.map(([id, dt]) => {
    const isNew = (SYNCED_NEW[sid] || new Set()).has(id);
    return `
      <div class="item-card${isNew ? ' entry-new' : ''}">
        <details class="card-details" data-key="${esc(sid)}-card-${esc(id)}" open>
          <summary class="item-card__header">
            <span class="item-card__icon">🗡️</span>
            ${editId(sid, id)}
            ${isNew ? '<span class="badge badge-blue">new</span>' : ''}
            ${removeEntryBtn(sid, id)}
          </summary>
          <div class="item-card__body">
            ${cardRow('Name',     editText(sid, `${id}.name`, dt.name ?? id))}
            ${cardRow('Priority', editNum(sid,  `${id}.priority`, dt.priority ?? 1, 'edit-input--inline'))}
            ${cardRowFormat(sid, id, dt.format ?? '')}
            ${cardRow('Attached causes',      lineArrayField(sid, `${id}.attached-damage-causes`,      dt['attached-damage-causes']      ?? []))}
            ${cardRow('Biome modifiers',      jsonTextarea(sid, `${id}.biome-damage-modifiers`,      dt['biome-damage-modifiers']      ?? {}))}
            ${cardRow('On-hit actions',       jsonTextarea(sid, `${id}.on-hit-actions`,              dt['on-hit-actions']              ?? {}))}
            ${cardRow('Entity modifiers',     jsonTextarea(sid, `${id}.entity-type-modifier`,        dt['entity-type-modifier']        ?? {}))}
            ${cardRow('Faction modifiers',    jsonTextarea(sid, `${id}.mythic-mob-faction-modifier`, dt['mythic-mob-faction-modifier'] ?? {}))}
          </div>
        </details>
      </div>`;
  }).join('');

  return `
    <div class="entry-actions">${addEntryBtn(sid, TPL, 'Add damage type')} ${collapseAllBtn()}</div>
    <div class="cards-grid">${cards || '<div class="empty-state">No damage types found.</div>'}</div>`;
}

// ---------------------------------------------------------------------------
// Defense Types (defense.yml)
// ---------------------------------------------------------------------------

function renderDefense(data, sid) {
  const entries = Object.entries(data)
    .filter(([, v]) => v && typeof v === 'object')
    .sort(([, a], [, b]) => (b.priority || 0) - (a.priority || 0));

  const TPL = {
    name: 'New Defense', format: '&2▸ %name%: &f%value%', priority: 1,
    'block-damage-types': [], 'protection-factor': 1.0,
  };

  const cards = entries.map(([id, dt]) => {
    const isNew = (SYNCED_NEW[sid] || new Set()).has(id);
    return `
      <div class="item-card${isNew ? ' entry-new' : ''}">
        <details class="card-details" data-key="${esc(sid)}-card-${esc(id)}" open>
          <summary class="item-card__header">
            <span class="item-card__icon">🛡️</span>
            ${editId(sid, id)}
            ${isNew ? '<span class="badge badge-blue">new</span>' : ''}
            ${removeEntryBtn(sid, id)}
          </summary>
          <div class="item-card__body">
            ${cardRow('Name',              editText(sid, `${id}.name`, dt.name ?? id))}
            ${cardRow('Priority',          editNum(sid,  `${id}.priority`, dt.priority ?? 1, 'edit-input--inline'))}
            ${cardRow('Protection factor', editNum(sid,  `${id}.protection-factor`, dt['protection-factor'] ?? 1.0, 'edit-input--inline'))}
            ${cardRowFormat(sid, id, dt.format ?? '')}
            ${cardRow('Blocks damage types', lineArrayField(sid, `${id}.block-damage-types`, dt['block-damage-types'] ?? []))}
          </div>
        </details>
      </div>`;
  }).join('');

  return `
    <div class="entry-actions">${addEntryBtn(sid, TPL, 'Add defense type')} ${collapseAllBtn()}</div>
    <div class="cards-grid">${cards || '<div class="empty-state">No defense types found.</div>'}</div>`;
}

// ---------------------------------------------------------------------------
// Penetration (penetration.yml)
// ---------------------------------------------------------------------------

function renderPenetration(data, sid) {
  const entries = Object.entries(data).filter(([, v]) => v && typeof v === 'object');

  const TPL = {
    name: 'New Penetration', format: '&f%value%',
    'percent-pen': false, capacity: 100, hooks: [], enabled: true,
  };

  const cards = entries.map(([id, pt]) => {
    const enabled = pt.enabled !== false;
    const isPct   = pt['percent-pen'] === true;
    const enId    = safeId(sid, id, 'en');
    const pctId   = safeId(sid, id, 'pct');
    const isNew   = (SYNCED_NEW[sid] || new Set()).has(id);
    return `
      <div class="item-card${isNew ? ' entry-new' : ''}${enabled ? '' : ' card-disabled'}">
        <details class="card-details" data-key="${esc(sid)}-card-${esc(id)}" open>
          <summary class="item-card__header">
            <span class="item-card__icon">🎯</span>
            ${editId(sid, id)}
            ${liveBadge(isPct, pctId, 'percent-pen')}
            ${liveBadge(enabled, enId, 'enabled')}
            ${isNew ? '<span class="badge badge-blue">new</span>' : ''}
            ${removeEntryBtn(sid, id)}
          </summary>
          <div class="item-card__body">
            ${cardRow('Name',     editText(sid, `${id}.name`, pt.name ?? id))}
            ${cardRow('Capacity', editNum(sid,  `${id}.capacity`, pt.capacity ?? 100, 'edit-input--inline'))}
            ${cardRowFormat(sid, id, pt.format ?? '')}
            ${cardRow('% Pen',
              `${liveCheck(sid, `${id}.percent-pen`, isPct, pctId, 'percent-pen')}
               <span class="muted small">Checked = percent, unchecked = flat</span>`)}
            ${cardRow('Enabled', liveCheck(sid, `${id}.enabled`, enabled, enId, 'enabled'))}
            ${cardRow('Hooks (damage types)', jsonTextarea(sid, `${id}.hooks`, pt.hooks ?? []))}
          </div>
        </details>
      </div>`;
  }).join('');

  return `
    <div class="entry-actions">${addEntryBtn(sid, TPL, 'Add penetration stat')} ${collapseAllBtn()}</div>
    <div class="alert alert-info">
      ℹ️ <b>Flat</b> pen (unchecked) only works in CUSTOM formula mode.
      <b>%</b> pen (checked) works in all modes.
    </div>
    <div class="cards-grid">${cards || '<div class="empty-state">No penetration stats.</div>'}</div>`;
}

// ---------------------------------------------------------------------------
// Damage / Defense Buffs — shared, card layout
// ---------------------------------------------------------------------------

function renderBuffs(data, sid) {
  const entries = Object.entries(data).filter(([, v]) => v && typeof v === 'object');
  const isDmg   = sid === 'dmgbuff';

  const TPL = {
    name: 'New Buff', format: isDmg ? '&a+%value%%' : '&7+%value%%',
    capacity: 200, hook: [], enabled: true,
  };

  const cards = entries.map(([id, bt]) => {
    const enabled = bt.enabled !== false;
    const enId    = safeId(sid, id, 'en');
    const isNew   = (SYNCED_NEW[sid] || new Set()).has(id);
    return `
      <div class="item-card${isNew ? ' entry-new' : ''}${enabled ? '' : ' card-disabled'}">
        <details class="card-details" data-key="${esc(sid)}-card-${esc(id)}" open>
          <summary class="item-card__header">
            <span class="item-card__icon">${isDmg ? '🔥' : '🛡'}</span>
            ${editId(sid, id)}
            ${liveBadge(enabled, enId, 'enabled')}
            ${isNew ? '<span class="badge badge-blue">new</span>' : ''}
            ${removeEntryBtn(sid, id)}
          </summary>
          <div class="item-card__body">
            ${cardRow('Name',     editText(sid, `${id}.name`, bt.name ?? id))}
            ${cardRow('Capacity', editNum(sid,  `${id}.capacity`, bt.capacity ?? 200, 'edit-input--inline'))}
            ${cardRowFormat(sid, id, bt.format ?? '')}
            ${cardRow('Enabled', liveCheck(sid, `${id}.enabled`, enabled, enId, 'enabled'))}
            ${cardRow('Hooks (damage types)', jsonTextarea(sid, `${id}.hook`, bt.hook ?? []))}
          </div>
        </details>
      </div>`;
  }).join('');

  const empty = '<div class="empty-state">No entries. Auto-generated by server on startup, or add manually.</div>';

  return `
    <div class="entry-actions">${addEntryBtn(sid, TPL, `Add ${isDmg ? 'damage' : 'defense'} buff`)} ${collapseAllBtn()}</div>
    <div class="cards-grid">${cards || empty}</div>`;
}

// ===========================================================================
// ITEM GENERATOR — multi-file, fully structured renderer
// ===========================================================================

// ---- ig* helpers (mirror of edit* but operate on multiFile STATE) ----

function escJs(v) {
  return String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function igField(sid, fname, path, val, cls = '') {
  return `<input class="edit-input ${cls}" type="text" value="${esc(val)}"
    oninput="APP.igUpdateField('${sid}','${escJs(fname)}','${escJs(path)}',this.value)">`;
}

function igNum(sid, fname, path, val) {
  return `<input class="edit-input edit-input--num" type="number" value="${esc(val)}"
    oninput="APP.igUpdateField('${sid}','${escJs(fname)}','${escJs(path)}',+this.value)">`;
}

function igJson(sid, fname, path, value) {
  const isArr = Array.isArray(value);
  const json  = JSON.stringify(value ?? (isArr ? [] : {}), null, 2);
  const rows  = isArr
    ? Math.max(3, (value?.length ?? 0) + 2)
    : Math.max(3, Object.keys(value ?? {}).length + 2);
  return `<textarea class="obj-textarea" rows="${rows}"
    onblur="APP.igUpdateJson('${sid}','${escJs(fname)}','${escJs(path)}',this.value)">${esc(json)}</textarea>`;
}

function igCheck(sid, fname, path, val) {
  return `<input class="edit-check" type="checkbox" ${val ? 'checked' : ''}
    onchange="APP.igUpdateField('${sid}','${escJs(fname)}','${escJs(path)}',this.checked)">`;
}

/**
 * Line-by-line textarea for string arrays — item-gen version (writes back via igUpdateLineArray).
 */
function igLineArray(sid, fname, path, value) {
  const arr  = Array.isArray(value) ? value : [];
  const text = arr.join('\n');
  const rows = Math.max(2, arr.length + 1);
  return `<textarea class="obj-textarea" rows="${rows}" placeholder="one value per line"
    onblur="APP.igUpdateLineArray('${sid}','${escJs(fname)}','${escJs(path)}',this.value)">${esc(text)}</textarea>`;
}

/**
 * Line-by-line key-value textarea for item-gen objects.
 * Format: "key value" one per line (e.g. "efficiency 1:2").
 */
function igLineKvField(sid, fname, path, value, placeholder = 'key value') {
  const obj  = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  const text = Object.entries(obj).map(([k, v]) => `${k} ${v}`).join('\n');
  const rows = Math.max(2, Object.keys(obj).length + 1);
  return `<textarea class="obj-textarea" rows="${rows}" placeholder="${placeholder} (one per line)"
    onblur="APP.igUpdateLineKv('${sid}','${escJs(fname)}','${escJs(path)}',this.value)">${esc(text)}</textarea>`;
}

/**
 * Skills list editor — min/max count + per-skill entries.
 */
function igSkillsList(sid, fname, basePath, skillsData) {
  if (!skillsData || typeof skillsData !== 'object') skillsData = {};
  const listPath = `${basePath}.list`;
  const list     = skillsData.list ?? {};
  const skillEntries = Object.entries(list).map(([key, sk]) => {
    if (!sk || typeof sk !== 'object') return '';
    const loreLines = sk['lore-format'] ?? [];
    return `
      <div style="border:1px solid #333;border-radius:4px;margin-bottom:6px;padding:8px 10px;background:#1a1a1a">
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
          <input class="edit-input" style="flex:1;min-width:120px" value="${esc(key)}" title="Skill name"
            onblur="if(this.value.trim()&&this.value.trim()!=='${escJs(key)}')APP.igRenameSkill('${sid}','${escJs(fname)}','${escJs(listPath)}','${escJs(key)}',this.value.trim())"
            onkeydown="if(event.key==='Enter')this.blur()">
          <span class="muted" style="font-size:11px">chance%</span>
          <input class="edit-input edit-input--num" style="width:60px" type="number" min="0" max="100"
            value="${esc(sk.chance ?? 0)}" title="Chance 0–100"
            oninput="APP.igUpdateField('${sid}','${escJs(fname)}','${escJs(listPath+'.'+key+'.chance')}',+this.value)">
          <span class="muted" style="font-size:11px">lvl</span>
          <input class="edit-input edit-input--num" style="width:50px" type="number" min="1"
            value="${esc(sk['min-level'] ?? 1)}" title="Min level"
            oninput="APP.igUpdateField('${sid}','${escJs(fname)}','${escJs(listPath+'.'+key+'.min-level')}',+this.value)">
          <span class="muted">–</span>
          <input class="edit-input edit-input--num" style="width:50px" type="number" min="1"
            value="${esc(sk['max-level'] ?? 1)}" title="Max level"
            oninput="APP.igUpdateField('${sid}','${escJs(fname)}','${escJs(listPath+'.'+key+'.max-level')}',+this.value)">
          <button style="padding:2px 6px;background:#3a1e1e;border:1px solid #8a3a3a;border-radius:3px;color:#ea8f8f;cursor:pointer;font-size:11px;margin-left:auto"
            onclick="if(confirm('Remove skill \\'${escJs(key)}\\'?'))APP.igRemoveSkill('${sid}','${escJs(fname)}','${escJs(listPath)}','${escJs(key)}')">🗑</button>
        </div>
        <div style="font-size:11px;color:#888;margin-bottom:3px">Lore (one line per entry):</div>
        ${igLineArray(sid, fname, `${listPath}.${key}.lore-format`, loreLines)}
        ${loreLines.length ? lorePreview(loreLines) : ''}
      </div>`;
  }).join('');

  return `
    <div class="info-row">
      <span class="info-label">Min / Max skills</span>
      <div style="display:flex;gap:6px;align-items:center">
        ${igNum(sid, fname, `${basePath}.minimum`, skillsData.minimum ?? 0)}
        <span class="muted">–</span>
        ${igNum(sid, fname, `${basePath}.maximum`, skillsData.maximum ?? 0)}
      </div>
    </div>
    <div style="margin-top:8px">${skillEntries || '<p class="muted small">No skills defined yet.</p>'}</div>
    <button class="btn-add-entry" style="margin-top:4px"
      onclick="APP.igAddSkill('${sid}','${escJs(fname)}','${escJs(basePath)}')">+ Add skill</button>`;
}

/**
 * Render item-flags as toggle buttons.
 * Active flags shown in green, inactive in gray.
 * Special '*' (ALL) is always shown first.
 */
const ITEM_FLAGS_ALL = ['*', 'HIDE_ENCHANTS', 'HIDE_ATTRIBUTES', 'HIDE_UNBREAKABLE',
  'HIDE_DESTROYS', 'HIDE_PLACED_ON', 'HIDE_POTION_EFFECTS', 'HIDE_DYE'];

function igItemFlags(sid, fname, flags) {
  const active = new Set(Array.isArray(flags) ? flags : []);
  return `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:2px">${
    ITEM_FLAGS_ALL.map(flag => {
      const on = active.has(flag);
      return `<button
        title="${flag === '*' ? 'All flags (hide everything)' : flag}"
        style="padding:2px 8px;font-size:11px;cursor:pointer;border-radius:3px;border:1px solid ${on ? '#4a8a4a' : '#555'};background:${on ? '#1e3a1e' : '#2a2a2a'};color:${on ? '#8fea8f' : '#aaa'};white-space:nowrap"
        onclick="APP.igToggleFlag('${sid}','${escJs(fname)}','${escJs(flag)}')">${flag === '*' ? 'ALL (*)' : flag.replace('HIDE_', '')}</button>`;
    }).join('')
  }</div>`;
}

/** Render MC-colored preview of a lore/lore-format line array. */
function lorePreview(lines) {
  if (!Array.isArray(lines) || !lines.length) return '<p class="muted small" style="margin-top:4px">No lines.</p>';
  return `<div class="lore-preview">${
    lines.map(l => l === ''
      ? '<div class="lore-line lore-blank"></div>'
      : `<div class="lore-line">${mc.toHtml(String(l))}</div>`
    ).join('')
  }</div>`;
}

/** lore-format textarea + MC preview. */
function igLoreFormat(sid, fname, path, lines) {
  return `
    ${igJson(sid, fname, path, lines ?? [])}
    ${lorePreview(lines ?? [])}`;
}

/**
 * Sync button — syncs BOTH lore-format AND stat pool from loaded stats.
 * loreFormatPath : dot-path to the lore-format array
 * poolPath       : dot-path to the pool object (where stat entries live)
 * source         : "section:<sid>" | "local:<path>"
 * prefix         : placeholder prefix, e.g. "DAMAGE_"
 */
function igSyncBtn(sid, fname, loreFormatPath, poolPath, source, prefix) {
  return `<button title="Sync lore-format AND add missing pool entries from ${source}"
    style="margin-left:6px;padding:2px 8px;font-size:11px;cursor:pointer;background:#1e3a1e;border:1px solid #4a8a4a;border-radius:3px;color:#8fea8f;white-space:nowrap;vertical-align:middle"
    onclick="APP.igSync('${sid}','${escJs(fname)}','${escJs(loreFormatPath)}','${escJs(poolPath)}','${source}','${prefix}')">↺ Sync</button>`;
}

function igCollapsible(title, content, open = false) {
  // Strip HTML tags to get a stable key unaffected by dynamic badge counts
  const key = title.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return `<details class="ig-section"${open ? ' open' : ''} data-key="${esc(key)}">
    <summary class="ig-section__title">${title}</summary>
    <div class="ig-section__body">${content}</div>
  </details>`;
}

/** Compact table of stat pool entries (chance/scale/min/max/flat/round). */
function buildStatPool(sid, fname, basePath, listData) {
  if (!listData || typeof listData !== 'object') return '<p class="muted small">No entries.</p>';
  const entries = Object.entries(listData).filter(([k, v]) => k !== 'lore-format' && v && typeof v === 'object');
  if (!entries.length) return '<p class="muted small">No entries.</p>';

  const rows = entries.map(([id, e]) => {
    const p      = `${basePath}.${id}`;
    const active = (e.chance ?? 0) > 0;
    return `<tr class="${active ? '' : 'row-disabled'}">
      <td><code>${esc(id)}</code></td>
      <td>${igNum(sid, fname, `${p}.chance`, e.chance ?? 0)}</td>
      <td>${igNum(sid, fname, `${p}.scale-by-level`, e['scale-by-level'] ?? 1.0)}</td>
      <td>${igNum(sid, fname, `${p}.min`, e.min ?? 0)}</td>
      <td>${igNum(sid, fname, `${p}.max`, e.max ?? 0)}</td>
      <td style="text-align:center">${igCheck(sid, fname, `${p}.flat-range`, !!e['flat-range'])}</td>
      <td style="text-align:center">${igCheck(sid, fname, `${p}.round`,      !!e.round)}</td>
    </tr>`;
  }).join('');

  return `<table class="tbl tbl-compact">
    <thead><tr>
      <th>Stat ID</th><th>Chance %</th><th>Scale/lvl</th><th>Min</th><th>Max</th><th>Flat</th><th>Round</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/** Collapsible section for damage-types / defense-types / fabled-attributes. */
function buildStatGroup(sid, fname, basePath, groupData, title, syncSource, syncPrefix) {
  if (!groupData || typeof groupData !== 'object') return '';
  const list   = groupData.list ?? {};
  const active = Object.entries(list).filter(([k, v]) => k !== 'lore-format' && (v?.chance ?? 0) > 0).length;

  const loreFormatRow = igLoreFormat(sid, fname, `${basePath}.lore-format`, groupData['lore-format'] ?? [])
    + (syncSource ? igSyncBtn(sid, fname, `${basePath}.lore-format`, `${basePath}.list`, syncSource, syncPrefix) : '');

  const content = `
    <div class="info-row">
      <span class="info-label">Min / Max</span>
      <div style="display:flex;gap:6px;align-items:center">
        ${igNum(sid, fname, `${basePath}.minimum`, groupData.minimum ?? 0)}
        <span class="muted">–</span>
        ${igNum(sid, fname, `${basePath}.maximum`, groupData.maximum ?? 0)}
      </div>
    </div>
    ${cardRow('Lore format', loreFormatRow)}
    <p class="ig-subhead">Stat pool — ${active} active</p>
    ${buildStatPool(sid, fname, `${basePath}.list`, list)}`;

  return igCollapsible(
    `${title} <span class="badge badge-blue" style="font-size:10px">${active} active</span>`,
    content
  );
}

/** Collapsible for item-stats (has 4 sub-lists). */
function buildItemStatsGroup(sid, fname, basePath, groupData) {
  if (!groupData || typeof groupData !== 'object') return '';
  const list   = groupData.list                ?? {};
  const dmgBuf = groupData['list-damage-buffs']  ?? {};
  const defBuf = groupData['list-defense-buffs'] ?? {};
  const pen    = groupData['list-penetration']   ?? {};
  const active = Object.entries(list).filter(([, v]) => (v?.chance ?? 0) > 0).length;

  const subList = (label, subBasePath, subData, syncSource, syncPrefix) => {
    // Always render (even if empty) so the Sync button is accessible
    const loreRow = igLoreFormat(sid, fname, `${subBasePath}.lore-format`, subData['lore-format'] ?? [])
      + igSyncBtn(sid, fname, `${subBasePath}.lore-format`, subBasePath, syncSource, syncPrefix);
    return `
      <p class="ig-subhead">${label}</p>
      ${cardRow('Lore format', loreRow)}
      ${buildStatPool(sid, fname, subBasePath, subData)}`;
  };

  const mainLoreRow = igLoreFormat(sid, fname, `${basePath}.lore-format`, groupData['lore-format'] ?? [])
    + igSyncBtn(sid, fname, `${basePath}.lore-format`, `${basePath}.list`, `local:${basePath}.list`, 'ITEM_STAT_');

  const content = `
    <div class="info-row">
      <span class="info-label">Min / Max</span>
      <div style="display:flex;gap:6px;align-items:center">
        ${igNum(sid, fname, `${basePath}.minimum`, groupData.minimum ?? 0)}
        <span class="muted">–</span>
        ${igNum(sid, fname, `${basePath}.maximum`, groupData.maximum ?? 0)}
      </div>
    </div>
    ${cardRow('Lore format', mainLoreRow)}
    <p class="ig-subhead">General stats — ${active} active</p>
    ${buildStatPool(sid, fname, `${basePath}.list`, list)}
    ${subList('Damage buffs %',  `${basePath}.list-damage-buffs`,  dmgBuf, 'section:dmgbuff',     'DAMAGE_BUFF_')}
    ${subList('Defense buffs %', `${basePath}.list-defense-buffs`, defBuf, 'section:defbuff',     'DEFENSE_BUFF_')}
    ${subList('Penetration',     `${basePath}.list-penetration`,   pen,    'section:penetration', 'PENETRATION_')}`;

  return igCollapsible(
    `📊 Item Stats <span class="badge badge-blue" style="font-size:10px">${active} general active</span>`,
    content
  );
}

/** Collapsible sockets section (GEM / ESSENCE / RUNE). */
function buildSocketsSection(sid, fname, socketsData) {
  if (!socketsData || typeof socketsData !== 'object' || !Object.keys(socketsData).length) return '';

  // Maps socket type key → module sid → icon
  const TYPE_MODULE = { GEM: ['gems','💎'], ESSENCE: ['essences','✨'], RUNE: ['runes','🔷'] };

  const inner = Object.entries(socketsData).map(([type, td]) => {
    if (!td || typeof td !== 'object') return '';
    const bp = `generator.sockets.${type}`;

    // Show loaded socket items for this type as a reference list
    const [modSid, modIcon] = TYPE_MODULE[type] ?? [null, '📦'];
    const loadedItems = modSid ? Object.keys(STATE.loaded?.[modSid]?.files || {}) : [];
    const loadedHint = loadedItems.length
      ? `<p class="muted small" style="margin-top:6px">${modIcon} Loaded ${type} items: ${loadedItems.map(f => `<code>${esc(f)}</code>`).join(', ')}</p>`
      : modSid
        ? `<p class="muted small" style="margin-top:6px;color:#f80">No ${type} files loaded yet — go to <b>${type[0]+type.slice(1).toLowerCase()}s</b> module.</p>`
        : '';

    const socketSyncBtn = modSid
      ? `<button title="Sync lore-format and pool from loaded ${modSid} files (reads tier values)"
          style="margin-left:6px;padding:2px 8px;font-size:11px;cursor:pointer;background:#1e3a1e;border:1px solid #4a8a4a;border-radius:3px;color:#8fea8f;white-space:nowrap;vertical-align:middle"
          onclick="APP.igSyncSocket('${sid}','${escJs(fname)}','${type}','${modSid}')">↺ Sync from ${modSid}</button>`
      : '';

    return igCollapsible(`${modIcon} ${type}`, `
      <div class="info-row">
        <span class="info-label">Min / Max slots</span>
        <div style="display:flex;gap:6px;align-items:center">
          ${igNum(sid, fname, `${bp}.minimum`, td.minimum ?? 0)}
          <span class="muted">–</span>
          ${igNum(sid, fname, `${bp}.maximum`, td.maximum ?? 0)}
        </div>
      </div>
      ${cardRow('Lore format', igLoreFormat(sid, fname, `${bp}.lore-format`, td['lore-format'] ?? []) + socketSyncBtn)}
      <p class="ig-subhead">Socket pool (category → chance) ${socketSyncBtn}</p>
      ${buildStatPool(sid, fname, `${bp}.list`, td.list ?? {})}
      ${loadedHint}`);
  }).join('');

  return igCollapsible('🔮 Sockets', inner);
}

/** Render one item-generator YAML file as a structured card. */
function renderItemGenFile(sid, fname, data, family) {
  if (!data || typeof data !== 'object') return '';
  const gen    = data.generator || {};
  const lvl    = data.level     || {};
  const tier   = String(data.tier ?? '?');
  const minLvl = lvl.min ?? 1;
  const maxLvl = lvl.max ?? 50;
  const lore   = data.lore ?? [];

  const dmgTypes  = gen['damage-types']      || {};
  const defTypes  = gen['defense-types']     || {};
  const itemStats = gen['item-stats']        || {};
  const fabledAttr= gen['fabled-attributes'] || {};

  const dmgActive  = Object.entries(dmgTypes.list  || {}).filter(([k, v]) => k !== 'lore-format' && (v?.chance ?? 0) > 0).length;
  const defActive  = Object.entries(defTypes.list  || {}).filter(([k, v]) => k !== 'lore-format' && (v?.chance ?? 0) > 0).length;
  const statActive = Object.entries(itemStats.list || {}).filter(([k, v]) => k !== 'lore-format' && (v?.chance ?? 0) > 0).length;

  // Socket counts from generator.sockets
  const sockets   = gen.sockets || {};
  const gemMax    = sockets.GEM?.maximum     ?? 0;
  const essMax    = sockets.ESSENCE?.maximum ?? 0;
  const runeMax   = sockets.RUNE?.maximum    ?? 0;

  const familyVal  = family ?? '';
  const collapsed  = !!(STATE.loaded[sid]?._collapsed?.[fname]);

  const header = `
    <div class="item-card__header">
      <span class="ig-drag-handle" title="Drag to move to another folder">⠿</span>
      <button class="ig-collapse-btn" title="${collapsed ? 'Expand' : 'Collapse'}"
        onclick="APP.igToggleCollapse('${sid}','${escJs(fname)}')">
        ${collapsed ? '▶' : '▼'}
      </button>
      <span class="item-card__icon">⚗️</span>
      <span style="font-weight:600;color:#fff">${esc(fname)}</span>
      <span class="badge badge-yellow">${esc(tier)}</span>
      <span class="badge">lv ${minLvl}–${maxLvl}</span>
      ${dmgActive  ? `<span class="badge badge-red"   title="Active damage types">${dmgActive}⚔</span>` : ''}
      ${defActive  ? `<span class="badge badge-blue"  title="Active defense types">${defActive}🛡</span>` : ''}
      ${statActive ? `<span class="badge badge-green" title="Active item stats">${statActive}📊</span>` : ''}
      ${gemMax  > 0 ? `<span class="badge" title="Max GEM sockets">💎×${gemMax}</span>`  : ''}
      ${essMax  > 0 ? `<span class="badge" title="Max ESSENCE sockets">✨×${essMax}</span>` : ''}
      ${runeMax > 0 ? `<span class="badge" title="Max RUNE sockets">🔷×${runeMax}</span>` : ''}
      <span class="ig-family-wrap" title="Folder">
        <span class="muted small">📁</span>
        <input class="edit-input edit-id ig-family-input" value="${esc(familyVal)}"
          placeholder="folder (optional)"
          oninput="APP.igSetFamily('${sid}','${escJs(fname)}',this.value.trim())">
      </span>
      <button class="btn-download" title="Download ${esc(fname)}"
        onclick="APP.igDownload('${sid}','${escJs(fname)}')">⬇</button>
      <button class="btn-icon btn-del" title="Remove from editor"
        onclick="if(confirm('Remove \\'${escJs(fname)}\\'?'))APP.igRemoveFile('${sid}','${escJs(fname)}')">🗑</button>
    </div>`;

  if (collapsed) {
    return `
  <div class="item-card ig-card ig-card--collapsed" draggable="true"
    ondragstart="APP.igDragStart('${sid}','${escJs(fname)}',event)">
    ${header}
  </div>`;
  }

  const mats    = gen.materials    ?? {};
  const bonuses = gen.bonuses      ?? {};
  const enchants = gen.enchantments ?? {};
  const shields  = gen['shield-patterns'] ?? {};

  return `
  <div class="item-card ig-card" draggable="true"
    ondragstart="APP.igDragStart('${sid}','${escJs(fname)}',event)">
    ${header}
    <div class="ig-card__body">

      ${igCollapsible('👁 Lore Preview', lorePreview(lore), true)}

      ${igCollapsible('📋 Basic Info', `
        ${cardRow('Name template',   igField(sid, fname, 'name', data.name ?? '', 'edit-input--format'))}
        ${cardRow('Tier',            igField(sid, fname, 'tier', tier, 'edit-input--inline'))}
        ${cardRow('Level min / max',
          `<div style="display:flex;gap:6px;align-items:center">
            ${igNum(sid, fname, 'level.min', minLvl)}
            <span class="muted">–</span>
            ${igNum(sid, fname, 'level.max', maxLvl)}
          </div>`)}
        ${cardRow('Color (R,G,B or -1,-1,-1)', igField(sid, fname, 'color', String(data.color ?? '-1,-1,-1'), 'edit-input--inline'))}
        ${cardRow('Unbreakable', igCheck(sid, fname, 'unbreakable', data.unbreakable === true))}
        ${cardRow('Enchanted',   igCheck(sid, fname, 'enchanted',   data.enchanted  === true))}
        ${cardRow('Durability %', igNum(sid, fname, 'durability',  data.durability  ?? 100))}
        ${cardRow('Model data',   igNum(sid, fname, 'model-data',  data['model-data'] ?? 0))}
        ${cardRow('Skull hash',   igField(sid, fname, 'skull-hash', data['skull-hash'] ?? ''))}
        ${cardRow('Item flags',   igItemFlags(sid, fname, data['item-flags'] ?? []))}
      `, true)}

      ${igCollapsible('⚙️ Generator', `
        ${cardRow('Prefix chance %', igNum(sid, fname, 'generator.prefix-chance', gen['prefix-chance'] ?? 100))}
        ${cardRow('Suffix chance %', igNum(sid, fname, 'generator.suffix-chance', gen['suffix-chance'] ?? 100))}
      `)}

      ${igCollapsible('🧱 Materials & Bonuses', `
        <p class="ig-subhead">Materials</p>
        ${cardRow('Reverse priority', igCheck(sid, fname, 'generator.materials.reverse', mats.reverse === true))}
        ${cardRow('Black-list (one item per line)', igLineArray(sid, fname, 'generator.materials.black-list', mats['black-list'] ?? []))}
        ${cardRow('Model data (JSON)',
          `${igJson(sid, fname, 'generator.materials.model-data', mats['model-data'] ?? {})}
           <p class="muted small" style="margin-top:3px"><code>default</code>: list of model-data IDs used for generic materials. <code>special</code>: map of material → [IDs] for specific variants.</p>`)}

        <p class="ig-subhead">Bonuses by Material</p>
        <p class="muted small" style="margin:0 0 6px">Per-material stat multipliers. Values are objects with <code>damage-types</code>, <code>defense-types</code>, <code>item-stats</code> sub-keys.</p>
        ${cardRow('Wildcard modifiers (e.g. diamond*)', igJson(sid, fname, 'generator.bonuses.material-modifiers', bonuses['material-modifiers'] ?? {}))}
        ${cardRow('Exact material', igJson(sid, fname, 'generator.bonuses.material', bonuses.material ?? {}))}
      `)}

      ${igCollapsible('✨ Enchantments', `
        ${cardRow('Min / Max',
          `<div style="display:flex;gap:6px;align-items:center">
            ${igNum(sid, fname, 'generator.enchantments.minimum', enchants.minimum ?? 0)}
            <span class="muted">–</span>
            ${igNum(sid, fname, 'generator.enchantments.maximum', enchants.maximum ?? 0)}
          </div>`)}
        ${cardRow('Safe only',   igCheck(sid, fname, 'generator.enchantments.safe-only',   enchants['safe-only']   === true))}
        ${cardRow('Safe levels', igCheck(sid, fname, 'generator.enchantments.safe-levels', enchants['safe-levels'] !== false))}
        ${cardRow('Enchant list',
          `${igLineKvField(sid, fname, 'generator.enchantments.list', enchants.list ?? {}, 'enchantment_id min:max')}
           <p class="muted small" style="margin-top:3px">One enchantment per line — e.g. <code>sharpness 1:3</code>, <code>efficiency 2:4</code>.</p>`)}
      `)}

      ${igCollapsible('🏹 Ammo & Hand Types', `
        ${cardRow('Ammo types',
          `${igLineKvField(sid, fname, 'generator.ammo-types', gen['ammo-types'] ?? {}, 'AMMO_TYPE weight%')}
           <p class="muted small" style="margin-top:3px">e.g. <code>ARROW 100.0</code></p>`)}
        ${cardRow('Hand types',
          `${igLineKvField(sid, fname, 'generator.hand-types', gen['hand-types'] ?? {}, 'ONE/TWO weight%')}
           <p class="muted small" style="margin-top:3px">e.g. <code>ONE 70.0</code> / <code>TWO 30.0</code></p>`)}
      `)}

      ${buildStatGroup(sid, fname, 'generator.damage-types',      dmgTypes,   '🗡️ Damage Types',      'section:damage',                        'DAMAGE_')}
      ${buildStatGroup(sid, fname, 'generator.defense-types',     defTypes,   '🛡️ Defense Types',     'section:defense',                       'DEFENSE_')}
      ${buildItemStatsGroup(sid, fname, 'generator.item-stats',   itemStats)}
      ${buildStatGroup(sid, fname, 'generator.fabled-attributes', fabledAttr, '⭐ Fabled Attributes',
        STATE.loaded?.fabledAttributes ? 'section:fabledAttributes' : 'local:generator.fabled-attributes.list',
        'FABLED_ATTRIBUTE_')}
      ${buildSocketsSection(sid, fname, gen.sockets)}

      ${igCollapsible('🎯 Skills', igSkillsList(sid, fname, 'generator.skills', gen.skills ?? {}))}

      ${igCollapsible('🛡 Shield Patterns', `
        ${cardRow('Random',         igCheck(sid, fname, 'generator.shield-patterns.random',          shields.random !== false))}
        ${cardRow('Base colors',    igLineArray(sid, fname, 'generator.shield-patterns.base-colors',   shields['base-colors']   ?? []))}
        ${cardRow('Pattern colors', igLineArray(sid, fname, 'generator.shield-patterns.pattern-colors',shields['pattern-colors'] ?? []))}
        ${cardRow('Patterns',       igLineArray(sid, fname, 'generator.shield-patterns.patterns',      shields.patterns         ?? []))}
      `)}

      ${igCollapsible('🪨 Armor Trimmings (1.20+)',
        `${igLineKvField(sid, fname, 'generator.armor-trimmings', gen['armor-trimmings'] ?? {}, 'trim-pattern-id weight')}
         <p class="muted small" style="margin-top:4px">One trim per line — e.g. <code>sentry 1.0</code>. Requires MC 1.20+.</p>`)}

      ${igCollapsible(
        `📜 Lore <span class="muted small" style="font-weight:normal">(${lore.length} lines)</span>`,
        `${igJson(sid, fname, 'lore', lore)}
         ${lorePreview(lore)}`
      )}

    </div>
  </div>`;
}

function renderItemGenerator(data, sid) {
  if (!data) return '<div class="empty-state">No data.</div>';

  const addBtn = `<button class="btn-add-entry"
    onclick="document.getElementById('ig-file-add-${sid}').click()">+ Add item type file
    <input id="ig-file-add-${sid}" type="file" accept=".yml,.yaml" multiple style="display:none"
      onchange="APP.onIgAddInput(event,'${sid}')">
  </button>`;

  if (data._multiFile) {
    const entries     = Object.entries(data.files || {});
    const families    = data._families    || {};
    const emptyGroups = data._emptyGroups || [];

    // Build file groups map
    const groups = {};
    entries.forEach(([fn, fd]) => {
      const fam = families[fn] ?? '';
      if (!groups[fam]) groups[fam] = [];
      groups[fam].push([fn, fd]);
    });

    // All named folders: from files + manually created empty ones
    const namedFolders = [...new Set([
      ...Object.values(families).filter(Boolean),
      ...emptyGroups,
    ])].sort();

    const toolbar = `
      <div class="entry-actions" style="flex-wrap:wrap;gap:6px">
        ${addBtn}
        <span class="ig-new-wrap">
          <select id="ig-tpl-${sid}" class="edit-input ig-tpl-select">
            <option value="">Empty</option>
            <option value="common">Full template</option>
            <option value="weapon">Weapon</option>
            <option value="armor">Armor</option>
          </select>
          <input id="ig-newfname-${sid}" class="edit-input ig-new-input" type="text" placeholder="new-item.yml"
            onkeydown="if(event.key==='Enter'){APP.igAddNewFile('${sid}',this.value,document.getElementById('ig-tpl-${sid}').value);this.value=''}">
          <button class="btn-add-entry" onclick="APP.igAddNewFile('${sid}',document.getElementById('ig-newfname-${sid}').value,document.getElementById('ig-tpl-${sid}').value);document.getElementById('ig-newfname-${sid}').value=''">+ New</button>
        </span>
        <button class="btn-add-entry" onclick="APP.igAddGroup('${sid}')">📁 New folder</button>
        <button class="btn-add-entry" onclick="APP.igCollapseAll('${sid}')">▶ Collapse all</button>
        <button class="btn-add-entry" onclick="APP.igExpandAll('${sid}')">▼ Expand all</button>
        <button class="btn-download" onclick="APP.igDownloadAll('${sid}')" title="Download all as folder tree (Chrome/Edge) or ZIP">⬇ Download all</button>
      </div>`;

    if (!entries.length && !emptyGroups.length) return `
      ${toolbar}
      <div class="empty-state">
        <div style="font-size:36px;margin-bottom:12px">📂</div>
        <p>Drop item-generator YAML files above, or use <b>Load Files</b>.</p>
        <p class="muted small" style="margin-top:6px">Each .yml file = one item type (e.g. sword.yml, helmet.yml).</p>
      </div>`;

    function groupZone(fam, groupId, labelHtml, items) {
      const isEmpty = items.length === 0;
      return `
        <div class="ig-folder-group" id="${groupId}"
          ondragover="if(APP._igDragging)event.preventDefault(),this.classList.add('drag-over')"
          ondragleave="if(!this.contains(event.relatedTarget))this.classList.remove('drag-over')"
          ondrop="APP.igDrop('${sid}','${escJs(fam)}',event)">
          <div class="ig-folder-header${fam ? '' : ' ig-folder-root'}">
            ${labelHtml}
            ${!isEmpty ? `<button class="btn-download ig-grp-dl" title="Download this folder (subfolder or ZIP)"
              onclick="APP.igDownloadGroup('${sid}','${escJs(fam)}')">⬇</button>` : ''}
            ${isEmpty ? `<button class="btn-icon btn-del" title="Remove empty folder"
              onclick="APP.igRemoveGroup('${sid}','${escJs(fam)}')">🗑</button>` : ''}
          </div>
          ${isEmpty ? '<div class="ig-drop-hint">Drop files here</div>' : ''}
          ${items.map(([fn, fd]) => renderItemGenFile(sid, fn, fd, fam)).join('')}
        </div>`;
    }

    const namedHtml = namedFolders.map(fam =>
      groupZone(fam, `ig-grp-${sid}-${fam}`,
        `📁 <b>${esc(fam)}</b> <span class="muted small">${(groups[fam]||[]).length} file(s)</span>`,
        groups[fam] || [])
    ).join('');

    const rootItems = groups[''] || [];
    const rootHtml  = namedFolders.length > 0 || rootItems.length > 0
      ? groupZone('', `ig-grp-${sid}-root`,
          `📄 <span class="muted small">(no folder)</span> <span class="muted small">${rootItems.length} file(s)</span>`,
          rootItems)
      : '';

    return toolbar + namedHtml + rootHtml;
  }

  // Fallback: single file loaded before multi-file support
  return `<div class="entry-actions">${addBtn}</div>
    ${renderItemGenFile(sid, 'item_generator.yml', data, '')}`;
}

// ---------------------------------------------------------------------------
// Sets (item_stats/sets/ folder — one .yml per set)
// ---------------------------------------------------------------------------

// ---- Sets: render one set file card ----
function renderSetCard(sid, fname, setData) {
  const fid         = fname.replace(/[^a-z0-9]/gi, '_');
  const setName     = setData.name             ?? '';
  const prefix      = setData.prefix           ?? '';
  const suffix      = setData.suffix           ?? '';
  const colorActive = setData.color?.active    ?? '&a';
  const colorInact  = setData.color?.inactive  ?? '&8';
  const elements    = setData.elements         ?? {};
  const bonusMap    = setData.bonuses?.['by-elements-amount'] ?? {};

  const elemRows = Object.entries(elements).map(([elemId, elem]) => `
    <div class="ig-elem-row">
      <b class="ig-elem-id">${esc(elemId)}</b>
      <div style="flex:1">
        ${cardRow('Materials', igJson(sid, fname, `elements.${elemId}.materials`, elem.materials ?? []))}
        ${cardRow('Name',      igField(sid, fname, `elements.${elemId}.name`,     elem.name ?? ''))}
      </div>
      <button class="btn-icon btn-del" title="Remove element"
        onclick="APP.igRemoveFromPath('${sid}','${escJs(fname)}','elements','${escJs(elemId)}')">🗑</button>
    </div>`).join('');

  const elemSection = igCollapsible(
    `🧩 Elements (${Object.keys(elements).length})`,
    elemRows + `
    <div class="ig-add-row">
      <input id="set-elem-${fid}" class="edit-input" type="text" placeholder="helmet" style="width:120px">
      <button class="btn-add-entry"
        onclick="APP.igAddSetElement('${sid}','${escJs(fname)}','set-elem-${fid}')">+ Add element</button>
    </div>`, true);

  const bonusSections = Object.entries(bonusMap)
    .sort(([a], [b]) => +a - +b)
    .map(([cnt, bonus]) => igCollapsible(
      `🎁 ${cnt} piece${+cnt !== 1 ? 's' : ''}`,
      `${cardRow('Lore',           igJson(sid, fname, `bonuses.by-elements-amount.${cnt}.lore`,           bonus.lore              ?? []))}
       ${cardRow('Item stats',     igJson(sid, fname, `bonuses.by-elements-amount.${cnt}.item-stats`,      bonus['item-stats']      ?? {}))}
       ${cardRow('Damage types',   igJson(sid, fname, `bonuses.by-elements-amount.${cnt}.damage-types`,    bonus['damage-types']    ?? {}))}
       ${cardRow('Defense types',  igJson(sid, fname, `bonuses.by-elements-amount.${cnt}.defense-types`,   bonus['defense-types']   ?? {}))}
       ${cardRow('Potion effects', igJson(sid, fname, `bonuses.by-elements-amount.${cnt}.potion-effects`,  bonus['potion-effects']  ?? {}))}
       <button class="btn-icon btn-del" style="margin-top:6px"
         onclick="APP.igRemoveFromPath('${sid}','${escJs(fname)}','bonuses.by-elements-amount','${escJs(String(cnt))}')">🗑 Remove tier</button>`,
      true)).join('');

  const bonusSection = igCollapsible(
    `🎁 Bonus tiers (${Object.keys(bonusMap).length})`,
    bonusSections + `
    <div class="ig-add-row" style="margin-top:8px">
      <span class="muted small">Pieces:</span>
      <input id="set-bonus-${fid}" class="edit-input edit-input--num" type="number" min="1" value="2" style="width:70px">
      <button class="btn-add-entry"
        onclick="APP.igAddBonusTier('${sid}','${escJs(fname)}','set-bonus-${fid}')">+ Add tier</button>
    </div>`, true);

  return `
    <div class="item-card">
      <details class="card-details" open>
        <summary class="item-card__header">
          <span class="item-card__icon">👑</span>
          <span style="flex:1;font-weight:600;color:#fff">${esc(fname)}</span>
          <span class="item-card__meta">${Object.keys(elements).length} elements · ${Object.keys(bonusMap).length} tiers</span>
          <button class="btn-download" onclick="APP.igDownload('${sid}','${escJs(fname)}')">⬇</button>
          <button class="btn-icon btn-del"
            onclick="if(confirm('Remove \\'${escJs(fname)}\\'?'))APP.igRemoveFile('${sid}','${escJs(fname)}')">🗑</button>
        </summary>
        <div class="item-card__body">
          ${cardRow('Set name',       igField(sid, fname, 'name',           setName,     'edit-input--format'))}
          <div class="lore-preview" style="margin-bottom:8px">${mc.toHtml(setName)}</div>
          ${cardRow('Prefix',         igField(sid, fname, 'prefix',         prefix))}
          ${cardRow('Suffix',         igField(sid, fname, 'suffix',         suffix))}
          ${cardRow('Color active',   igField(sid, fname, 'color.active',   colorActive, 'edit-input--format'))}
          ${cardRow('Color inactive', igField(sid, fname, 'color.inactive', colorInact,  'edit-input--format'))}
          ${elemSection}
          ${bonusSection}
        </div>
      </details>
    </div>`;
}

function renderSets(data, sid) {
  if (!data) return '<div class="empty-state">No data.</div>';

  const addBtn = `<button class="btn-add-entry"
    onclick="document.getElementById('sets-file-add-${sid}').click()">+ Add set file
    <input id="sets-file-add-${sid}" type="file" accept=".yml,.yaml" multiple style="display:none"
      onchange="APP.onIgAddInput(event,'${sid}')">
  </button>`;

  const setsToolbar = `
    <div class="entry-actions" style="flex-wrap:wrap;gap:6px">
      ${addBtn}
      <span class="ig-new-wrap">
        <select id="ig-tpl-${sid}" class="edit-input ig-tpl-select">
          <option value="">Empty</option>
          <option value="armor-4pc">4-piece Armor Set</option>
          <option value="weapon-2pc">2-piece Weapon Set</option>
        </select>
        <input id="ig-newfname-${sid}" class="edit-input ig-new-input" type="text" placeholder="my-set.yml"
          onkeydown="if(event.key==='Enter'){APP.igAddNewFile('${sid}',this.value,document.getElementById('ig-tpl-${sid}').value);this.value=''}">
        <button class="btn-add-entry"
          onclick="APP.igAddNewFile('${sid}',document.getElementById('ig-newfname-${sid}').value,document.getElementById('ig-tpl-${sid}').value);document.getElementById('ig-newfname-${sid}').value=''">+ New set</button>
      </span>
      ${collapseAllBtn()}
    </div>`;

  if (data._multiFile) {
    const entries = Object.entries(data.files || {});
    if (!entries.length) return `
      ${setsToolbar}
      <div class="empty-state">
        <div style="font-size:36px;margin-bottom:12px">👑</div>
        <p>Drop set YAML files above, use <b>Load Files</b>, or type a filename and click <b>+ New set</b>.</p>
      </div>`;

    const cards = entries.map(([fname, setData]) => renderSetCard(sid, fname, setData)).join('');
    return `
      ${setsToolbar}
      <p class="muted small" style="margin-bottom:14px">Each file = one set. Items are identified by <b>vanilla material</b> + display <b>name contains</b> element name (case-insensitive, stripped of color codes).</p>
      <div class="cards-grid">${cards}</div>`;
  }

  // Legacy single-file fallback
  const TPL = { name: 'New Set', prefix: '', suffix: '', color: { active: '&a', inactive: '&8' }, elements: {}, bonuses: { 'by-elements-amount': {} } };
  const entries = Object.entries(data).filter(([, v]) => v && typeof v === 'object');
  const cards = entries.map(([id, set]) => {
    const isNew = (SYNCED_NEW[sid] || new Set()).has(id);
    return `
      <div class="item-card${isNew ? ' entry-new' : ''}">
        <details class="card-details" open>
          <summary class="item-card__header">
            <span class="item-card__icon">👑</span>
            ${editId(sid, id)}
            ${isNew ? '<span class="badge badge-blue">new</span>' : ''}
            ${removeEntryBtn(sid, id)}
          </summary>
          <div class="item-card__body">
            ${cardRow('Set name', editText(sid, `${id}.name`, set.name ?? id, 'edit-input--format'))}
            ${cardRow('Elements (JSON)', jsonTextarea(sid, `${id}.elements`, set.elements ?? {}))}
            ${cardRow('Bonuses (JSON)',  jsonTextarea(sid, `${id}.bonuses`,  set.bonuses  ?? {}))}
          </div>
        </details>
      </div>`;
  }).join('');

  return `
    ${setsToolbar}
    <div class="entry-actions">${addEntryBtn(sid, TPL, 'Add set')}</div>
    <div class="cards-grid">${cards || '<div class="empty-state">No sets found.</div>'}</div>`;
}

// ---------------------------------------------------------------------------
// Gems (modules/gems/items/ folder — one .yml per gem type)
// ---------------------------------------------------------------------------

function renderGemCard(sid, fname, gemData) {
  const fid        = fname.replace(/[^a-z0-9]/gi, '_');
  const material   = gemData.material            ?? 'DIAMOND';
  const name       = gemData.name               ?? '';
  const sockDisp   = gemData['socket-display']  ?? '';
  const loreLines  = gemData.lore               ?? [];
  const enchanted  = gemData.enchanted          ?? false;
  const flags      = gemData['item-flags']      ?? [];
  const tier       = gemData.tier               ?? 'common';
  const lvlMin     = gemData.level?.min         ?? 1;
  const lvlMax     = gemData.level?.max         ?? 1;
  const usesByLvl  = gemData['uses-by-level']         ?? {};
  const succByLvl  = gemData['success-rate-by-level'] ?? {};
  const bonusByLvl = gemData['bonuses-by-level']      ?? {};
  const targetReqs = gemData['target-requirements']   ?? {};

  const bonusLevels = Object.entries(bonusByLvl)
    .sort(([a], [b]) => +a - +b)
    .map(([lvl, bonus]) => igCollapsible(
      `✨ Level ${lvl}`,
      `${cardRow('Item stats',    igJson(sid, fname, `bonuses-by-level.${lvl}.item-stats`,    bonus['item-stats']    ?? {}))}
       ${cardRow('Damage types',  igJson(sid, fname, `bonuses-by-level.${lvl}.damage-types`,  bonus['damage-types']  ?? {}))}
       ${cardRow('Defense types', igJson(sid, fname, `bonuses-by-level.${lvl}.defense-types`, bonus['defense-types'] ?? {}))}
       ${cardRow('Skills',        igJson(sid, fname, `bonuses-by-level.${lvl}.skills`,        bonus.skills           ?? {}))}
       <button class="btn-icon btn-del" style="margin-top:6px"
         onclick="APP.igRemoveFromPath('${sid}','${escJs(fname)}','bonuses-by-level','${escJs(String(lvl))}')">🗑 Remove level</button>`,
      true)).join('');

  const bonusSection = igCollapsible(
    `✨ Bonuses by level (${Object.keys(bonusByLvl).length})`,
    bonusLevels + `
    <div class="ig-add-row" style="margin-top:8px">
      <span class="muted small">Level:</span>
      <input id="gem-lvl-${fid}" class="edit-input edit-input--num" type="number" min="1" value="${lvlMax + 1}" style="width:70px">
      <button class="btn-add-entry"
        onclick="APP.igAddGemLevel('${sid}','${escJs(fname)}','gem-lvl-${fid}')">+ Add level</button>
    </div>`, true);

  return `
    <div class="item-card">
      <details class="card-details" open>
        <summary class="item-card__header">
          <span class="item-card__icon">💎</span>
          <span style="flex:1;font-weight:600;color:#fff">${esc(fname)}</span>
          <span class="item-card__meta">${esc(material)} · ${esc(tier)} · lvl ${lvlMin}–${lvlMax}</span>
          <button class="btn-download" onclick="APP.igDownload('${sid}','${escJs(fname)}')">⬇</button>
          <button class="btn-icon btn-del"
            onclick="if(confirm('Remove \\'${escJs(fname)}\\'?'))APP.igRemoveFile('${sid}','${escJs(fname)}')">🗑</button>
        </summary>
        <div class="item-card__body">
          ${cardRow('Material',       igField(sid, fname, 'material',       material))}
          ${cardRow('Name',           igField(sid, fname, 'name',           name))}
          ${cardRow('Socket display', igField(sid, fname, 'socket-display', sockDisp, 'edit-input--format'))}
          <div class="lore-preview" style="margin-bottom:8px">${mc.toHtml(sockDisp)}</div>
          ${cardRow('Lore',           igJson(sid, fname, 'lore',            loreLines))}
          ${lorePreview(loreLines)}
          ${cardRow('Tier',      igField(sid, fname, 'tier',     tier))}
          ${cardRow('Enchanted', igCheck(sid, fname, 'enchanted', enchanted))}
          ${cardRow('Item flags', igJson(sid, fname, 'item-flags', flags))}
          ${cardRow('Level min', igNum(sid, fname, 'level.min', lvlMin))}
          ${cardRow('Level max', igNum(sid, fname, 'level.max', lvlMax))}

          ${igCollapsible('📊 Uses &amp; success rates', `
            ${cardRow('Uses by level',         igJson(sid, fname, 'uses-by-level',         usesByLvl))}
            ${cardRow('Success rate by level', igJson(sid, fname, 'success-rate-by-level', succByLvl))}
            <p class="muted small" style="margin-top:4px">Success rate format: <code>"min:max"</code> per level key, e.g. <code>{"1":"70:90"}</code></p>
          `, false)}

          ${bonusSection}

          ${igCollapsible('🎯 Target requirements', `
            ${cardRow('Item types',    igJson(sid, fname, 'target-requirements.type',   targetReqs.type   ?? []))}
            ${cardRow('Socket cat.',   igField(sid, fname, 'target-requirements.socket', targetReqs.socket ?? 'common'))}
            ${cardRow('Required tier', igField(sid, fname, 'target-requirements.tier',   targetReqs.tier   ?? ''))}
            ${cardRow('Modules',       igJson(sid, fname, 'target-requirements.module', targetReqs.module ?? ['*']))}
            ${cardRow('Level map',     igJson(sid, fname, 'target-requirements.level',  targetReqs.level  ?? {}))}
            <p class="muted small" style="margin-top:4px">Types: <code>WEAPON</code>, <code>ARMOR</code>, <code>*</code>. Module: <code>*</code> = all. Tier: leave empty for any.</p>
          `, false)}
        </div>
      </details>
    </div>`;
}

function renderGems(data, sid) {
  if (!data) return '<div class="empty-state">No data.</div>';

  const addBtn = `<button class="btn-add-entry"
    onclick="document.getElementById('gems-file-add-${sid}').click()">+ Add gem file
    <input id="gems-file-add-${sid}" type="file" accept=".yml,.yaml" multiple style="display:none"
      onchange="APP.onIgAddInput(event,'${sid}')">
  </button>`;

  const gemsToolbar = `
    <div class="entry-actions" style="flex-wrap:wrap;gap:6px">
      ${addBtn}
      <span class="ig-new-wrap">
        <select id="ig-tpl-${sid}" class="edit-input ig-tpl-select">
          <option value="">Empty</option>
          <option value="damage-gem">Damage Gem</option>
          <option value="defense-gem">Defense Gem</option>
          <option value="stat-gem">Stat Gem</option>
        </select>
        <input id="ig-newfname-${sid}" class="edit-input ig-new-input" type="text" placeholder="my-gem.yml"
          onkeydown="if(event.key==='Enter'){APP.igAddNewFile('${sid}',this.value,document.getElementById('ig-tpl-${sid}').value);this.value=''}">
        <button class="btn-add-entry"
          onclick="APP.igAddNewFile('${sid}',document.getElementById('ig-newfname-${sid}').value,document.getElementById('ig-tpl-${sid}').value);document.getElementById('ig-newfname-${sid}').value=''">+ New gem</button>
      </span>
      ${collapseAllBtn()}
    </div>`;

  if (data._multiFile) {
    const entries = Object.entries(data.files || {});
    if (!entries.length) return `
      ${gemsToolbar}
      <div class="empty-state">
        <div style="font-size:36px;margin-bottom:12px">💎</div>
        <p>Drop gem YAML files above, use <b>Load Files</b>, or type a filename and click <b>+ New gem</b>.</p>
      </div>`;

    const cards = entries.map(([fname, gemData]) => renderGemCard(sid, fname, gemData)).join('');
    return `
      ${gemsToolbar}
      <p class="muted small" style="margin-bottom:14px">Each file = one gem type. <code>socket-display</code> = text shown on item lore when socketed.</p>
      <div class="cards-grid">${cards}</div>`;
  }

  return `${gemsToolbar}<div class="alert alert-warn">⚠️ No gem files loaded yet.</div>`;
}

// ---------------------------------------------------------------------------
// Shared socket-item base rows (essence + rune share most fields)
// ---------------------------------------------------------------------------

function socketItemBaseRows(sid, fname, data) {
  const loreLines = data.lore ?? [];
  return `
    ${cardRow('Material',        igField(sid, fname, 'material',        data.material         ?? 'PRISMARINE_SHARD'))}
    ${cardRow('Name',            igField(sid, fname, 'name',            data.name             ?? '', 'edit-input--format'))}
    <div class="lore-preview" style="margin-bottom:4px">${mc.toHtml(data.name ?? '')}</div>
    ${cardRow('Socket display',  igField(sid, fname, 'socket-display',  data['socket-display'] ?? '', 'edit-input--format'))}
    <div class="lore-preview" style="margin-bottom:4px">${mc.toHtml(data['socket-display'] ?? '')}</div>
    ${cardRow('Lore',            igJson(sid,  fname, 'lore',            loreLines))}
    ${lorePreview(loreLines)}
    ${cardRow('Tier',            igField(sid, fname, 'tier',            data.tier             ?? 'common'))}
    ${cardRow('Enchanted',       igCheck(sid, fname, 'enchanted',       !!data.enchanted))}
    ${cardRow('Item flags',      igJson(sid,  fname, 'item-flags',      data['item-flags']    ?? []))}
    ${cardRow('Level min / max',
      `<div style="display:flex;gap:6px;align-items:center">
        ${igNum(sid, fname, 'level.min', data.level?.min ?? 1)}
        <span class="muted">–</span>
        ${igNum(sid, fname, 'level.max', data.level?.max ?? 1)}
      </div>`)}
    ${cardRow('Uses by level',         igJson(sid, fname, 'uses-by-level',         data['uses-by-level']         ?? {}))}
    ${cardRow('Success rate by level', igJson(sid, fname, 'success-rate-by-level', data['success-rate-by-level'] ?? {}))}
    <p class="muted small" style="margin-top:2px">Success rate: <code>"min:max"</code> or flat number per level key.</p>`;
}

function socketItemTargetRows(sid, fname, data) {
  const tr = data['target-requirements'] ?? {};
  return igCollapsible('🎯 Target requirements', `
    ${cardRow('Item types',    igJson(sid,  fname, 'target-requirements.type',   tr.type   ?? []))}
    ${cardRow('Socket cat.',   igField(sid, fname, 'target-requirements.socket', tr.socket ?? 'default'))}
    ${cardRow('Required tier', igField(sid, fname, 'target-requirements.tier',   tr.tier   ?? ''))}
    ${cardRow('Modules',       igJson(sid,  fname, 'target-requirements.module', tr.module ?? ['*']))}
    ${cardRow('Level map',     igJson(sid,  fname, 'target-requirements.level',  tr.level  ?? {}))}
  `, false);
}

// ---------------------------------------------------------------------------
// Essences (modules/essences/items/)
// ---------------------------------------------------------------------------

function renderEssenceCard(sid, fname, data) {
  const lvlMin = data.level?.min ?? 1;
  const lvlMax = data.level?.max ?? 1;
  const effect = data.effect ?? {};

  return `
    <div class="item-card">
      <details class="card-details" open>
        <summary class="item-card__header">
          <span class="item-card__icon">✨</span>
          <span style="flex:1;font-weight:600;color:#fff">${esc(fname)}</span>
          <span class="item-card__meta">${esc(data.material ?? '?')} · ${esc(data.tier ?? 'common')} · lvl ${lvlMin}–${lvlMax}</span>
          <button class="btn-download" onclick="APP.igDownload('${sid}','${escJs(fname)}')">⬇</button>
          <button class="btn-icon btn-del"
            onclick="if(confirm('Remove \\'${escJs(fname)}\\'?'))APP.igRemoveFile('${sid}','${escJs(fname)}')">🗑</button>
        </summary>
        <div class="item-card__body">
          ${igCollapsible('📋 Base Item', socketItemBaseRows(sid, fname, data), true)}
          ${igCollapsible('🎇 Particle Effect', `
            ${cardRow('Type',     igField(sid, fname, 'effect.type',     String(effect.type     ?? 'FOOT')))}
            ${cardRow('Particle', igField(sid, fname, 'effect.name',     String(effect.name     ?? '')))}
            ${cardRow('Amount',   igNum(sid,   fname, 'effect.amount',   effect.amount          ?? 15))}
            ${cardRow('Speed',    igNum(sid,   fname, 'effect.speed',    effect.speed           ?? 0.1))}
            ${cardRow('Offset X', igNum(sid,   fname, 'effect.offset-x', effect['offset-x']    ?? 0))}
            ${cardRow('Offset Y', igNum(sid,   fname, 'effect.offset-y', effect['offset-y']    ?? 0))}
            ${cardRow('Offset Z', igNum(sid,   fname, 'effect.offset-z', effect['offset-z']    ?? 0))}
            <p class="muted small" style="margin-top:4px">Types: <code>FOOT</code>, <code>HELIX</code>, <code>AURA</code>. Particle: Bukkit particle name, or <code>DUST:R,G,B</code> for custom color.</p>
          `, true)}
          ${socketItemTargetRows(sid, fname, data)}
        </div>
      </details>
    </div>`;
}

function renderEssences(data, sid) {
  if (!data) return '<div class="empty-state">No data.</div>';

  const addBtn = `<button class="btn-add-entry"
    onclick="document.getElementById('ess-file-add-${sid}').click()">+ Add essence file
    <input id="ess-file-add-${sid}" type="file" accept=".yml,.yaml" multiple style="display:none"
      onchange="APP.onIgAddInput(event,'${sid}')">
  </button>`;

  const toolbar = `
    <div class="entry-actions" style="flex-wrap:wrap;gap:6px">
      ${addBtn}
      <span class="ig-new-wrap">
        <select id="ig-tpl-${sid}" class="edit-input ig-tpl-select">
          <option value="">Empty</option>
          <option value="foot-trail">Foot Trail</option>
          <option value="magic-helix">Magic Helix</option>
        </select>
        <input id="ig-newfname-${sid}" class="edit-input ig-new-input" type="text" placeholder="my-essence.yml"
          onkeydown="if(event.key==='Enter'){APP.igAddNewFile('${sid}',this.value,document.getElementById('ig-tpl-${sid}').value);this.value=''}">
        <button class="btn-add-entry"
          onclick="APP.igAddNewFile('${sid}',document.getElementById('ig-newfname-${sid}').value,document.getElementById('ig-tpl-${sid}').value);document.getElementById('ig-newfname-${sid}').value=''">+ New essence</button>
      </span>
      ${collapseAllBtn()}
    </div>`;

  if (data._multiFile) {
    const entries = Object.entries(data.files || {});
    if (!entries.length) return `${toolbar}
      <div class="empty-state"><div style="font-size:36px;margin-bottom:12px">✨</div>
        <p>Drop essence YAML files above or click <b>+ New essence</b>.</p></div>`;
    return `${toolbar}
      <p class="muted small" style="margin-bottom:14px">Each file = one essence type. Socketed into ESSENCE socket slots.</p>
      <div class="cards-grid">${entries.map(([f,d]) => renderEssenceCard(sid, f, d)).join('')}</div>`;
  }
  return `${toolbar}<div class="alert alert-warn">⚠️ No essence files loaded yet.</div>`;
}

// ---------------------------------------------------------------------------
// Runes (modules/runes/items/)
// ---------------------------------------------------------------------------

function renderRuneCard(sid, fname, data) {
  const lvlMin = data.level?.min ?? 1;
  const lvlMax = data.level?.max ?? 1;

  return `
    <div class="item-card">
      <details class="card-details" open>
        <summary class="item-card__header">
          <span class="item-card__icon">🔷</span>
          <span style="flex:1;font-weight:600;color:#fff">${esc(fname)}</span>
          <span class="item-card__meta">${esc(data.material ?? '?')} · ${esc(data.tier ?? 'common')} · lvl ${lvlMin}–${lvlMax}</span>
          <button class="btn-download" onclick="APP.igDownload('${sid}','${escJs(fname)}')">⬇</button>
          <button class="btn-icon btn-del"
            onclick="if(confirm('Remove \\'${escJs(fname)}\\'?'))APP.igRemoveFile('${sid}','${escJs(fname)}')">🗑</button>
        </summary>
        <div class="item-card__body">
          ${igCollapsible('📋 Base Item', socketItemBaseRows(sid, fname, data), true)}
          ${igCollapsible('⚗️ Potion Effect', `
            ${cardRow('Effect type', igField(sid, fname, 'effect', String(data.effect ?? 'SPEED')))}
            <p class="muted small" style="margin-top:4px">Bukkit <code>PotionEffectType</code> name, e.g. <code>SPEED</code>, <code>STRENGTH</code>, <code>JUMP_BOOST</code>, <code>RESISTANCE</code>, <code>NIGHT_VISION</code>, <code>ABSORPTION</code>. Amplifier = item level − 1.</p>
          `, true)}
          ${socketItemTargetRows(sid, fname, data)}
        </div>
      </details>
    </div>`;
}

function renderRunes(data, sid) {
  if (!data) return '<div class="empty-state">No data.</div>';

  const addBtn = `<button class="btn-add-entry"
    onclick="document.getElementById('rune-file-add-${sid}').click()">+ Add rune file
    <input id="rune-file-add-${sid}" type="file" accept=".yml,.yaml" multiple style="display:none"
      onchange="APP.onIgAddInput(event,'${sid}')">
  </button>`;

  const toolbar = `
    <div class="entry-actions" style="flex-wrap:wrap;gap:6px">
      ${addBtn}
      <span class="ig-new-wrap">
        <select id="ig-tpl-${sid}" class="edit-input ig-tpl-select">
          <option value="">Empty</option>
          <option value="rune-speed">Speed Rune</option>
          <option value="rune-strength">Strength Rune</option>
        </select>
        <input id="ig-newfname-${sid}" class="edit-input ig-new-input" type="text" placeholder="my-rune.yml"
          onkeydown="if(event.key==='Enter'){APP.igAddNewFile('${sid}',this.value,document.getElementById('ig-tpl-${sid}').value);this.value=''}">
        <button class="btn-add-entry"
          onclick="APP.igAddNewFile('${sid}',document.getElementById('ig-newfname-${sid}').value,document.getElementById('ig-tpl-${sid}').value);document.getElementById('ig-newfname-${sid}').value=''">+ New rune</button>
      </span>
      ${collapseAllBtn()}
    </div>`;

  if (data._multiFile) {
    const entries = Object.entries(data.files || {});
    if (!entries.length) return `${toolbar}
      <div class="empty-state"><div style="font-size:36px;margin-bottom:12px">🔷</div>
        <p>Drop rune YAML files above or click <b>+ New rune</b>.</p></div>`;
    return `${toolbar}
      <p class="muted small" style="margin-bottom:14px">Each file = one rune type. Effect amplifier = item level − 1 (level 1 → amplifier 0 = effect I).</p>
      <div class="cards-grid">${entries.map(([f,d]) => renderRuneCard(sid, f, d)).join('')}</div>`;
  }
  return `${toolbar}<div class="alert alert-warn">⚠️ No rune files loaded yet.</div>`;
}

// ---------------------------------------------------------------------------
// Arrows (modules/arrows/items/ folder — one .yml per arrow type)
// ---------------------------------------------------------------------------

/** Shared "module item" base fields (material, name, lore, visual, level). */
function moduleItemBaseRows(sid, fname, data) {
  const loreLines = data.lore ?? [];
  return `
    ${cardRow('Material',   igField(sid, fname, 'material',   data.material   ?? 'ARROW'))}
    ${cardRow('Name',       igField(sid, fname, 'name',       data.name       ?? '', 'edit-input--format'))}
    <div class="lore-preview" style="margin-bottom:4px">${mc.toHtml(data.name ?? '')}</div>
    ${cardRow('Lore',       igJson(sid,  fname, 'lore',       loreLines))}
    ${lorePreview(loreLines)}
    ${cardRow('Tier',       igField(sid, fname, 'tier',       data.tier       ?? 'common'))}
    ${cardRow('Enchanted',  igCheck(sid, fname, 'enchanted',  !!data.enchanted))}
    ${cardRow('Item flags', igJson(sid,  fname, 'item-flags', data['item-flags'] ?? []))}
    ${cardRow('Unbreakable',igCheck(sid, fname, 'unbreakable',!!data.unbreakable))}
    ${cardRow('Model data', igNum(sid,   fname, 'model-data', data['model-data'] ?? -1))}
    ${cardRow('Color (R,G,B)', igField(sid, fname, 'color',  String(data.color ?? '-1,-1,-1'), 'edit-input--inline'))}
    ${cardRow('Skull hash', igField(sid, fname, 'skull-hash',data['skull-hash'] ?? ''))}
    ${cardRow('Enchantments', igJson(sid,fname, 'enchantments', data.enchantments ?? {}))}
    ${cardRow('Attributes', igJson(sid,  fname, 'attributes', data.attributes ?? {}))}
    ${cardRow('Level min / max',
      `<div style="display:flex;gap:6px;align-items:center">
        ${igNum(sid, fname, 'level.min', data.level?.min ?? 1)}
        <span class="muted">–</span>
        ${igNum(sid, fname, 'level.max', data.level?.max ?? 1)}
      </div>`)}`;
}

function renderArrowCard(sid, fname, data) {
  const lvlMin     = data.level?.min ?? 1;
  const lvlMax     = data.level?.max ?? 1;
  const bonusByLvl = data['bonuses-by-level'] ?? {};

  const bonusLevels = Object.entries(bonusByLvl)
    .sort(([a], [b]) => +a - +b)
    .map(([lvl, bonus]) => igCollapsible(
      `✨ Level ${lvl}`,
      `${cardRow('Additional stats',   igJson(sid, fname, `bonuses-by-level.${lvl}.additional-stats`,   bonus['additional-stats']   ?? {}))}
       ${cardRow('Additional damage',  igJson(sid, fname, `bonuses-by-level.${lvl}.additional-damage`,  bonus['additional-damage']  ?? {}))}
       ${cardRow('Defense ignoring',   igJson(sid, fname, `bonuses-by-level.${lvl}.defense-ignoring`,   bonus['defense-ignoring']   ?? {}))}
       <button class="btn-icon btn-del" style="margin-top:6px"
         onclick="APP.igRemoveFromPath('${sid}','${escJs(fname)}','bonuses-by-level','${escJs(String(lvl))}')">🗑 Remove level</button>`,
      true)).join('');

  const fid = fname.replace(/[^a-z0-9]/gi, '_');

  return `
    <div class="item-card">
      <details class="card-details" open>
        <summary class="item-card__header">
          <span class="item-card__icon">🏹</span>
          <span style="flex:1;font-weight:600;color:#fff">${esc(fname)}</span>
          <span class="item-card__meta">${esc(data.material ?? 'ARROW')} · ${esc(data.tier ?? 'common')} · lvl ${lvlMin}–${lvlMax}</span>
          <button class="btn-download" onclick="APP.igDownload('${sid}','${escJs(fname)}')">⬇</button>
          <button class="btn-icon btn-del"
            onclick="if(confirm('Remove \\'${escJs(fname)}\\'?'))APP.igRemoveFile('${sid}','${escJs(fname)}')">🗑</button>
        </summary>
        <div class="item-card__body">
          ${igCollapsible('📋 Base Item', moduleItemBaseRows(sid, fname, data), true)}

          ${igCollapsible('✨ Bonuses by level (${Object.keys(bonusByLvl).length})',
            bonusLevels + `
            <div class="ig-add-row" style="margin-top:8px">
              <span class="muted small">Level:</span>
              <input id="arrow-lvl-${fid}" class="edit-input edit-input--num" type="number" min="1" value="${lvlMax + 1}" style="width:70px">
              <button class="btn-add-entry"
                onclick="APP.igAddToPath('${sid}','${escJs(fname)}','bonuses-by-level',document.getElementById('arrow-lvl-${fid}').value,{'additional-stats':{},'additional-damage':{},'defense-ignoring':{}})">+ Add level</button>
            </div>`, true)}

          ${igCollapsible('💥 On-hit actions', igJson(sid, fname, 'on-hit-actions', data['on-hit-actions'] ?? {}))}
          ${igCollapsible('🌀 On-fly actions', igJson(sid, fname, 'on-fly-actions', data['on-fly-actions'] ?? {}))}

          ${igCollapsible('🎯 Target requirements', `
            ${cardRow('Item types',    igJson(sid, fname, 'target-requirements.type',   data['target-requirements']?.type   ?? []))}
            ${cardRow('Socket cat.',   igField(sid, fname, 'target-requirements.socket', data['target-requirements']?.socket ?? ''))}
            ${cardRow('Required tier', igField(sid, fname, 'target-requirements.tier',   data['target-requirements']?.tier   ?? ''))}
            ${cardRow('Modules',       igJson(sid, fname, 'target-requirements.module', data['target-requirements']?.module ?? ['*']))}
            ${cardRow('Level map',     igJson(sid, fname, 'target-requirements.level',  data['target-requirements']?.level  ?? {}))}
          `, false)}
        </div>
      </details>
    </div>`;
}

function renderArrows(data, sid) {
  if (!data) return '<div class="empty-state">No data.</div>';

  const addBtn = `<button class="btn-add-entry"
    onclick="document.getElementById('arrows-file-add-${sid}').click()">+ Add arrow file
    <input id="arrows-file-add-${sid}" type="file" accept=".yml,.yaml" multiple style="display:none"
      onchange="APP.onIgAddInput(event,'${sid}')">
  </button>`;

  const toolbar = `
    <div class="entry-actions" style="flex-wrap:wrap;gap:6px">
      ${addBtn}
      <span class="ig-new-wrap">
        <select id="ig-tpl-${sid}" class="edit-input ig-tpl-select">
          <option value="">Empty</option>
          <option value="basic">Basic Arrow</option>
          <option value="explosive">Explosive Arrow</option>
        </select>
        <input id="ig-newfname-${sid}" class="edit-input ig-new-input" type="text" placeholder="my-arrow.yml"
          onkeydown="if(event.key==='Enter'){APP.igAddNewFile('${sid}',this.value,document.getElementById('ig-tpl-${sid}').value);this.value=''}">
        <button class="btn-add-entry"
          onclick="APP.igAddNewFile('${sid}',document.getElementById('ig-newfname-${sid}').value,document.getElementById('ig-tpl-${sid}').value);document.getElementById('ig-newfname-${sid}').value=''">+ New arrow</button>
      </span>
      ${collapseAllBtn()}
    </div>`;

  if (data._multiFile) {
    const entries = Object.entries(data.files || {});
    if (!entries.length) return `
      ${toolbar}
      <div class="empty-state">
        <div style="font-size:36px;margin-bottom:12px">🏹</div>
        <p>Drop arrow YAML files above, use <b>Load Files</b>, or type a filename and click <b>+ New arrow</b>.</p>
      </div>`;

    const cards = entries.map(([fname, d]) => renderArrowCard(sid, fname, d)).join('');
    return `
      ${toolbar}
      <p class="muted small" style="margin-bottom:14px">Each file = one arrow type. <code>on-hit-actions</code> / <code>on-fly-actions</code> use Divinity's action DSL.</p>
      <div class="cards-grid">${cards}</div>`;
  }

  return `${toolbar}<div class="alert alert-warn">⚠️ No arrow files loaded yet.</div>`;
}

// ---------------------------------------------------------------------------
// Consumables (modules/consumables/items/ folder — one .yml per item)
// ---------------------------------------------------------------------------

function renderConsumableCard(sid, fname, data) {
  const lvlMin     = data.level?.min ?? 1;
  const lvlMax     = data.level?.max ?? 1;
  const fid        = fname.replace(/[^a-z0-9]/gi, '_');
  const usesByLvl  = data['uses-by-level']      ?? {};
  const varsByLvl  = data['variables-by-level'] ?? {};
  const effects    = data.effects               ?? {};
  const usage      = data.usage                 ?? {};
  const userReqs   = data['user-requirements-by-level'] ?? {};

  return `
    <div class="item-card">
      <details class="card-details" open>
        <summary class="item-card__header">
          <span class="item-card__icon">🧪</span>
          <span style="flex:1;font-weight:600;color:#fff">${esc(fname)}</span>
          <span class="item-card__meta">${esc(data.material ?? '?')} · ${esc(data.tier ?? 'common')} · lvl ${lvlMin}–${lvlMax}</span>
          <button class="btn-download" onclick="APP.igDownload('${sid}','${escJs(fname)}')">⬇</button>
          <button class="btn-icon btn-del"
            onclick="if(confirm('Remove \\'${escJs(fname)}\\'?'))APP.igRemoveFile('${sid}','${escJs(fname)}')">🗑</button>
        </summary>
        <div class="item-card__body">
          ${igCollapsible('📋 Base Item', moduleItemBaseRows(sid, fname, data), true)}

          ${igCollapsible('❤️ Effects', `
            ${cardRow('Health restored',     igNum(sid, fname, 'effects.health',     effects.health     ?? 0))}
            ${cardRow('Hunger restored',     igNum(sid, fname, 'effects.hunger',     effects.hunger     ?? 0))}
            ${cardRow('Saturation restored', igNum(sid, fname, 'effects.saturation', effects.saturation ?? 0))}
          `, true)}

          ${igCollapsible('📊 Uses & variables by level', `
            ${cardRow('Uses by level',      igJson(sid, fname, 'uses-by-level',      usesByLvl))}
            ${cardRow('Variables by level', igJson(sid, fname, 'variables-by-level', varsByLvl))}
            <p class="muted small" style="margin-top:4px">Variables are accessible as <code>%varName%</code> in lore/name. Example: <code>{"1": {"health": 20}}</code></p>
          `, false)}

          ${igCollapsible('👤 User requirements by level', `
            ${cardRow('Level requirements', igJson(sid, fname, 'user-requirements-by-level.level', userReqs.level ?? {}))}
            ${cardRow('Class requirements', igJson(sid, fname, 'user-requirements-by-level.class', userReqs.class ?? {}))}
            ${cardRow('Banned classes',     igJson(sid, fname, 'user-requirements-by-level.banned-class', userReqs['banned-class'] ?? {}))}
          `, false)}

          ${igCollapsible('🖱️ Usage (click actions)', `
            ${cardRow('RIGHT click', igJson(sid, fname, 'usage.RIGHT', usage.RIGHT ?? { cooldown: 1.0, actions: {} }))}
            ${cardRow('LEFT click',  igJson(sid, fname, 'usage.LEFT',  usage.LEFT  ?? {}))}
            <p class="muted small" style="margin-top:4px">Cooldown in seconds. <code>actions</code> use Divinity action DSL.</p>
          `, false)}

          ${igCollapsible('🎯 Target requirements', `
            ${cardRow('Item types',    igJson(sid, fname, 'target-requirements.type',   data['target-requirements']?.type   ?? []))}
            ${cardRow('Required tier', igField(sid, fname, 'target-requirements.tier',   data['target-requirements']?.tier   ?? ''))}
            ${cardRow('Modules',       igJson(sid, fname, 'target-requirements.module', data['target-requirements']?.module ?? ['*']))}
            ${cardRow('Level map',     igJson(sid, fname, 'target-requirements.level',  data['target-requirements']?.level  ?? {}))}
          `, false)}
        </div>
      </details>
    </div>`;
}

function renderConsumables(data, sid) {
  if (!data) return '<div class="empty-state">No data.</div>';

  const addBtn = `<button class="btn-add-entry"
    onclick="document.getElementById('cons-file-add-${sid}').click()">+ Add consumable file
    <input id="cons-file-add-${sid}" type="file" accept=".yml,.yaml" multiple style="display:none"
      onchange="APP.onIgAddInput(event,'${sid}')">
  </button>`;

  const toolbar = `
    <div class="entry-actions" style="flex-wrap:wrap;gap:6px">
      ${addBtn}
      <span class="ig-new-wrap">
        <select id="ig-tpl-${sid}" class="edit-input ig-tpl-select">
          <option value="">Empty</option>
          <option value="potion">Health Potion</option>
          <option value="food">Food</option>
        </select>
        <input id="ig-newfname-${sid}" class="edit-input ig-new-input" type="text" placeholder="my-item.yml"
          onkeydown="if(event.key==='Enter'){APP.igAddNewFile('${sid}',this.value,document.getElementById('ig-tpl-${sid}').value);this.value=''}">
        <button class="btn-add-entry"
          onclick="APP.igAddNewFile('${sid}',document.getElementById('ig-newfname-${sid}').value,document.getElementById('ig-tpl-${sid}').value);document.getElementById('ig-newfname-${sid}').value=''">+ New consumable</button>
      </span>
      ${collapseAllBtn()}
    </div>`;

  if (data._multiFile) {
    const entries = Object.entries(data.files || {});
    if (!entries.length) return `
      ${toolbar}
      <div class="empty-state">
        <div style="font-size:36px;margin-bottom:12px">🧪</div>
        <p>Drop consumable YAML files above, use <b>Load Files</b>, or type a filename and click <b>+ New consumable</b>.</p>
      </div>`;

    const cards = entries.map(([fname, d]) => renderConsumableCard(sid, fname, d)).join('');
    return `
      ${toolbar}
      <p class="muted small" style="margin-bottom:14px">Each file = one consumable type. <code>variables-by-level</code> values are accessible as <code>%varName%</code> in lore.</p>
      <div class="cards-grid">${cards}</div>`;
  }

  return `${toolbar}<div class="alert alert-warn">⚠️ No consumable files loaded yet.</div>`;
}

// ---------------------------------------------------------------------------
// Build Preview
// ---------------------------------------------------------------------------

const BUILD_SLOTS = [
  { key: 'weapon',  icon: '⚔️',  label: 'Weapon'   },
  { key: 'offhand', icon: '🗡',  label: 'Off-hand'  },
  { key: 'helmet',  icon: '⛑️',  label: 'Helmet'    },
  { key: 'chest',   icon: '🥋',  label: 'Chestplate'},
  { key: 'legs',    icon: '👖',  label: 'Leggings'  },
  { key: 'boots',   icon: '👟',  label: 'Boots'     },
];

function _buildScale(base, scaleFactor, level) {
  const s = scaleFactor ?? 1.0;
  const vScale = (s * 100 - 100) * ((level || 1) - 1) / 100 + 1;
  return base * Math.max(vScale, 0.001);
}

function calcBuild() {
  const totalDmg    = {};
  const totalDef    = {};
  const totalStats  = {};
  const totalSkills = {};
  const activeSets  = [];

  for (const slotDef of BUILD_SLOTS) {
    const slot = BUILD_STATE.slots[slotDef.key];
    if (!slot?.fname) continue;
    const itemData = STATE.loaded?.itemgen?.files?.[slot.fname];
    if (!itemData) continue;
    const gen   = itemData.generator || {};
    const level = slot.level || 1;

    // Damage types
    for (const [type, info] of Object.entries(gen['damage-types']?.list || {})) {
      if (typeof info !== 'object' || (info.chance ?? 100) <= 0) continue;
      const avg = _buildScale(((info.min ?? 0) + (info.max ?? 0)) / 2, info['scale-by-level'], level);
      totalDmg[type] = (totalDmg[type] || 0) + avg;
    }

    // Defense types
    for (const [type, info] of Object.entries(gen['defense-types']?.list || {})) {
      if (typeof info !== 'object' || (info.chance ?? 100) <= 0) continue;
      const avg = _buildScale(((info.min ?? 0) + (info.max ?? 0)) / 2, info['scale-by-level'], level);
      totalDef[type] = (totalDef[type] || 0) + avg;
    }

    // Item stats
    for (const [stat, info] of Object.entries(gen['item-stats']?.list || {})) {
      if (typeof info !== 'object' || (info.chance ?? 100) <= 0) continue;
      const avg = ((info.min ?? 0) + (info.max ?? 0)) / 2;
      totalStats[stat] = (totalStats[stat] || 0) + avg;
    }

    // Fabled attributes
    for (const [attr, info] of Object.entries(gen['fabled-attributes']?.list || {})) {
      if (typeof info !== 'object' || (info.chance ?? 100) <= 0) continue;
      const avg = ((info.min ?? 0) + (info.max ?? 0)) / 2;
      totalStats[`[FA] ${attr}`] = (totalStats[`[FA] ${attr}`] || 0) + avg;
    }

    // Skills
    for (const [skill, info] of Object.entries(gen.skills?.list || {})) {
      if (typeof info !== 'object') continue;
      totalSkills[skill] = Math.max(totalSkills[skill] || 0, info.level ?? 1);
    }

    // Gem bonuses
    for (let i = 0; i < 3; i++) {
      const gemFname = slot.gems[i];
      if (!gemFname) continue;
      const gemData = STATE.loaded?.gems?.files?.[gemFname];
      if (!gemData) continue;
      const bonuses = gemData['bonuses-by-level']?.[String(slot.gemLevels[i] || 1)] || {};
      for (const [t, v] of Object.entries(bonuses['damage-types']  || {})) totalDmg[t]   = (totalDmg[t]   || 0) + (parseFloat(String(v)) || 0);
      for (const [t, v] of Object.entries(bonuses['defense-types'] || {})) totalDef[t]   = (totalDef[t]   || 0) + (parseFloat(String(v)) || 0);
      for (const [s, v] of Object.entries(bonuses['item-stats']    || {})) totalStats[s] = (totalStats[s] || 0) + (parseFloat(String(v)) || 0);
    }
  }

  // Set detection
  for (const [, setData] of Object.entries(STATE.loaded?.sets?.files || {})) {
    if (!setData || typeof setData !== 'object') continue;
    let matchCount = 0;
    const elemCount = Object.keys(setData.elements || {}).length;
    for (const [, elemData] of Object.entries(setData.elements || {})) {
      const prefix   = mc.strip(setData.prefix || '');
      const suffix   = mc.strip(setData.suffix || '');
      const elemName = mc.strip(elemData.name || '')
        .replace('%prefix%', prefix).replace('%suffix%', suffix).trim().toLowerCase();
      if (!elemName) continue;
      for (const slotDef of BUILD_SLOTS) {
        const slot = BUILD_STATE.slots[slotDef.key];
        if (!slot?.fname) continue;
        const iData = STATE.loaded?.itemgen?.files?.[slot.fname];
        if (!iData) continue;
        if (mc.strip(iData.name || '').toLowerCase().includes(elemName)) { matchCount++; break; }
      }
    }

    const byAmount = setData.bonuses?.['by-elements-amount'] || {};
    for (const [cnt, bonusData] of Object.entries(byAmount).sort(([a],[b]) => +a - +b)) {
      if (matchCount >= +cnt) {
        activeSets.push({ name: setData.name || '?', count: +cnt, total: elemCount, bonuses: bonusData });
        // Apply set bonus to totals
        for (const [t, v] of Object.entries(bonusData['damage-types']  || {})) totalDmg[t]   = (totalDmg[t]   || 0) + (parseFloat(String(v)) || 0);
        for (const [t, v] of Object.entries(bonusData['defense-types'] || {})) totalDef[t]   = (totalDef[t]   || 0) + (parseFloat(String(v)) || 0);
        for (const [s, v] of Object.entries(bonusData['item-stats']    || {})) totalStats[s] = (totalStats[s] || 0) + (parseFloat(String(v)) || 0);
      }
    }
  }

  return { totalDmg, totalDef, totalStats, totalSkills, activeSets };
}

function renderBuildPreview(_data, _sid) {
  const igFiles   = Object.keys(STATE.loaded?.itemgen?.files    || {});
  const gemFiles  = Object.keys(STATE.loaded?.gems?.files       || {});
  const essFiles  = Object.keys(STATE.loaded?.essences?.files   || {});
  const runeFiles = Object.keys(STATE.loaded?.runes?.files      || {});

  const { totalDmg, totalDef, totalStats, totalSkills, activeSets } = calcBuild();

  // ---- Equipment slots ----
  const slotsHtml = BUILD_SLOTS.map(slotDef => {
    const slot     = BUILD_STATE.slots[slotDef.key];
    const itemData = slot.fname ? STATE.loaded?.itemgen?.files?.[slot.fname] : null;
    const namePreview = itemData
      ? `<span class="build-name-preview">${mc.toHtml(itemData.name ?? '')}</span>` : '';

    // Socket counts — read from item if loaded, else show all slots as available
    const gen     = itemData?.generator || {};
    const sockets = gen.sockets || {};
    const gemMax  = itemData ? (sockets.GEM?.maximum     ?? 0) : 3;
    const essMax  = itemData ? (sockets.ESSENCE?.maximum ?? 0) : 1;
    const runeMax = itemData ? (sockets.RUNE?.maximum    ?? 0) : 1;

    const itemSelect = `
      <select class="edit-input build-slot-select"
        onchange="APP.buildSetSlot('${slotDef.key}',this.value)">
        <option value="">— none —</option>
        ${igFiles.map(f => `<option value="${esc(f)}"${slot.fname===f?' selected':''}>${esc(f)}</option>`).join('')}
      </select>`;

    const lvlInput = `<input class="edit-input edit-input--num" type="number" min="1" max="200"
      value="${slot.level}" style="width:52px"
      oninput="APP.buildSetLevel('${slotDef.key}',this.value)">`;

    // GEM rows (up to gemMax)
    const gemsHtml = Array.from({ length: gemMax }, (_, i) => {
      const gf    = slot.gems[i] || '';
      const gData = gf ? STATE.loaded?.gems?.files?.[gf] : null;
      const gMax  = gData?.level?.max ?? 10;
      return `<div class="build-gem-row">
        <span class="build-socket-icon">💎${i+1}</span>
        <select class="edit-input build-gem-select"
          onchange="APP.buildSetGem('${slotDef.key}',${i},this.value)">
          <option value="">— no gem —</option>
          ${gemFiles.map(f => `<option value="${esc(f)}"${gf===f?' selected':''}>${esc(f)}</option>`).join('')}
        </select>
        ${gf ? `<input class="edit-input edit-input--num" type="number" min="1" max="${gMax}"
          value="${slot.gemLevels[i]||1}" style="width:42px;font-size:11px"
          oninput="APP.buildSetGemLevel('${slotDef.key}',${i},this.value)">` : ''}
      </div>`;
    }).join('');

    // ESSENCE row
    const essHtml = essMax > 0 ? (() => {
      const ef    = slot.essence || '';
      const eData = ef ? STATE.loaded?.essences?.files?.[ef] : null;
      const eMax  = eData?.level?.max ?? 3;
      return `<div class="build-gem-row">
        <span class="build-socket-icon">✨</span>
        <select class="edit-input build-gem-select"
          onchange="APP.buildSetEssence('${slotDef.key}',this.value)">
          <option value="">— no essence —</option>
          ${essFiles.map(f => `<option value="${esc(f)}"${ef===f?' selected':''}>${esc(f)}</option>`).join('')}
        </select>
        ${ef ? `<input class="edit-input edit-input--num" type="number" min="1" max="${eMax}"
          value="${slot.essenceLevel||1}" style="width:42px;font-size:11px"
          oninput="APP.buildSetEssenceLevel('${slotDef.key}',this.value)">` : ''}
      </div>`;
    })() : '';

    // RUNE row
    const runeHtml = runeMax > 0 ? (() => {
      const rf    = slot.rune || '';
      const rData = rf ? STATE.loaded?.runes?.files?.[rf] : null;
      const rMax  = rData?.level?.max ?? 3;
      return `<div class="build-gem-row">
        <span class="build-socket-icon">🔷</span>
        <select class="edit-input build-gem-select"
          onchange="APP.buildSetRune('${slotDef.key}',this.value)">
          <option value="">— no rune —</option>
          ${runeFiles.map(f => `<option value="${esc(f)}"${rf===f?' selected':''}>${esc(f)}</option>`).join('')}
        </select>
        ${rf ? `<input class="edit-input edit-input--num" type="number" min="1" max="${rMax}"
          value="${slot.runeLevel||1}" style="width:42px;font-size:11px"
          oninput="APP.buildSetRuneLevel('${slotDef.key}',this.value)">` : ''}
      </div>`;
    })() : '';

    return `
      <div class="build-slot-card">
        <div class="build-slot-row">
          <span class="build-slot-label">${slotDef.icon} ${slotDef.label}</span>
          ${itemSelect}
          <span class="muted small">Lv</span>${lvlInput}
          ${namePreview}
        </div>
        ${gemsHtml}${essHtml}${runeHtml}
      </div>`;
  }).join('');

  // ---- Summary tables ----
  function statTable(entries, color) {
    if (!entries.length) return `<tr><td colspan="2" class="muted small" style="padding:4px">—</td></tr>`;
    return entries.map(([k, v]) =>
      `<tr><td style="padding:2px 4px">${esc(k)}</td>
           <td style="padding:2px 4px;text-align:right;color:${color}">${typeof v === 'number' ? v.toFixed(2) : esc(String(v))}</td></tr>`
    ).join('');
  }

  const dmgEntries   = Object.entries(totalDmg);
  const defEntries   = Object.entries(totalDef);
  const statEntries  = Object.entries(totalStats);
  const skillEntries = Object.entries(totalSkills);

  // ---- Combat estimate ----
  const totalDmgSum = dmgEntries.reduce((s, [,v]) => s + v, 0);
  const totalDefSum = defEntries.reduce((s, [,v]) => s + v, 0);
  const formulaData = STATE.loaded?.formula;
  const mode        = formulaData?.['defense-formula'] ?? 'FACTOR';
  const customExpr  = formulaData?.['custom-defense-formula'] ?? '';

  let combatHtml = '';
  if (totalDmgSum > 0) {
    const testDefs = [0, 25, 50, 100, 200];
    const rows = testDefs.map(def => {
      const out = evalForMode(mode, customExpr, { damage: totalDmgSum, defense: def });
      return `<tr>
        <td style="padding:2px 8px">def ${def}</td>
        <td style="padding:2px 8px;text-align:right;color:#f88">${out !== null ? out.toFixed(1) : '?'}</td>
      </tr>`;
    }).join('');
    combatHtml = `
      <div class="build-card" style="margin-top:12px">
        <div class="build-card__title">⚡ Combat Estimate (formula: ${esc(mode)})</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <span class="badge badge-red">Total dmg: ${totalDmgSum.toFixed(1)}</span>
          <span class="badge badge-blue">Total def: ${totalDefSum.toFixed(1)}</span>
        </div>
        <table style="font-size:12px"><tbody>${rows}</tbody></table>
        <p class="muted small" style="margin-top:6px">Values are statistical averages. Actual items vary by roll. Gem values added as flat.</p>
      </div>`;
  }

  // ---- Active sets ----
  const setsHtml = activeSets.length
    ? activeSets.map(s => {
        const lore = (s.bonuses.lore || []).map(l => `<div class="muted small">${mc.toHtml(l)}</div>`).join('');
        return `<div class="build-set-entry">
          <span style="font-weight:600">${mc.toHtml(s.name)}</span>
          <span class="badge" style="margin-left:6px">${s.count}/${s.total}pc</span>
          ${lore}
        </div>`;
      }).join('')
    : '<div class="muted small">No active sets detected.</div>';

  const noIgWarn = !igFiles.length
    ? `<div class="alert alert-warn" style="margin-bottom:16px">⚠️ No item generator files loaded — go to <b>Load Files</b> first.</div>`
    : '';

  return `
    ${noIgWarn}

    <div class="build-layout">

      <!-- LEFT: slots -->
      <div class="build-left">
        <div class="build-section-title">🎒 Equipment</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <span class="muted small">Player level:</span>
          <input class="edit-input edit-input--num" type="number" min="1" max="200"
            value="${BUILD_STATE.playerLevel}" style="width:60px"
            oninput="APP.buildSetPlayerLevel(this.value)">
          <span class="muted small">(informational — item level controls stat scaling)</span>
        </div>
        ${slotsHtml}
      </div>

      <!-- RIGHT: summary -->
      <div class="build-right">
        <div class="build-section-title">📊 Build Summary</div>

        <div class="build-stats-grid">
          <div class="build-card">
            <div class="build-card__title" style="color:#f88">⚔️ Damage Types (avg)</div>
            <table style="width:100%;font-size:12px"><tbody>${statTable(dmgEntries,'#f88')}</tbody></table>
          </div>
          <div class="build-card">
            <div class="build-card__title" style="color:#8af">🛡️ Defense Types (avg)</div>
            <table style="width:100%;font-size:12px"><tbody>${statTable(defEntries,'#8af')}</tbody></table>
          </div>
          <div class="build-card">
            <div class="build-card__title" style="color:#af8">📈 Item Stats (avg)</div>
            <table style="width:100%;font-size:12px"><tbody>${statTable(statEntries,'#af8')}</tbody></table>
          </div>
          <div class="build-card">
            <div class="build-card__title" style="color:#fa8">✨ Skills</div>
            <table style="width:100%;font-size:12px"><tbody>${statTable(skillEntries.map(([k,v])=>[k,`Lv ${v}`]),'#fa8')}</tbody></table>
          </div>
        </div>

        <div class="build-card" style="margin-top:8px">
          <div class="build-card__title" style="color:#ffd">👑 Active Sets</div>
          ${setsHtml}
        </div>

        ${combatHtml}
      </div>

    </div>`;
}

// ---------------------------------------------------------------------------
// Fabled Attributes (attributes.yml) — read-only display
// ---------------------------------------------------------------------------

function renderFabledAttributes(data, sid) {
  if (!data || typeof data !== 'object') return '<div class="empty-state">No data.</div>';
  const entries = Object.entries(data).filter(([, v]) => v && typeof v === 'object');
  if (!entries.length) return '<div class="empty-state">No attributes found.</div>';

  const cards = entries.map(([key, attr]) => {
    const stats   = attr.stats ?? {};
    const loreHtml = (attr['icon-lore'] ?? []).map(l =>
      `<div class="lore-line">${mc.toHtml(String(l))}</div>`).join('');
    const statsHtml = Object.entries(stats).map(([k, v]) =>
      `<div class="info-row"><span class="info-label" style="font-size:11px;color:#8fa8cf">${esc(k)}</span>
       <code style="font-size:11px;color:#8fea8f">${esc(String(v).trim())}</code></div>`
    ).join('');

    return `
      <div class="item-card" style="min-width:220px;max-width:320px">
        <div class="item-card__header" style="cursor:default">
          <span class="item-card__icon">⭐</span>
          <strong>${esc(attr.display ?? key)}</strong>
          <span class="badge" style="margin-left:auto">max: ${esc(attr.max ?? '?')}</span>
        </div>
        <div class="item-card__body">
          ${loreHtml ? `<div class="lore-preview" style="margin-bottom:8px">${loreHtml}</div>` : ''}
          ${statsHtml || '<p class="muted small">No stats.</p>'}
        </div>
      </div>`;
  }).join('');

  return `
    <p class="muted small" style="margin-bottom:12px">Read-only — load <code>attributes.yml</code> from your Fabled/SkillAPI plugin folder. Used by item gen to sync fabled attribute lore &amp; pool entries.</p>
    <div class="cards-grid">${cards}</div>`;
}

// ---------------------------------------------------------------------------
// Skills (skills/*.yml) — read-only multiFile display
// ---------------------------------------------------------------------------

function renderSkills(data, sid) {
  if (!data) return '<div class="empty-state">No data.</div>';

  const addBtn = `<button class="btn-add-entry"
    onclick="document.getElementById('skills-file-add-${sid}').click()">📂 Load skill files
    <input id="skills-file-add-${sid}" type="file" accept=".yml,.yaml" multiple style="display:none"
      onchange="APP.onIgAddInput(event,'${sid}')">
  </button>`;

  const toolbar = `
    <div class="entry-actions" style="flex-wrap:wrap;gap:6px">
      ${addBtn}
      <span class="muted small" style="align-self:center">Drop skill .yml files here. Each file = one skill (read-only).</span>
    </div>`;

  if (!data._multiFile) return `${toolbar}<div class="empty-state">Drop skill YAML files above.</div>`;

  const entries = Object.entries(data.files || {});
  if (!entries.length) return `${toolbar}<div class="empty-state">No skill files loaded yet.</div>`;

  const cards = entries.map(([fname, fileData]) => {
    if (!fileData || typeof fileData !== 'object') return '';
    // Each skill file has one top-level key = the skill entry key
    const skillEntry = Object.values(fileData).find(v => v && typeof v === 'object');
    if (!skillEntry) return '';
    const name     = skillEntry.name ?? fname.replace(/\.ya?ml$/i, '');
    const maxLevel = skillEntry['max-level'] ?? '?';
    const loreHtml = (skillEntry['icon-lore'] ?? []).map(l =>
      `<div class="lore-line">${mc.toHtml(String(l))}</div>`).join('');

    return `
      <div class="item-card" style="min-width:180px;max-width:260px">
        <div class="item-card__header" style="cursor:default">
          <span class="item-card__icon">⚔</span>
          <span>${esc(name)}</span>
          <span class="badge">max lvl: ${esc(maxLevel)}</span>
          <span class="muted small" style="margin-left:auto;font-size:10px">${esc(fname)}</span>
        </div>
        ${loreHtml ? `<div class="item-card__body"><div class="lore-preview">${loreHtml}</div></div>` : ''}
      </div>`;
  }).join('');

  return `
    ${toolbar}
    <div class="cards-grid" style="margin-top:10px">${cards}</div>`;
}

// ---------------------------------------------------------------------------
// Ammo types (ammo.yml) — read-only display
// ---------------------------------------------------------------------------

function renderAmmo(data, sid) {
  if (!data || typeof data !== 'object') return '<div class="empty-state">No data.</div>';
  const entries = Object.entries(data).filter(([, v]) => v && typeof v === 'object');
  if (!entries.length) return '<div class="empty-state">No ammo types found.</div>';

  const rows = entries.map(([key, ammo]) => `
    <tr>
      <td><code>${esc(key)}</code></td>
      <td>${mc.toHtml(String(ammo.name ?? ''))}</td>
      <td>${mc.toHtml(String(ammo.format ?? ''))}</td>
      <td><span class="badge ${ammo.enabled !== false ? 'badge-green' : 'badge-red'}">${ammo.enabled !== false ? 'on' : 'off'}</span></td>
    </tr>`).join('');

  return `
    <p class="muted small" style="margin-bottom:10px">Read-only — load <code>ammo.yml</code>. Keys are used in item gen ammo-types field.</p>
    <table class="data-table" style="width:100%">
      <thead><tr><th>Key</th><th>Name</th><th>Format preview</th><th>Enabled</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ---------------------------------------------------------------------------
// Hand types (hand.yml) — read-only display
// ---------------------------------------------------------------------------

function renderHand(data, sid) {
  if (!data || typeof data !== 'object') return '<div class="empty-state">No data.</div>';
  const entries = Object.entries(data).filter(([, v]) => v && typeof v === 'object');
  if (!entries.length) return '<div class="empty-state">No hand types found.</div>';

  const rows = entries.map(([key, hand]) => `
    <tr>
      <td><code>${esc(key)}</code></td>
      <td>${mc.toHtml(String(hand.name ?? ''))}</td>
      <td>${mc.toHtml(String(hand.format ?? ''))}</td>
      <td><span class="badge ${hand.enabled !== false ? 'badge-green' : 'badge-red'}">${hand.enabled !== false ? 'on' : 'off'}</span></td>
    </tr>`).join('');

  return `
    <p class="muted small" style="margin-bottom:10px">Read-only — load <code>hand.yml</code>. Keys are used in item gen hand-types field (ONE / TWO).</p>
    <table class="data-table" style="width:100%">
      <thead><tr><th>Key</th><th>Name</th><th>Format preview</th><th>Enabled</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ---------------------------------------------------------------------------
// Renderer registry
// ---------------------------------------------------------------------------

const RENDERERS = {
  renderFormula,
  renderGeneralStats,
  renderDamage,
  renderDefense,
  renderPenetration,
  renderBuffs,
  renderItemGenerator,
  renderSets,
  renderGems,
  renderEssences,
  renderRunes,
  renderArrows,
  renderConsumables,
  renderBuildPreview,
  renderFabledAttributes,
  renderSkills,
  renderAmmo,
  renderHand,
};
