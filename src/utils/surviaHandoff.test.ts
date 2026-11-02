import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseManifest, readHandoffRef, receiveFromSurvia, savePdfToSurvia, stripHandoffRef } from './surviaHandoff';

// SURVIA からの受け取り。架空のデータだけ。
const TOKEN = 'A'.repeat(43);
const manifest = { kind: 'survia-photo-building-handoff', version: 1, groups: [{ buildingGroup: 0, name: '居宅' }], photos: [{ index: 0, name: 'A.jpg' }, { index: 1, name: '1.png' }] };

afterEach(() => vi.unstubAllGlobals());

describe('受け渡し口の場所', () => {
  it('# の後ろの survia=<port>.<token> だけを読む', () => {
    expect(readHandoffRef(`#/?survia=51234.${TOKEN}`)).toEqual({ port: 51234, token: TOKEN });
    expect(readHandoffRef('#/?survia=80.x')).toBeNull();
    expect(readHandoffRef(`#/?survia=99999.${TOKEN}`)).toBeNull();
    expect(readHandoffRef('')).toBeNull();
  });

  it('読んだ後は URL から消す', () => {
    expect(stripHandoffRef(`#/?survia=51234.${TOKEN}`)).toBe('');
    expect(stripHandoffRef(`#/?a=1&survia=51234.${TOKEN}`)).toBe('#/?a=1');
  });
});

describe('受け取る中身', () => {
  it('形を確かめる（写真は jpg・png の名前だけ、場所を含む名前は断る）', () => {
    expect(parseManifest(manifest)).toEqual({ groups: manifest.groups, photos: manifest.photos });
    expect(parseManifest({ ...manifest, kind: 'x' })).toBeNull();
    expect(parseManifest({ ...manifest, photos: [{ index: 0, name: '../A.jpg' }] })).toBeNull();
    expect(parseManifest({ ...manifest, photos: [{ index: 0, name: 'A.exe' }] })).toBeNull();
  });

  it('一覧と写真を受け取り File にする', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      if (url.endsWith('/manifest')) return new Response(JSON.stringify(manifest));
      return new Response(new Blob(['img']));
    });
    const r = await receiveFromSurvia({ port: 51234, token: TOKEN });
    expect(urls).toEqual([
      `http://127.0.0.1:51234/survia-photo/${TOKEN}/manifest`,
      `http://127.0.0.1:51234/survia-photo/${TOKEN}/photo/0`,
      `http://127.0.0.1:51234/survia-photo/${TOKEN}/photo/1`,
    ]);
    expect(r.groups).toEqual([{ buildingGroup: 0, name: '居宅' }]);
    expect(r.files.map((f) => [f.name, f.type])).toEqual([['A.jpg', 'image/jpeg'], ['1.png', 'image/png']]);
  });

  it('写真.pdf を POST し、保存した名前を返す。断られたら理由を出す', async () => {
    const sent: RequestInit[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent.push(init);
      return sent.length === 1
        ? new Response(JSON.stringify({ kind: 'saved', name: '写真 (2).pdf' }))
        : new Response(JSON.stringify({ kind: 'failed', reason: 'PDF ではありません' }), { status: 400 });
    });
    expect(await savePdfToSurvia({ port: 51234, token: TOKEN }, new Uint8Array([37, 80, 68, 70, 45]))).toBe('写真 (2).pdf');
    expect(sent[0].method).toBe('POST');
    await expect(savePdfToSurvia({ port: 51234, token: TOKEN }, new Uint8Array([1]))).rejects.toThrow('PDF ではありません');
  });
});
