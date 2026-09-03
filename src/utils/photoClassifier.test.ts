import { describe, expect, it } from 'vitest';
import type { Photo } from '../types/photo';
import {
  classifyPhotoFileName,
  compareExteriorPhotos,
  compareInteriorPhotos,
  createAutomaticGroups,
  createCaption,
  prioritizeAttentionPhotos,
  resolvePhotoCaption,
} from './photoClassifier';
import type { InteriorGroup } from '../types/photo';

const photoFromName = (fileName: string): Photo => ({
  id: fileName,
  url: '',
  originalFileName: fileName,
  rotation: 0,
  ...classifyPhotoFileName(fileName),
});

describe('classifyPhotoFileName', () => {
  it.each(['A.jpg', 'B.JPG', 'Z.jpeg', 'AA.jpg', 'AB.png'])(
    '%s を外観として判定する',
    (fileName) => expect(classifyPhotoFileName(fileName).category).toBe('exterior'),
  );

  it.each([
    ['1.jpg', 0], ['2.jpg', 0], ['9.jpg', 0],
    ['10.jpg', 1], ['19.jpg', 1], ['20.jpg', 2],
    ['29.jpg', 2], ['30.jpg', 3],
  ])('%s の所属建物を判定する', (fileName, buildingGroup) => {
    expect(classifyPhotoFileName(fileName)).toMatchObject({
      category: 'interior',
      kind: 'standard-interior',
      buildingGroup,
    });
  });

  it.each([
    ['吹抜1.jpg', '吹抜', 1, 0, false],
    ['吹抜1-.jpg', '吹抜', 1, 0, true],
    ['出窓1.jpg', '出窓', 1, 0, false],
    ['出窓1-.jpg', '出窓', 1, 0, true],
    ['吹抜20.jpg', '吹抜', 20, 2, false],
    ['吹抜20-.jpg', '吹抜', 20, 2, true],
    ['ロフト10.jpg', 'ロフト', 10, 1, false],
    ['階段室30-.jpg', '階段室', 30, 3, true],
  ])('%s を特殊構造として判定する', (
    fileName,
    specialStructureName,
    number,
    buildingGroup,
    isPairVariant,
  ) => {
    expect(classifyPhotoFileName(fileName)).toMatchObject({
      category: 'interior',
      kind: 'special-structure',
      specialStructureName,
      number,
      buildingGroup,
      isPairVariant,
    });
  });

  it.each(['IMG_0001.jpg', 'photo.jpg', '建物写真.jpg'])(
    '%s を未分類として判定する',
    (fileName) => expect(classifyPhotoFileName(fileName).category).toBe('unclassified'),
  );

  it.each(['吹抜.jpg', '出窓.jpg', 'ベランダ.jpg'])(
    '%s を要確認の未分類として判定する',
    (fileName) => expect(classifyPhotoFileName(fileName)).toMatchObject({
      category: 'unclassified',
      needsAttention: true,
    }),
  );

  it.each(['IMG_0001.jpg', 'photo.jpg'])(
    '%s は通常の未分類として扱う',
    (fileName) => expect(classifyPhotoFileName(fileName)).toMatchObject({
      category: 'unclassified',
      needsAttention: false,
    }),
  );

  it('外観写真は要確認にしない', () => {
    expect(classifyPhotoFileName('A.jpg')).toMatchObject({
      category: 'exterior',
      needsAttention: false,
    });
  });
});

describe('custom caption', () => {
  const mainGroup: InteriorGroup = {
    id: 'main',
    buildingGroup: 0,
    name: '居宅',
    showInside: true,
    showInclusion: false,
    showExclusion: false,
    photoIds: [],
  };

  const annexGroup: InteriorGroup = {
    ...mainGroup,
    id: 'annex',
    buildingGroup: 1,
    name: '車庫',
  };

  it('写真単位の編集キャプションを自動生成より優先する', () => {
    const photo = { ...photoFromName('1.jpg'), customCaption: '確認写真' };
    expect(resolvePhotoCaption(photo, createCaption(photo, mainGroup))).toBe('確認写真');
  });

  it('編集キャプションを解除すると自動生成へ戻る', () => {
    const photo = { ...photoFromName('1.jpg'), customCaption: null };
    expect(resolvePhotoCaption(photo, createCaption(photo, mainGroup))).toBe('居宅 内部');
  });

  it('グループ移動時は未編集だけ自動更新し、編集済みは維持する', () => {
    const automaticPhoto = photoFromName('1.jpg');
    const customPhoto = { ...automaticPhoto, customCaption: '現地確認' };
    expect(resolvePhotoCaption(automaticPhoto, createCaption(automaticPhoto, annexGroup)))
      .toBe('車庫 内部');
    expect(resolvePhotoCaption(customPhoto, createCaption(customPhoto, annexGroup)))
      .toBe('現地確認');
  });
});

describe('photo sort', () => {
  it('外観をExcel列順で並べる', () => {
    const names = ['AA.jpg', 'Z.jpg', 'B.jpg', 'AB.jpg', 'A.jpg'];
    expect(names.map(photoFromName).sort(compareExteriorPhotos).map((photo) => photo.originalFileName))
      .toEqual(['A.jpg', 'B.jpg', 'Z.jpg', 'AA.jpg', 'AB.jpg']);
  });

  it('通常内観の後に特殊構造を置き、ペアを隣接させる', () => {
    const names = ['吹抜1-.jpg', '10.jpg', '吹抜1.jpg', '2.jpg', '1.jpg'];
    expect(names.map(photoFromName).sort(compareInteriorPhotos).map((photo) => photo.originalFileName))
      .toEqual(['1.jpg', '2.jpg', '10.jpg', '吹抜1.jpg', '吹抜1-.jpg']);
  });

  it('建物単位で自動グループを生成し、通常写真の後に特殊構造を置く', () => {
    const photos = [
      '20.jpg', '吹抜1-.jpg', '10.jpg', '出窓1.jpg', '1.jpg',
      '吹抜20.jpg', '2.jpg', '吹抜1.jpg', '11.jpg', '21.jpg',
    ].map(photoFromName);
    const groups = createAutomaticGroups(photos);

    expect(groups.map((group) => group.buildingGroup)).toEqual([0, 1, 2]);
    expect(groups.map((group) => group.photoIds)).toEqual([
      ['1.jpg', '2.jpg', '出窓1.jpg', '吹抜1.jpg', '吹抜1-.jpg'],
      ['10.jpg', '11.jpg'],
      ['20.jpg', '21.jpg', '吹抜20.jpg'],
    ]);
  });

  it('要確認写真を先頭へ移し、各区分内の順序を維持する', () => {
    const names = ['IMG_0001.jpg', '吹抜.jpg', 'DSC_0002.jpg', '出窓.jpg', 'photo.jpg'];
    expect(prioritizeAttentionPhotos(names.map(photoFromName))
      .map((photo) => photo.originalFileName))
      .toEqual(['吹抜.jpg', '出窓.jpg', 'IMG_0001.jpg', 'DSC_0002.jpg', 'photo.jpg']);
  });
});
