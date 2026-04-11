/**
 * zip.js — minimal uncompressed ZIP builder.
 * No external dependencies. Works in all modern browsers.
 *
 * Usage:
 *   const z = new ZipBuilder();
 *   z.add('folder/file.yml', yamlString);
 *   const blob = z.blob();
 *   // download blob...
 */

'use strict';

(function () {
  // CRC-32 lookup table
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function u16(view, off, v) { view.setUint16(off, v, true); }
  function u32(view, off, v) { view.setUint32(off, v, true); }

  class ZipBuilder {
    constructor() {
      this._entries = [];   // { pathBytes, dataBytes, crc, localOffset }
      this._localSize = 0;
      this._enc = new TextEncoder();
    }

    /** Add a file. path may include '/' for subdirectories. */
    add(path, content) {
      const pathBytes = this._enc.encode(path.replace(/\\/g, '/'));
      const dataBytes = this._enc.encode(content);
      const crc       = crc32(dataBytes);

      // Local file header (30) + filename + data
      const localHeader = new Uint8Array(30 + pathBytes.length);
      const lv = new DataView(localHeader.buffer);
      u32(lv,  0, 0x04034b50); // signature
      u16(lv,  4, 20);          // version needed
      u16(lv,  6, 0);           // flags
      u16(lv,  8, 0);           // compression: STORE
      u16(lv, 10, 0);           // mod time
      u16(lv, 12, 0);           // mod date
      u32(lv, 14, crc);         // CRC-32
      u32(lv, 18, dataBytes.length); // compressed size
      u32(lv, 22, dataBytes.length); // uncompressed size
      u16(lv, 26, pathBytes.length); // filename length
      u16(lv, 28, 0);           // extra field length
      localHeader.set(pathBytes, 30);

      this._entries.push({
        pathBytes,
        dataBytes,
        crc,
        localOffset: this._localSize,
        localHeader,
      });
      this._localSize += localHeader.length + dataBytes.length;
    }

    /** Returns a Blob containing the complete ZIP archive. */
    blob() {
      const parts = [];

      // Local file headers + data
      for (const e of this._entries) {
        parts.push(e.localHeader, e.dataBytes);
      }

      // Central directory
      const centralOffset = this._localSize;
      let centralSize = 0;

      for (const e of this._entries) {
        const ch = new Uint8Array(46 + e.pathBytes.length);
        const cv = new DataView(ch.buffer);
        u32(cv,  0, 0x02014b50); // signature
        u16(cv,  4, 20);          // version made by
        u16(cv,  6, 20);          // version needed
        u16(cv,  8, 0);           // flags
        u16(cv, 10, 0);           // compression
        u16(cv, 12, 0);           // mod time
        u16(cv, 14, 0);           // mod date
        u32(cv, 16, e.crc);       // CRC-32
        u32(cv, 20, e.dataBytes.length); // compressed size
        u32(cv, 24, e.dataBytes.length); // uncompressed size
        u16(cv, 28, e.pathBytes.length); // filename length
        u16(cv, 30, 0);           // extra length
        u16(cv, 32, 0);           // comment length
        u16(cv, 34, 0);           // disk start
        u16(cv, 36, 0);           // internal attrs
        u32(cv, 38, 0);           // external attrs
        u32(cv, 42, e.localOffset); // local header offset
        ch.set(e.pathBytes, 46);
        parts.push(ch);
        centralSize += ch.length;
      }

      // End of central directory record
      const eocd = new Uint8Array(22);
      const ev = new DataView(eocd.buffer);
      u32(ev,  0, 0x06054b50);           // signature
      u16(ev,  4, 0);                     // disk number
      u16(ev,  6, 0);                     // central dir disk
      u16(ev,  8, this._entries.length);  // entries on this disk
      u16(ev, 10, this._entries.length);  // total entries
      u32(ev, 12, centralSize);           // central dir size
      u32(ev, 16, centralOffset);         // central dir offset
      u16(ev, 20, 0);                     // comment length
      parts.push(eocd);

      return new Blob(parts, { type: 'application/zip' });
    }
  }

  window.ZipBuilder = ZipBuilder;
})();
