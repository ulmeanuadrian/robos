// Tarball stamping — concatenare de gzip streams.
//
// Strategie: `robos-base-v{X}.tar.gz` din R2 e construit FARA blocuri terminatoare
// de zero (vezi scripts/build-base-tarball.sh, flag --no-recursion + custom build).
// La download:
//   1. Streamuim base tarball-ul din R2 (deja gzipped)
//   2. Generam un mini tar.gz cu un singur entry `.license-stamp` (cu terminator)
//   3. Concatenam stream-urile
// `tar xzf` peste rezultat extrage tot continutul + stamp-ul.
//
// Toata operatia e streaming — niciodata nu incarcam tarball-ul intreg in memorie.

const TAR_BLOCK = 512;

/**
 * Construieste headerul tar (512 bytes) pentru un fisier.
 */
function tarHeader(name, sizeBytes, mtime = Math.floor(Date.now() / 1000)) {
  const buf = new Uint8Array(TAR_BLOCK);

  // name (100 bytes)
  const nameBytes = new TextEncoder().encode(name);
  if (nameBytes.length > 100) throw new Error(`tar name too long: ${name}`);
  buf.set(nameBytes, 0);

  // mode (8 bytes, octal + null) — 0644
  writeOctal(buf, 100, 8, 0o644);
  // uid (8) — 0
  writeOctal(buf, 108, 8, 0);
  // gid (8) — 0
  writeOctal(buf, 116, 8, 0);
  // size (12)
  writeOctal(buf, 124, 12, sizeBytes);
  // mtime (12)
  writeOctal(buf, 136, 12, mtime);
  // chksum (8) — initially spaces
  for (let i = 148; i < 156; i++) buf[i] = 0x20;
  // typeflag (1) — '0' = regular file
  buf[156] = 0x30;
  // magic (6) — "ustar\0"
  buf.set(new TextEncoder().encode('ustar\0'), 257);
  // version (2) — "00"
  buf.set(new TextEncoder().encode('00'), 263);

  // Compute checksum: sum of all bytes (chksum field as spaces)
  let sum = 0;
  for (let i = 0; i < TAR_BLOCK; i++) sum += buf[i];
  writeOctal(buf, 148, 7, sum);
  buf[155] = 0x20; // space after chksum

  return buf;
}

function writeOctal(buf, offset, len, value) {
  const s = value.toString(8).padStart(len - 1, '0');
  const bytes = new TextEncoder().encode(s);
  buf.set(bytes, offset);
  buf[offset + len - 1] = 0;
}

/**
 * Construieste un mini tar (NEcompresat) cu un singur fisier.
 * Returneaza Uint8Array.
 */
function buildMiniTar(name, contentBytes) {
  const header = tarHeader(name, contentBytes.length);
  // Padding pentru content la multiplu de 512
  const padded = Math.ceil(contentBytes.length / TAR_BLOCK) * TAR_BLOCK;
  const payload = new Uint8Array(padded);
  payload.set(contentBytes);

  // 1024 bytes de zero la final (terminator tar)
  const terminator = new Uint8Array(2 * TAR_BLOCK);

  const out = new Uint8Array(TAR_BLOCK + padded + 2 * TAR_BLOCK);
  out.set(header, 0);
  out.set(payload, TAR_BLOCK);
  out.set(terminator, TAR_BLOCK + padded);
  return out;
}

/**
 * Comprima un Uint8Array prin gzip si returneaza Uint8Array.
 */
async function gzipBytes(bytes) {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const reader = cs.readable.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Streamuieste tarball-ul stamped catre user.
 * - base din R2 (fara terminator, vezi build-base-tarball.sh)
 * - + mini tar.gz cu .license-stamp
 *
 * gzip concat-streams: RFC 1952 garanteaza ca decompresorii proceseaza
 * concatenarea ca un singur logic stream.
 */
export async function streamLicensedTarball(env, licenseStamp) {
  const baseKey = `robos-base-v${env.CURRENT_ROBOS_VERSION}.tar.gz`;
  const baseObj = await env.TARBALLS.get(baseKey);
  if (!baseObj) {
    return new Response(`Base tarball missing: ${baseKey}`, { status: 503 });
  }

  // Build mini tar with robOS/.license-stamp entry, gzip it.
  // Path must match prefix in build-base-tarball.js (robOS/) so stamp lands inside extracted folder.
  const stampTar = buildMiniTar('robOS/.license-stamp', new TextEncoder().encode(licenseStamp + '\n'));
  const stampGz = await gzipBytes(stampTar);

  // Concatenate streams: base tarball body + stamp.tar.gz
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Stream R2 body, then append stampGz, all in background (don't block response)
  (async () => {
    try {
      const reader = baseObj.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
      await writer.write(stampGz);
      await writer.close();
    } catch (e) {
      writer.abort(e);
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      'content-type': 'application/gzip',
      'content-disposition': `attachment; filename="robos-${env.CURRENT_ROBOS_VERSION}.tar.gz"`,
      'cache-control': 'no-store',
      'x-robos-version': env.CURRENT_ROBOS_VERSION,
    },
  });
}
