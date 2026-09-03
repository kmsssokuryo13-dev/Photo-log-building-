export type PhotoCategory = 'exterior' | 'interior' | 'unclassified';

export type PhotoKind = 'exterior' | 'standard-interior' | 'special-structure' | 'unclassified';

export type PhotoRotation = 0 | 90 | 180 | 270;

export type InclusionStatus = 'unset' | 'included' | 'excluded';

export type Photo = {
  id: string;
  url: string;
  originalFileName: string;
  category: PhotoCategory;
  kind: PhotoKind;
  number: number | null;
  exteriorOrder: number | null;
  buildingGroup: number | null;
  specialStructureName: string | null;
  isPairVariant: boolean;
  needsAttention: boolean;
  customCaption: string | null;
  rotation: PhotoRotation;
};

export type InteriorGroup = {
  id: string;
  buildingGroup: number | null;
  name: string;
  showInside: boolean;
  showInclusion: boolean;
  showExclusion: boolean;
  photoIds: string[];
};

export type SpecialStructurePair = {
  id: string;
  structureName: string;
  buildingGroup: number | null;
  sourceNumber: number;
  displayNumber: number;
  photoIds: string[];
  inclusionStatus: InclusionStatus;
};

export type PhotoWithCaption = Photo & { caption: string };
