import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const SITE = 'https://en.onepiece-cardgame.com';
const codePattern = /^[A-Z]+\d*-\d{3}$/;
const pathPattern = /^\/images\/cardlist\/card\/([a-z0-9_-]+)\.(png|jpe?g|webp)$/i;
const maxBytes = 8 * 1024 * 1024;
const pngStart = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const pngEnd = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

export function artworkAddress(value, code) {
  if (!value) return '';
  try {
    const url = new URL(value, SITE);
    const file = url.pathname.match(pathPattern);
    if (url.origin !== SITE || !file || url.username || url.password) return '';
    const stem = file[1].toUpperCase();
    if (code && stem !== code && !stem.startsWith(code + '_')) return '';
    return url.href;
  } catch { return ''; }
}

export function artworkCandidates(card) {
  if (!codePattern.test(card?.code ?? '')) return [];
  const original = artworkAddress(card.artwork_url, card.code);
  const official = (card.artwork_alternatives ?? []).map(url => artworkAddress(url, card.code)).filter(Boolean);
  const canonical = new URL('/images/cardlist/card/' + card.code + '.png', SITE).href;
  return [...new Set([original, ...official.slice(0, 2), canonical].filter(Boolean))];
}

export function artworkType(bytes) {
  if (!bytes || bytes.length < 24 || bytes.length > maxBytes) return '';
  if (bytes.subarray(0, 8).equals(pngStart) && bytes.subarray(-12).equals(pngEnd) &&
      bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 &&
      bytes.at(-2) === 255 && bytes.at(-1) === 217) return 'image/jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' &&
      bytes.readUInt32LE(4) + 8 === bytes.length) return 'image/webp';
  return '';
}

export async function fetchArtwork(card, fetcher = fetch) {
  for (const candidate of artworkCandidates(card)) {
    let address = candidate;
    const signal = AbortSignal.timeout(13000);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetcher(address, { redirect: 'manual', signal });
        const location = response.headers.get('location');
        if (response.status >= 300 && response.status < 400 && location) {
          const redirected = artworkAddress(new URL(location, address).href, card.code);
          if (!redirected || redirected === address) break;
          address = redirected;
          continue;
        }
        if (!response.ok || Number(response.headers.get('content-length')) > maxBytes || !response.body) {
          await response.body?.cancel().catch(() => {});
          break;
        }
        const reader = response.body.getReader();
        const parts = [];
        let size = 0;
        while (size <= maxBytes) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          parts.push(value);
        }
        if (size > maxBytes) { await reader.cancel(); break; }
        const bytes = Buffer.concat(parts, size);
        const type = artworkType(bytes);
        if (type) return { bytes, type, address };
        break;
      } catch { break; }
    }
  }
  return null;
}

export function createArtworkStore({ bundled, cached, offline, fetcher = fetch }) {
  const open = new Map();
  const rejected = new Map();
  const queue = [];
  let active = 0;
  const drain = () => {
    while (active < 6 && queue.length) {
      const { card, resolve, reject } = queue.shift();
      active++;
      void fetchArtwork(card, fetcher).then(resolve, reject).finally(() => { active--; drain(); });
    }
  };
  const read = async file => {
    const bytes = await readFile(file).catch(() => null);
    const type = artworkType(bytes);
    return type ? { bytes, type } : null;
  };
  async function load(card) {
    const cache = path.join(cached, card.code + '.img');
    const existing = await read(path.join(bundled, card.code + '.png')) ?? await read(cache);
    if (existing || offline) return existing;
    if (Date.now() < (rejected.get(card.code) ?? 0)) return null;
    const art = await new Promise((resolve, reject) => { queue.push({ card, resolve, reject }); drain(); });
    if (!art) {
      rejected.set(card.code, Date.now() + 12_000);
      return null;
    }
    const temp = cache + '.' + process.pid + '.tmp';
    await writeFile(temp, art.bytes).then(() => rename(temp, cache)).catch(() => {});
    rejected.delete(card.code);
    return art;
  }
  return card => {
    if (!codePattern.test(card?.code ?? '')) return Promise.resolve(null);
    if (!open.has(card.code)) open.set(card.code, load(card).finally(() => open.delete(card.code)));
    return open.get(card.code);
  };
}
