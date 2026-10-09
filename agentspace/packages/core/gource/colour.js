// Colours as Gource computes them (written from its documented behaviour):
//  - a string hash with seed 31 where the multiplier is (seed XOR (n - i)) and characters are signed bytes,
//  - colour = normalised (hash/7 % 255, hash/3 % 255, hash % 255) — a unit vector, so files look muted,
//  - file colour from the extension (white when there is none), user colour lifted towards white.

const utf8 = (s) => {
  const out = [];
  for (const ch of String(s)) {
    let c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
};

export function gStringHash(str, seed = 31) {
  const b = utf8(str);
  const n = b.length;
  let val = 0;
  for (let i = 0; i < n; i++) {
    const c = b[i] > 127 ? b[i] - 256 : b[i];
    val = (val + c * (seed ^ (n - i))) | 0;
  }
  return val < 0 ? -val : val;
}

export function gColourHash(str) {
  let h = gStringHash(str);
  if (h === 0) h = 1;
  const r = Math.floor(h / 7) % 255;
  const g = Math.floor(h / 3) % 255;
  const b = h % 255;
  const l = Math.hypot(r, g, b) || 1;
  return [r / l, g / l, b / l];
}

export function gExtension(name) {
  const base = String(name).split('/').pop();
  const dot = base.lastIndexOf('.');
  return dot >= 0 && dot !== base.length - 1 ? base.slice(dot + 1) : '';
}

export function gFileColour(path) {
  const ext = gExtension(path);
  return ext ? gColourHash(ext) : [1, 1, 1];
}

export function gUserColour(name) {
  const c = gColourHash(name);
  return [(c[0] * 0.6 + 0.4) * 0.9, (c[1] * 0.6 + 0.4) * 0.9, (c[2] * 0.6 + 0.4) * 0.9];
}

export const gHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
