// SURVIA の「写真台帳」→「建物写真整理で開く」から、案件の写真と内観のグループ名を受け取り、出来た写真.pdf を案件へ戻す。
// - SURVIA は自分の PC の中（127.0.0.1）に受け渡し口を開き、http://localhost:5177/#/?survia=<port>.<token> で開く。
//   受け渡し口の場所は URL の # の後ろ（サーバーに送られない）。読んだらすぐ URL から消す。
// - 受け渡し口は manifest（グループ名と写真の名前）・photo/<番号>（写真の中身）・pdf（写真.pdf の保存）。
// - 写真は「写真を追加」と同じ扱い（ファイル名で分類・圧縮）にするため File にして渡す。

export const SURVIA_HANDOFF_KIND = 'survia-photo-building-handoff';
const PARAM = 'survia';
const FETCH_TIMEOUT_MS = 30_000;
const MAX_PHOTOS = 300;

export type SurviaRef = { port: number; token: string };
export type SurviaGroup = { buildingGroup: number; name: string };
export type SurviaManifest = { groups: SurviaGroup[]; photos: { index: number; name: string }[] };

/** URL の # の後ろから受け渡し口を読む。形が違えば null。 */
export const readHandoffRef = (hash = ''): SurviaRef | null => {
  const q = hash.indexOf('?');
  if (q < 0) return null;
  const value = new URLSearchParams(hash.slice(q + 1)).get(PARAM);
  const m = /^(\d{4,5})\.([A-Za-z0-9_-]{43})$/.exec(value ?? '');
  if (!m) return null;
  const port = Number(m[1]);
  return port >= 1024 && port <= 65535 ? { port, token: m[2] } : null;
};

/** # の後ろから受け渡し口を消した形（ほかの値は残す）。 */
export const stripHandoffRef = (hash = '') => {
  const q = hash.indexOf('?');
  if (q < 0) return hash;
  const params = new URLSearchParams(hash.slice(q + 1));
  params.delete(PARAM);
  const rest = params.toString();
  const head = hash.slice(0, q);
  return rest ? `${head}?${rest}` : head === '#/' ? '' : head;
};

const base = ({ port, token }: SurviaRef) => `http://127.0.0.1:${port}/survia-photo/${token}/`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 受け取った一覧の形を確かめる（違えば null）。 */
export const parseManifest = (v: unknown): SurviaManifest | null => {
  if (!isObj(v) || v.kind !== SURVIA_HANDOFF_KIND || v.version !== 1 || !Array.isArray(v.groups) || !Array.isArray(v.photos)) return null;
  if (v.photos.length > MAX_PHOTOS || v.groups.length > 100) return null;
  const groups: SurviaGroup[] = [];
  for (const g of v.groups) {
    if (!isObj(g) || !Number.isInteger(g.buildingGroup) || (g.buildingGroup as number) < 0 || typeof g.name !== 'string' || g.name.length > 50) return null;
    groups.push({ buildingGroup: g.buildingGroup as number, name: g.name });
  }
  const photos: SurviaManifest['photos'] = [];
  for (const p of v.photos) {
    if (!isObj(p) || !Number.isInteger(p.index) || typeof p.name !== 'string' || !/\.(jpe?g|png)$/i.test(p.name) || /[\\/]/.test(p.name)) return null;
    photos.push({ index: p.index as number, name: p.name });
  }
  return { groups, photos };
};

const get = async (url: string) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-store' });
  if (!res.ok) throw new Error(`SURVIA から受け取れませんでした（${res.status}）`);
  return res;
};

/** SURVIA から一覧と写真を受け取る（写真は File にする。onProgress は受け取った枚数）。 */
export const receiveFromSurvia = async (ref: SurviaRef, onProgress?: (done: number, total: number) => void) => {
  const manifest = parseManifest(await (await get(`${base(ref)}manifest`)).json());
  if (!manifest) throw new Error('SURVIA から受け取った中身が不正です');
  const files: File[] = [];
  for (const p of manifest.photos) {
    const res = await get(`${base(ref)}photo/${p.index}`);
    const type = /\.png$/i.test(p.name) ? 'image/png' : 'image/jpeg';
    files.push(new File([await res.blob()], p.name, { type }));
    onProgress?.(files.length, manifest.photos.length);
  }
  return { groups: manifest.groups, files };
};

/** 写真.pdf を SURVIA の案件のフォルダへ保存する。保存したファイルの名前を返す。 */
export const savePdfToSurvia = async (ref: SurviaRef, pdf: Uint8Array) => {
  let res: Response;
  try {
    res = await fetch(`${base(ref)}pdf`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }) });
  } catch {
    throw new Error('SURVIA に届きません。SURVIA から開き直してください。');
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok && isObj(body) && body.kind === 'saved' && typeof body.name === 'string') return body.name;
  throw new Error(isObj(body) && typeof body.reason === 'string' ? body.reason : `保存できませんでした（${res.status}）`);
};
