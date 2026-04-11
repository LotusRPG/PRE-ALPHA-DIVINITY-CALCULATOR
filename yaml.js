/**
 * yaml.js — minimal YAML parser for Divinity config files.
 *
 * Supports:
 *  - key: value (strings, numbers, booleans, null)
 *  - nested objects (indentation-based)
 *  - lists (- item)
 *  - single/double quoted strings
 *  - inline comments (#)
 *
 * Does NOT support anchors, aliases, multi-line strings, or flow style.
 * All Divinity config files fall within these constraints.
 */

'use strict';

const YAML = (() => {

  /**
   * Parse a scalar value string into its JS equivalent.
   * @param {string} raw
   * @returns {string|number|boolean|null}
   */
  function parseScalar(raw) {
    const v = raw.trim();
    if (v === 'true')           return true;
    if (v === 'false')          return false;
    if (v === 'null' || v === '~') return null;
    if ((v.startsWith("'") && v.endsWith("'")) ||
        (v.startsWith('"') && v.endsWith('"'))) {
      return v.slice(1, -1);
    }
    const n = Number(v);
    if (v !== '' && !isNaN(n)) return n;
    return v;
  }

  /**
   * Strip an inline comment from a YAML line.
   * Handles # inside quoted strings correctly.
   * @param {string} line
   * @returns {string}
   */
  function stripComment(line) {
    let inSingle = false, inDouble = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === "'" && !inDouble) inSingle = !inSingle;
      else if (c === '"' && !inSingle) inDouble = !inDouble;
      else if (c === '#' && !inSingle && !inDouble) {
        return line.slice(0, i);
      }
    }
    return line;
  }

  /**
   * Main parse function.
   * @param {string} text   Raw YAML text.
   * @returns {Object}      Parsed object.
   */
  function parse(text) {
    const lines = text.split('\n');
    const root  = {};

    /**
     * Stack entry:
     *   indent  {number}  indentation level of the key that opened this scope
     *   obj     {Object|Array}  the current container
     *   listKey {string|null}   if parent is an object with a pending list key
     */
    const stack = [{ indent: -1, obj: root, listKey: null }];

    const top  = () => stack[stack.length - 1];

    /** Return the nearest object on the stack (skip list wrappers). */
    const currentObj = () => {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (!Array.isArray(stack[i].obj)) return stack[i].obj;
      }
      return root;
    };

    /** Return the nearest array on the stack, or null. */
    const currentArr = () => {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (Array.isArray(stack[i].obj)) return stack[i].obj;
      }
      return null;
    };

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const stripped = stripComment(raw).trimEnd();
      if (stripped.trim() === '') continue;

      const indent  = stripped.search(/\S/);
      const content = stripped.trim();

      // Pop stack entries whose indent >= current indent
      while (stack.length > 1 && top().indent >= indent) {
        stack.pop();
      }

      // ---- List item  (starts with "- ")  ----
      if (content.startsWith('- ')) {
        const itemVal = content.slice(2).trim();
        // Find the nearest array to push into
        let arr = currentArr();

        if (!arr) {
          // Shouldn't happen with well-formed YAML, but be safe
          continue;
        }

        if (itemVal.includes(':')) {
          // Inline mapping inside list  e.g. "- key: value" — push object
          const obj = {};
          arr.push(obj);
          const colonIdx = itemVal.indexOf(':');
          const k = itemVal.slice(0, colonIdx).trim();
          const v = itemVal.slice(colonIdx + 1).trim();
          obj[k] = v === '' ? {} : parseScalar(v);
        } else {
          arr.push(parseScalar(itemVal));
        }
        continue;
      }

      // ---- Key: value  ----
      if (content.includes(':')) {
        const colonIdx = content.indexOf(':');
        const key = content.slice(0, colonIdx).trim();
        const val = content.slice(colonIdx + 1).trim();

        // Determine parent object
        const parent = currentObj();

        if (val === '') {
          // Look ahead to decide: nested object or list?
          let nextContent = '';
          for (let j = i + 1; j < lines.length; j++) {
            const nl = lines[j].trim();
            if (nl && !nl.startsWith('#')) { nextContent = nl; break; }
          }

          if (nextContent.startsWith('- ')) {
            // This key maps to a list
            parent[key] = [];
            // Push a list frame so list items know where to go
            stack.push({ indent, obj: parent, listKey: key });
            stack.push({ indent: indent - 1, obj: parent[key], listKey: null });
          } else {
            // Nested object
            parent[key] = {};
            stack.push({ indent, obj: parent[key], listKey: null });
          }
        } else {
          parent[key] = parseScalar(val);
        }
        continue;
      }
    }

    return root;
  }

  // ---------------------------------------------------------------------------
  // Stringify (serialize JS object → YAML text)
  // ---------------------------------------------------------------------------

  /**
   * Quote a string value for YAML output if necessary.
   * @param {string} s
   * @returns {string}
   */
  function quoteString(s) {
    // Must quote if: empty, starts with YAML special char, reserved word,
    // contains ': ', has leading/trailing whitespace, or contains newline.
    const needsQuote =
      s === '' ||
      /^[&*!|>'"%@`{}\[\]?,]/.test(s) ||
      s.trim() !== s ||
      s.includes('\n') || s.includes('\r') || s.includes(': ') ||
      /^(true|false|null|yes|no|on|off)$/i.test(s);
    if (needsQuote) {
      return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
                     .replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
    }
    return s;
  }

  /**
   * Serialize a JS value to a YAML string.
   * @param {*}      value
   * @param {number} [indent=0]   Current indentation level.
   * @returns {string}
   */
  function stringifyValue(value, indent) {
    const pad = '  '.repeat(indent);

    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number')  return isFinite(value) ? String(value) : 'null';
    if (typeof value === 'string')  return quoteString(value);

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      return value.map(item => `${pad}- ${stringifyValue(item, indent + 1)}`).join('\n');
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value);
      if (entries.length === 0) return '{}';
      return entries.map(([k, v]) => {
        if (Array.isArray(v)) {
          if (v.length === 0) return `${pad}${k}: []`;
          const items = v.map(item => `${pad}  - ${stringifyValue(item, indent + 2)}`).join('\n');
          return `${pad}${k}:\n${items}`;
        }
        if (typeof v === 'object' && v !== null) {
          const nested = stringifyValue(v, indent + 1);
          return nested === '{}' ? `${pad}${k}: {}` : `${pad}${k}:\n${nested}`;
        }
        return `${pad}${k}: ${stringifyValue(v, 0)}`;
      }).join('\n');
    }

    return String(value);
  }

  /**
   * Serialize a root object to a YAML string.
   * @param {Object} obj
   * @returns {string}
   */
  function stringify(obj) {
    return stringifyValue(obj, 0) + '\n';
  }

  return { parse, stringify };
})();
