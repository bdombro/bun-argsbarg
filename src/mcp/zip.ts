/*
Minimal ZIP writer (store method, no compression) for MCPB and Claude plugin bundles.
*/

/** Info-ZIP Unix UID/GID extra field (`0x7875`) for permission restore on extract. */
function unixUxExtraField(uid: number, gid: number): Buffer {
  const uidBuf = Buffer.alloc(4);
  uidBuf.writeUInt32LE(uid >>> 0, 0);
  const gidBuf = Buffer.alloc(4);
  gidBuf.writeUInt32LE(gid >>> 0, 0);
  const payload = Buffer.concat([Buffer.from([1, 4]), uidBuf, Buffer.from([4]), gidBuf]);
  const header = Buffer.alloc(4);
  header.writeUInt16LE(0x7875, 0);
  header.writeUInt16LE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

/** Info-ZIP Unix permission extra field (`0x7855`). */
function unixUpExtraField(unixMode: number): Buffer {
  const payload = Buffer.alloc(5);
  payload.writeUInt8(1, 0);
  payload.writeUInt32LE(unixMode >>> 0, 1);
  const header = Buffer.alloc(4);
  header.writeUInt16LE(0x7855, 0);
  header.writeUInt16LE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

function unixExtraFields(unixMode: number): Buffer {
  const { uid, gid } = defaultUnixIds();
  return Buffer.concat([unixUpExtraField(unixMode), unixUxExtraField(uid, gid)]);
}

function defaultUnixIds(): { uid: number; gid: number } {
  const uid = typeof process.getuid === "function" ? process.getuid() : 501;
  const gid = typeof process.getgid === "function" ? process.getgid() : 20;
  return { uid, gid };
}

/** CRC-32 for ZIP local headers. */
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    if (byte === undefined) {
      continue;
    }
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** One file entry for {@link zipStore}. */
export interface ZipFileEntry {
  name: string;
  data: Buffer;
  /** Unix permission bits (e.g. `0o755`). Encoded in ZIP external attributes when set. */
  unixMode?: number;
}

/** Writes a minimal ZIP (store, no compression) with one or more files. */
export function zipStore(files: ZipFileEntry[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const crc = crc32(file.data);
    const unixMode = file.unixMode;
    const extra = unixMode !== undefined ? unixExtraFields(unixMode) : Buffer.alloc(0);
    const local = Buffer.alloc(30 + nameBuf.length + extra.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(unixMode !== undefined ? 10 : 20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt32LE(nameBuf.length, 26);
    local.writeUInt16LE(extra.length, 28);
    nameBuf.copy(local, 30);
    extra.copy(local, 30 + nameBuf.length);

    const centralHdr = Buffer.alloc(46 + nameBuf.length + extra.length);
    centralHdr.writeUInt32LE(0x02014b50, 0);
    // macOS Info-ZIP stores version made by before version needed (non-APPNOTE layout).
    centralHdr.writeUInt16LE(unixMode !== undefined ? 0x031e : 20, 4);
    centralHdr.writeUInt16LE(unixMode !== undefined ? 10 : 20, 6);
    centralHdr.writeUInt16LE(0, 8);
    centralHdr.writeUInt16LE(0, 10);
    centralHdr.writeUInt16LE(0, 12);
    centralHdr.writeUInt16LE(0, 14);
    centralHdr.writeUInt32LE(crc, 16);
    centralHdr.writeUInt32LE(file.data.length, 20);
    centralHdr.writeUInt32LE(file.data.length, 24);
    centralHdr.writeUInt32LE(nameBuf.length, 28);
    centralHdr.writeUInt16LE(extra.length, 30);
    centralHdr.writeUInt16LE(0, 32);
    centralHdr.writeUInt16LE(0, 34);
    centralHdr.writeUInt16LE(0, 36);
    if (unixMode !== undefined) {
      const externalAttr = (unixMode << 16) >>> 0;
      centralHdr.writeUInt32LE(externalAttr, 38);
    } else {
      centralHdr.writeUInt32LE(0, 38);
    }
    centralHdr.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHdr, 46);
    extra.copy(centralHdr, 46 + nameBuf.length);

    parts.push(local, file.data);
    central.push(centralHdr);
    offset += local.length + file.data.length;
  }

  const centralStart = offset;
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, centralBuf, end]);
}
