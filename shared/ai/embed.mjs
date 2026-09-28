// Pure embedding math, shared by the seed-time embedder, the Worker and the tests.
// No network here: quantisation and fusion are the parts worth unit-testing.

export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIM = 768; // matryoshka-truncated; keeps the corpus at ~1.7 MB

/** L2-normalise, then quantise to int8. Cosine error at 8 bits is ~1e-3: irrelevant
 *  for ranking, and it makes a 3 KB float vector 768 bytes. */
export function quantizeInt8(v) {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  const out = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) {
    out[i] = Math.max(-127, Math.min(127, Math.round((v[i] / norm) * 127)));
  }
  return out;
}

export function toHex(i8) {
  let s = "";
  for (let i = 0; i < i8.length; i++) s += (i8[i] & 0xff).toString(16).padStart(2, "0");
  return s;
}

export function fromHex(hex) {
  const out = new Int8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = (parseInt(hex.substr(i * 2, 2), 16) << 24) >> 24;
  return out;
}

/** D1 hands BLOBs back as ArrayBuffers in the Worker. */
export function fromBytes(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return new Int8Array(u8.buffer, u8.byteOffset, u8.length);
}

/** Semantic ranking switches on once enough key moments are embedded to matter.
 *
 * Coverage is reported, not hidden - but nine vectors is not a semantic layer, it
 * is a token gesture that would let the UI claim "semantic" while changing almost
 * nothing. The embedding build is resumable and quota-gated (1000 requests/day);
 * when it passes MIN_SEMANTIC_VECTORS the mode flips on by itself and the badge
 * says exactly what is embedded.
 */
export const MIN_SEMANTIC_VECTORS = 150;
export function semanticReady(vectorCount, segmentCount) {
  return segmentCount > 0 && vectorCount >= MIN_SEMANTIC_VECTORS;
}

/** Dot product over int8 == cosine up to the quantisation error, since both sides
 *  were unit-normalised before quantising. */
export function similarity(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Reciprocal-rank fusion of two ranked lists. No score normalisation needed,
 *  which is the point: lexical scores and cosines are not comparable units. */
export function rrfMerge(lists, k = 60, limit = 60) {
  const score = new Map();
  const item = new Map();
  for (const list of lists) {
    list.forEach((entry, rank) => {
      const key = entry.key;
      score.set(key, (score.get(key) || 0) + 1 / (k + rank + 1));
      if (!item.has(key)) item.set(key, entry);
    });
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, s]) => ({ ...item.get(key), rrf: s }));
}
