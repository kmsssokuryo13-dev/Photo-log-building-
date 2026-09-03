import type {
  InteriorGroup,
  Photo,
  PhotoCategory,
  PhotoKind,
  SpecialStructurePair,
} from '../types/photo';

export type PhotoClassification = {
  category: PhotoCategory;
  kind: PhotoKind;
  number: number | null;
  exteriorOrder: number | null;
  buildingGroup: number | null;
  specialStructureName: string | null;
  isPairVariant: boolean;
  needsAttention: boolean;
  customCaption: string | null;
};

const emptyClassification: PhotoClassification = {
  category: 'unclassified',
  kind: 'unclassified',
  number: null,
  exteriorOrder: null,
  buildingGroup: null,
  specialStructureName: null,
  isPairVariant: false,
  needsAttention: false,
  customCaption: null,
};

export const getFileStem = (fileName: string) => {
  const baseName = fileName.split(/[\\/]/).pop() ?? fileName;
  return baseName.replace(/\.[^.]+$/, '');
};

export const alphabetToNumber = (value: string) => {
  return value.toUpperCase().split('').reduce((total, character) => (
    total * 26 + character.charCodeAt(0) - 64
  ), 0);
};

export const getBuildingGroup = (number: number) => {
  if (number >= 1 && number <= 9) return 0;
  if (number >= 10) return Math.floor(number / 10);
  return null;
};

export const classifyPhotoFileName = (fileName: string): PhotoClassification => {
  const stem = getFileStem(fileName).trim();

  // 現場で使う方向ラベル（A〜ZZZ）に限定し、photo などの一般名を誤認しない。
  if (/^[a-z]{1,3}$/i.test(stem)) {
    return {
      ...emptyClassification,
      category: 'exterior',
      kind: 'exterior',
      exteriorOrder: alphabetToNumber(stem),
    };
  }

  if (/^\d+$/.test(stem)) {
    const number = Number.parseInt(stem, 10);
    return {
      ...emptyClassification,
      category: 'interior',
      kind: 'standard-interior',
      number,
      buildingGroup: getBuildingGroup(number),
    };
  }

  // Unicodeの「文字」だけで構成された名称に、番号と任意の末尾「-」が続く形式。
  // IMG_0001 のようなカメラ由来の一般名は特殊構造として誤認しない。
  const specialMatch = stem.match(/^(\p{L}+?)(\d+)(-?)$/u);
  if (specialMatch) {
    const [, specialStructureName, numberText, pairMarker] = specialMatch;
    const number = Number.parseInt(numberText, 10);
    return {
      ...emptyClassification,
      category: 'interior',
      kind: 'special-structure',
      number,
      buildingGroup: getBuildingGroup(number),
      specialStructureName,
      isPairVariant: pairMarker === '-',
    };
  }

  // 日本語などの文字だけで番号がない名称は所属建物を確定できないため、
  // 自動分類せず未分類のまま確認対象として示す。ASCII英字だけの一般名は除外する。
  const isLettersOnly = /^\p{L}+$/u.test(stem);
  const containsNonAsciiLetter = /[^A-Za-z]/.test(stem);
  if (isLettersOnly && containsNonAsciiLetter) {
    return { ...emptyClassification, needsAttention: true };
  }

  return { ...emptyClassification };
};

export const compareExteriorPhotos = (left: Photo, right: Photo) => {
  const orderDifference = (left.exteriorOrder ?? Number.MAX_SAFE_INTEGER)
    - (right.exteriorOrder ?? Number.MAX_SAFE_INTEGER);
  return orderDifference || left.originalFileName.localeCompare(right.originalFileName, 'ja', { numeric: true });
};

export const compareInteriorPhotos = (left: Photo, right: Photo) => {
  const leftKindOrder = left.kind === 'standard-interior' ? 0 : 1;
  const rightKindOrder = right.kind === 'standard-interior' ? 0 : 1;
  if (leftKindOrder !== rightKindOrder) return leftKindOrder - rightKindOrder;

  if (left.kind === 'standard-interior') {
    return (left.number ?? Number.MAX_SAFE_INTEGER) - (right.number ?? Number.MAX_SAFE_INTEGER);
  }

  const nameDifference = (left.specialStructureName ?? '').localeCompare(
    right.specialStructureName ?? '',
    'ja',
    { numeric: true },
  );
  if (nameDifference !== 0) return nameDifference;

  const numberDifference = (left.number ?? Number.MAX_SAFE_INTEGER)
    - (right.number ?? Number.MAX_SAFE_INTEGER);
  if (numberDifference !== 0) return numberDifference;

  return Number(left.isPairVariant) - Number(right.isPairVariant);
};

export const compareBuildingGroups = (left: number | null, right: number | null) => {
  return (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER);
};

export const prioritizeAttentionPhotos = (photos: Photo[]) => [
  ...photos.filter((photo) => photo.needsAttention),
  ...photos.filter((photo) => !photo.needsAttention),
];

export const getBuildingGroupLabel = (buildingGroup: number | null) => {
  if (buildingGroup === 0) return '主である建物';
  if (buildingGroup !== null) return `附属建物 符号${buildingGroup}`;
  return '所属未設定';
};

export const getDefaultGroupName = (buildingGroup: number | null) => {
  if (buildingGroup === 0) return '居宅';
  if (buildingGroup !== null) return `附属建物 符号${buildingGroup}`;
  return '新グループ';
};

export const createInteriorGroup = (
  buildingGroup: number | null,
  photoIds: string[] = [],
): InteriorGroup => ({
  id: crypto.randomUUID(),
  buildingGroup,
  name: getDefaultGroupName(buildingGroup),
  showInside: true,
  showInclusion: false,
  showExclusion: false,
  photoIds,
});

export const createAutomaticGroups = (photos: Photo[]) => {
  const grouped = new Map<number | null, Photo[]>();
  photos.forEach((photo) => {
    const items = grouped.get(photo.buildingGroup) ?? [];
    items.push(photo);
    grouped.set(photo.buildingGroup, items);
  });

  return [...grouped.entries()]
    .sort(([left], [right]) => compareBuildingGroups(left, right))
    .map(([buildingGroup, items]) => createInteriorGroup(
      buildingGroup,
      [...items].sort(compareInteriorPhotos).map((photo) => photo.id),
    ));
};

export const createCaption = (
  photo: Photo,
  group: InteriorGroup,
  specialPair?: SpecialStructurePair,
) => {
  const isSpecialStructure = photo.kind === 'special-structure';
  const subject = isSpecialStructure
    ? `${photo.specialStructureName ?? '内部'}${specialPair?.displayNumber ?? ''}`
    : group.showInside ? '内部' : '';
  const inclusion = isSpecialStructure
    ? specialPair?.inclusionStatus === 'included' ? '（算入）'
      : specialPair?.inclusionStatus === 'excluded' ? '（不算入）' : ''
    : `${group.showInclusion ? '（算入）' : ''}${group.showExclusion ? '（不算入）' : ''}`;
  return [group.name, subject].filter(Boolean).join(' ') + inclusion;
};

export const resolvePhotoCaption = (photo: Photo, generatedCaption: string) => (
  photo.customCaption?.trim() || generatedCaption
);
