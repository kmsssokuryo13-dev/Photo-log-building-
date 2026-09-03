import type { InclusionStatus, Photo, SpecialStructurePair } from '../types/photo';
import { compareBuildingGroups } from './photoClassifier';

const getPairSourceKey = (
  buildingGroup: number | null,
  structureName: string,
  sourceNumber: number,
) => `${buildingGroup ?? 'none'}\u0000${structureName}\u0000${sourceNumber}`;

const getSeriesKey = (pair: Pick<SpecialStructurePair, 'buildingGroup' | 'structureName'>) => (
  `${pair.buildingGroup ?? 'none'}\u0000${pair.structureName}`
);

export const findSpecialStructurePair = (
  pairs: SpecialStructurePair[],
  photoId: string,
) => pairs.find((pair) => pair.photoIds.includes(photoId));

export const getSpecialStructureLabel = (pair: SpecialStructurePair) => (
  `${pair.structureName}${pair.displayNumber}`
);

export const buildSpecialStructurePairs = (
  photos: Photo[],
  existingPairs: SpecialStructurePair[] = [],
) => {
  const photoMap = new Map(photos.map((photo) => [photo.id, photo]));
  const buckets = new Map<string, Photo[]>();

  photos
    .filter((photo) => (
      photo.kind === 'special-structure'
      && photo.specialStructureName !== null
      && photo.number !== null
    ))
    .forEach((photo) => {
      const key = getPairSourceKey(photo.buildingGroup, photo.specialStructureName!, photo.number!);
      const items = buckets.get(key) ?? [];
      items.push(photo);
      buckets.set(key, items);
    });

  const pairs = [...buckets.values()].map((items): SpecialStructurePair => {
    const first = items[0];
    const matchedPair = existingPairs.find((pair) => (
      pair.photoIds.some((id) => items.some((photo) => photo.id === id))
      || (
        pair.buildingGroup === first.buildingGroup
        && pair.structureName === first.specialStructureName
        && pair.sourceNumber === first.number
      )
    ));
    const photoIds = items
      .map((photo) => photo.id)
      .sort((leftId, rightId) => (
        Number(photoMap.get(leftId)?.isPairVariant) - Number(photoMap.get(rightId)?.isPairVariant)
      ));

    return {
      id: matchedPair?.id ?? crypto.randomUUID(),
      structureName: first.specialStructureName!,
      buildingGroup: first.buildingGroup,
      sourceNumber: first.number!,
      displayNumber: 0,
      photoIds,
      inclusionStatus: matchedPair?.inclusionStatus ?? 'unset',
    };
  });

  pairs.sort((left, right) => (
    compareBuildingGroups(left.buildingGroup, right.buildingGroup)
    || left.structureName.localeCompare(right.structureName, 'ja', { numeric: true })
    || left.sourceNumber - right.sourceNumber
  ));

  const nextDisplayNumber = new Map<string, number>();
  return pairs.map((pair) => {
    const seriesKey = getSeriesKey(pair);
    const displayNumber = (nextDisplayNumber.get(seriesKey) ?? 0) + 1;
    nextDisplayNumber.set(seriesKey, displayNumber);
    return { ...pair, displayNumber };
  });
};

export const updateSpecialStructureInclusion = (
  pairs: SpecialStructurePair[],
  pairId: string,
  inclusionStatus: InclusionStatus,
) => pairs.map((pair) => pair.id === pairId ? { ...pair, inclusionStatus } : pair);

export const keepSpecialStructurePairsAdjacent = (
  photoIds: string[],
  pairs: SpecialStructurePair[],
) => {
  const pairByPhotoId = new Map<string, SpecialStructurePair>();
  pairs.forEach((pair) => pair.photoIds.forEach((id) => pairByPhotoId.set(id, pair)));
  const emittedPairs = new Set<string>();
  const result: string[] = [];

  photoIds.forEach((photoId) => {
    const pair = pairByPhotoId.get(photoId);
    if (!pair) {
      result.push(photoId);
      return;
    }
    if (emittedPairs.has(pair.id)) return;
    emittedPairs.add(pair.id);
    result.push(...pair.photoIds.filter((id) => photoIds.includes(id)));
  });

  return result;
};
