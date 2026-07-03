/**
 * Embeds the plan JSON inside exported PNG images (as a `tEXt` chunk) so the
 * image itself can be re-opened via Load Plan and edited — no separate JSON
 * file needed. Older PNGs exported before this feature contain no plan data.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const KEYWORD = "frp-plan"; // tEXt keyword identifying our payload

let crcTable: Uint32Array | null = null;
function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function hasPngSignature(buf: Uint8Array): boolean {
  if (buf.length < 8) return false;
  for (let i = 0; i < 8; i++) if (buf[i] !== PNG_SIGNATURE[i]) return false;
  return true;
}

/** Base64 helpers that survive large arrays (no spread-into-fromCharCode). */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as number[]);
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Find the byte offset of the IEND chunk by walking the chunk list. */
function findIendOffset(buf: Uint8Array): number {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 8;
  while (pos + 12 <= buf.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]);
    if (type === "IEND") return pos;
    pos += 12 + len;
  }
  return -1;
}

/** Return a new PNG blob with the plan JSON stored in a tEXt chunk. */
export async function embedPlanInPng(blob: Blob, planJson: string): Promise<Blob> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (!hasPngSignature(buf)) return blob;
  const iend = findIendOffset(buf);
  if (iend < 0) return blob;

  // tEXt layout: keyword, NUL separator, then text (we store base64 JSON so
  // the payload stays within Latin-1 as the spec requires).
  const b64 = bytesToBase64(new TextEncoder().encode(planJson));
  const data = new Uint8Array(KEYWORD.length + 1 + b64.length);
  for (let i = 0; i < KEYWORD.length; i++) data[i] = KEYWORD.charCodeAt(i);
  data[KEYWORD.length] = 0;
  for (let i = 0; i < b64.length; i++) data[KEYWORD.length + 1 + i] = b64.charCodeAt(i);

  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk[4] = 0x74; chunk[5] = 0x45; chunk[6] = 0x58; chunk[7] = 0x74; // "tEXt"
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));

  const out = new Uint8Array(buf.length + chunk.length);
  out.set(buf.subarray(0, iend), 0);
  out.set(chunk, iend);
  out.set(buf.subarray(iend), iend + chunk.length);
  return new Blob([out], { type: "image/png" });
}

/** Extract an embedded plan from a PNG file; null when none is present. */
export async function extractPlanFromPng(file: Blob): Promise<unknown | null> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!hasPngSignature(buf)) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 8;
  while (pos + 12 <= buf.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]);
    if (type === "tEXt" && len > KEYWORD.length + 1) {
      const data = buf.subarray(pos + 8, pos + 8 + len);
      let isOurs = data[KEYWORD.length] === 0;
      if (isOurs) {
        for (let i = 0; i < KEYWORD.length; i++) {
          if (data[i] !== KEYWORD.charCodeAt(i)) { isOurs = false; break; }
        }
      }
      if (isOurs) {
        let b64 = "";
        for (let i = KEYWORD.length + 1; i < data.length; i++) b64 += String.fromCharCode(data[i]);
        try {
          return JSON.parse(new TextDecoder().decode(base64ToBytes(b64)));
        } catch {
          return null;
        }
      }
    }
    if (type === "IEND") break;
    pos += 12 + len;
  }
  return null;
}
