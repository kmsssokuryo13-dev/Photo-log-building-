import { describe, expect, it } from 'vitest';
import type { InteriorGroup, Photo } from '../types/photo';
import { classifyPhotoFileName, createCaption, resolvePhotoCaption } from './photoClassifier';
import {
  buildSpecialStructurePairs,
  findSpecialStructurePair,
  getSpecialStructureLabel,
  keepSpecialStructurePairsAdjacent,
  updateSpecialStructureInclusion,
} from './specialStructure';

const photoFromName = (fileName: string): Photo => ({
  id: fileName,
  url: '',
  originalFileName: fileName,
  rotation: 0,
  ...classifyPhotoFileName(fileName),
});

const group: InteriorGroup = {
  id: 'main',
  buildingGroup: 0,
  name: '居宅',
  showInside: true,
  showInclusion: false,
  showExclusion: false,
  photoIds: [],
};

const getDisplayLabels = (fileNames: string[]) => {
  const pairs = buildSpecialStructurePairs(fileNames.map(photoFromName));
  return fileNames.map((fileName) => getSpecialStructureLabel(
    findSpecialStructurePair(pairs, fileName)!,
  ));
};

describe('special structure pairs', () => {
  it('同一ペアへ同じ表示番号を付ける', () => {
    expect(getDisplayLabels(['出窓1.jpg', '出窓1-.jpg', '出窓2.jpg', '出窓2-.jpg']))
      .toEqual(['出窓1', '出窓1', '出窓2', '出窓2']);
  });

  it('附属建物でも表示番号を1から開始する', () => {
    const fileNames = ['出窓20.jpg', '出窓20-.jpg', '出窓21.jpg', '出窓21-.jpg'];
    const pairs = buildSpecialStructurePairs(fileNames.map(photoFromName));
    expect(pairs.every((pair) => pair.buildingGroup === 2)).toBe(true);
    expect(fileNames.map((fileName) => getSpecialStructureLabel(
      findSpecialStructurePair(pairs, fileName)!,
    ))).toEqual(['出窓1', '出窓1', '出窓2', '出窓2']);
  });

  it('特殊構造種別ごとに別々に連番する', () => {
    expect(getDisplayLabels([
      '出窓1.jpg', '出窓1-.jpg', '吹抜2.jpg',
      '吹抜2-.jpg', '出窓3.jpg', '出窓3-.jpg',
    ])).toEqual(['出窓1', '出窓1', '吹抜1', '吹抜1', '出窓2', '出窓2']);
  });

  it('元番号に欠番があっても表示番号を連続させる', () => {
    expect(getDisplayLabels(['出窓1.jpg', '出窓1-.jpg', '出窓5.jpg', '出窓5-.jpg']))
      .toEqual(['出窓1', '出窓1', '出窓2', '出窓2']);
  });

  it('片側だけでも1つの特殊構造項目として扱う', () => {
    const pairs = buildSpecialStructurePairs([photoFromName('出窓1.jpg')]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ displayNumber: 1, photoIds: ['出窓1.jpg'] });
  });

  it('同一ペアで算入状態を共有し、別ペアでは分離する', () => {
    const fileNames = ['出窓1.jpg', '出窓1-.jpg', '出窓2.jpg', '出窓2-.jpg'];
    let pairs = buildSpecialStructurePairs(fileNames.map(photoFromName));
    pairs = updateSpecialStructureInclusion(pairs, pairs[0].id, 'included');
    pairs = updateSpecialStructureInclusion(pairs, pairs[1].id, 'excluded');

    expect(findSpecialStructurePair(pairs, '出窓1.jpg')?.inclusionStatus).toBe('included');
    expect(findSpecialStructurePair(pairs, '出窓1-.jpg')?.inclusionStatus).toBe('included');
    expect(findSpecialStructurePair(pairs, '出窓2.jpg')?.inclusionStatus).toBe('excluded');
    expect(findSpecialStructurePair(pairs, '出窓2-.jpg')?.inclusionStatus).toBe('excluded');
  });

  it('DnD後もペアを隣接させ、表示番号と算入状態を維持する', () => {
    const photos = ['出窓1.jpg', '出窓1-.jpg', '出窓5.jpg', '出窓5-.jpg'].map(photoFromName);
    let pairs = buildSpecialStructurePairs(photos);
    pairs = updateSpecialStructureInclusion(pairs, pairs[0].id, 'included');
    const reorderedIds = keepSpecialStructurePairsAdjacent(
      ['出窓1.jpg', '出窓5.jpg', '出窓1-.jpg', '出窓5-.jpg'],
      pairs,
    );
    const rebuilt = buildSpecialStructurePairs(
      reorderedIds.map((id) => photos.find((photo) => photo.id === id)!),
      pairs,
    );

    expect(reorderedIds).toEqual(['出窓1.jpg', '出窓1-.jpg', '出窓5.jpg', '出窓5-.jpg']);
    expect(rebuilt.map((pair) => pair.displayNumber)).toEqual([1, 2]);
    expect(rebuilt[0].inclusionStatus).toBe('included');
  });

  it('ペアの表示番号と算入状態をキャプションへ反映する', () => {
    const photo = photoFromName('出窓1.jpg');
    const initialPairs = buildSpecialStructurePairs([photo]);
    const [pair] = updateSpecialStructureInclusion(
      initialPairs,
      initialPairs[0].id,
      'included',
    );
    expect(createCaption(photo, group, pair))
      .toBe('居宅 出窓1（算入）');
  });

  it.each([
    ['unset', '居宅 出窓1'],
    ['included', '居宅 出窓1（算入）'],
    ['excluded', '居宅 出窓1（不算入）'],
  ] as const)('算入状態%sのキャプションを生成する', (status, expectedCaption) => {
    const photo = photoFromName('出窓1-.jpg');
    const [pair] = buildSpecialStructurePairs([photo]);
    expect(createCaption(photo, group, { ...pair, inclusionStatus: status })).toBe(expectedCaption);
  });

  it('通常内観の既存キャプションを維持する', () => {
    expect(createCaption(photoFromName('1.jpg'), group)).toBe('居宅 内部');
  });

  it('特殊構造でも編集キャプションを写真単位で優先し、ペア相手へ影響させない', () => {
    const photos = ['出窓1.jpg', '出窓1-.jpg'].map(photoFromName);
    const initialPairs = buildSpecialStructurePairs(photos);
    const [pair] = updateSpecialStructureInclusion(
      initialPairs,
      initialPairs[0].id,
      'included',
    );
    const editedPhoto = { ...photos[0], customCaption: '居宅 出窓1（東側・算入）' };

    expect(resolvePhotoCaption(editedPhoto, createCaption(editedPhoto, group, pair)))
      .toBe('居宅 出窓1（東側・算入）');
    expect(resolvePhotoCaption(photos[1], createCaption(photos[1], group, pair)))
      .toBe('居宅 出窓1（算入）');
  });
});
