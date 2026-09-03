import { useMemo, useState } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import {
  ArrowDown,
  ArrowUp,
  Download,
  Image as ImageIcon,
  Merge,
  Plus,
  Settings,
  UploadCloud,
  X,
} from 'lucide-react';
import SortablePhotoItem from './components/SortablePhotoItem';
import type {
  InclusionStatus,
  InteriorGroup,
  Photo,
  PhotoCategory,
  PhotoWithCaption,
  SpecialStructurePair,
} from './types/photo';
import { compressImage, getNextRotation } from './utils/imageProcessing';
import {
  classifyPhotoFileName,
  compareExteriorPhotos,
  compareInteriorPhotos,
  createAutomaticGroups,
  createCaption,
  createInteriorGroup,
  getBuildingGroupLabel,
  prioritizeAttentionPhotos,
  resolvePhotoCaption,
} from './utils/photoClassifier';
import {
  buildSpecialStructurePairs,
  findSpecialStructurePair,
  getSpecialStructureLabel,
  keepSpecialStructurePairsAdjacent,
  updateSpecialStructureInclusion,
} from './utils/specialStructure';

const getAlphabet = (index: number) => {
  let result = '';
  let current = index;
  while (current >= 0) {
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26) - 1;
  }
  return result;
};

const getPhotoById = (photos: Photo[]) => new Map(photos.map((photo) => [photo.id, photo]));

const sortGroupPhotoIds = (photoIds: string[], photos: Photo[]) => {
  const photoMap = getPhotoById(photos);
  return photoIds
    .filter((id) => photoMap.has(id))
    .sort((leftId, rightId) => compareInteriorPhotos(photoMap.get(leftId)!, photoMap.get(rightId)!));
};

const assignNewPhotosToGroups = (
  currentGroups: InteriorGroup[],
  newPhotos: Photo[],
  allInteriorPhotos: Photo[],
) => {
  if (currentGroups.length === 0) return createAutomaticGroups(allInteriorPhotos);

  const nextGroups = currentGroups.map((group) => ({ ...group, photoIds: [...group.photoIds] }));
  newPhotos.forEach((photo) => {
    let target = nextGroups.find((group) => group.buildingGroup === photo.buildingGroup);
    if (!target) {
      target = createInteriorGroup(photo.buildingGroup);
      nextGroups.push(target);
    }
    target.photoIds.push(photo.id);
  });

  return nextGroups.map((group) => ({
    ...group,
    photoIds: sortGroupPhotoIds(group.photoIds, allInteriorPhotos),
  }));
};

const toManualInteriorPhoto = (photo: Photo): Photo => ({
  ...photo,
  category: 'interior',
  kind: photo.kind === 'special-structure' ? photo.kind : 'standard-interior',
  exteriorOrder: null,
  buildingGroup: photo.buildingGroup ?? 0,
  needsAttention: false,
});

const toManualExteriorPhoto = (photo: Photo): Photo => ({
  ...photo,
  category: 'exterior',
  kind: 'exterior',
  exteriorOrder: photo.exteriorOrder,
  buildingGroup: null,
  specialStructureName: null,
  isPairVariant: false,
  needsAttention: false,
});

export default function App() {
  const [exteriorPhotos, setExteriorPhotos] = useState<Photo[]>([]);
  const [interiorPhotos, setInteriorPhotos] = useState<Photo[]>([]);
  const [unclassifiedPhotos, setUnclassifiedPhotos] = useState<Photo[]>([]);
  const [groups, setGroups] = useState<InteriorGroup[]>([]);
  const [specialStructurePairs, setSpecialStructurePairs] = useState<SpecialStructurePair[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const exteriorData = useMemo<PhotoWithCaption[]>(() => (
    exteriorPhotos.map((photo, index) => ({
      ...photo,
      caption: resolvePhotoCaption(photo, `方向 ${getAlphabet(index)}`),
    }))
  ), [exteriorPhotos]);

  const groupedInteriorData = useMemo(() => {
    const photoMap = getPhotoById(interiorPhotos);
    const pairByPhotoId = new Map<string, SpecialStructurePair>();
    specialStructurePairs.forEach((pair) => (
      pair.photoIds.forEach((photoId) => pairByPhotoId.set(photoId, pair))
    ));
    return groups.map((group) => ({
      group,
      specialPairs: specialStructurePairs.filter((pair) => (
        pair.photoIds.some((photoId) => group.photoIds.includes(photoId))
      )),
      photos: group.photoIds
        .map((id) => photoMap.get(id))
        .filter((photo): photo is Photo => Boolean(photo))
        .map((photo) => {
          const generatedCaption = createCaption(photo, group, pairByPhotoId.get(photo.id));
          return { ...photo, caption: resolvePhotoCaption(photo, generatedCaption) };
        }),
    }));
  }, [groups, interiorPhotos, specialStructurePairs]);

  const interiorData = useMemo<PhotoWithCaption[]>(() => (
    groupedInteriorData.flatMap(({ photos }) => photos)
  ), [groupedInteriorData]);

  const totalPhotoCount = exteriorPhotos.length + interiorPhotos.length + unclassifiedPhotos.length;

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelected = (ids: string[]) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const handleAddPhotos = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setProcessingMessage('写真を分類・処理しています...');
    try {
      const newPhotos = await Promise.all(files.map(async (file): Promise<Photo> => ({
        id: crypto.randomUUID(),
        url: await compressImage(file),
        originalFileName: file.name,
        rotation: 0,
        ...classifyPhotoFileName(file.name),
      })));
      const newExterior = newPhotos.filter((photo) => photo.category === 'exterior');
      const newInterior = newPhotos.filter((photo) => photo.category === 'interior');
      const newUnclassified = newPhotos.filter((photo) => photo.category === 'unclassified');
      const allInterior = [...interiorPhotos, ...newInterior];

      setExteriorPhotos((current) => [...current, ...newExterior].sort(compareExteriorPhotos));
      setInteriorPhotos(allInterior);
      setUnclassifiedPhotos((current) => prioritizeAttentionPhotos([
        ...current,
        ...newUnclassified,
      ]));
      setGroups((current) => assignNewPhotosToGroups(current, newInterior, allInterior));
      setSpecialStructurePairs((current) => buildSpecialStructurePairs(allInterior, current));
    } catch (error) {
      console.error('画像の処理中にエラーが発生しました:', error);
      window.alert('画像の読み込みに失敗しました。');
    } finally {
      setProcessingMessage(null);
      event.target.value = '';
    }
  };

  const updatePhoto = (id: string, updater: (photo: Photo) => Photo) => {
    const updateList = (photos: Photo[]) => photos.map((photo) => photo.id === id ? updater(photo) : photo);
    setExteriorPhotos(updateList);
    setInteriorPhotos(updateList);
    setUnclassifiedPhotos(updateList);
  };

  const handleRotatePhoto = (id: string) => {
    updatePhoto(id, (photo) => ({ ...photo, rotation: getNextRotation(photo.rotation) }));
  };

  const handleChangeCaption = (id: string, customCaption: string | null) => {
    updatePhoto(id, (photo) => ({ ...photo, customCaption }));
  };

  const handleRemovePhoto = (id: string, category: PhotoCategory) => {
    if (category === 'exterior') setExteriorPhotos((current) => current.filter((photo) => photo.id !== id));
    if (category === 'interior') {
      const nextInteriorPhotos = interiorPhotos.filter((photo) => photo.id !== id);
      setInteriorPhotos(nextInteriorPhotos);
      setSpecialStructurePairs((current) => buildSpecialStructurePairs(nextInteriorPhotos, current));
      setGroups((current) => current.map((group) => ({
        ...group,
        photoIds: group.photoIds.filter((photoId) => photoId !== id),
      })));
    }
    if (category === 'unclassified') {
      setUnclassifiedPhotos((current) => current.filter((photo) => photo.id !== id));
    }
    clearSelected([id]);
  };

  const movePhotosToInterior = (source: 'exterior' | 'unclassified') => {
    const sourcePhotos = source === 'exterior' ? exteriorPhotos : unclassifiedPhotos;
    const photosToMove = sourcePhotos.filter((photo) => selectedIds.has(photo.id)).map(toManualInteriorPhoto);
    if (photosToMove.length === 0) return;
    const movedIds = new Set(photosToMove.map((photo) => photo.id));
    const allInterior = [...interiorPhotos, ...photosToMove];

    if (source === 'exterior') setExteriorPhotos((current) => current.filter((photo) => !movedIds.has(photo.id)));
    else setUnclassifiedPhotos((current) => current.filter((photo) => !movedIds.has(photo.id)));
    setInteriorPhotos(allInterior);
    setGroups((current) => assignNewPhotosToGroups(current, photosToMove, allInterior));
    setSpecialStructurePairs((current) => buildSpecialStructurePairs(allInterior, current));
    clearSelected([...movedIds]);
  };

  const moveSelectedInteriorToExterior = () => {
    const photosToMove = interiorPhotos.filter((photo) => selectedIds.has(photo.id)).map(toManualExteriorPhoto);
    if (photosToMove.length === 0) return;
    const movedIds = new Set(photosToMove.map((photo) => photo.id));
    const nextInteriorPhotos = interiorPhotos.filter((photo) => !movedIds.has(photo.id));
    setInteriorPhotos(nextInteriorPhotos);
    setSpecialStructurePairs((current) => buildSpecialStructurePairs(nextInteriorPhotos, current));
    setExteriorPhotos((current) => [...current, ...photosToMove].sort(compareExteriorPhotos));
    setGroups((current) => current.map((group) => ({
      ...group,
      photoIds: group.photoIds.filter((id) => !movedIds.has(id)),
    })));
    clearSelected([...movedIds]);
  };

  const moveSelectedUnclassifiedToExterior = () => {
    const photosToMove = unclassifiedPhotos
      .filter((photo) => selectedIds.has(photo.id))
      .map(toManualExteriorPhoto);
    if (photosToMove.length === 0) return;
    const movedIds = new Set(photosToMove.map((photo) => photo.id));
    setUnclassifiedPhotos((current) => current.filter((photo) => !movedIds.has(photo.id)));
    setExteriorPhotos((current) => [...current, ...photosToMove].sort(compareExteriorPhotos));
    clearSelected([...movedIds]);
  };

  const handleListDragEnd = (
    event: DragEndEvent,
    photos: Photo[],
    setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>,
  ) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = photos.findIndex((photo) => photo.id === active.id);
    const newIndex = photos.findIndex((photo) => photo.id === over.id);
    if (oldIndex >= 0 && newIndex >= 0) setPhotos(arrayMove(photos, oldIndex, newIndex));
  };

  const handleGroupDragEnd = (event: DragEndEvent, groupId: string) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      const oldIndex = group.photoIds.indexOf(String(active.id));
      const newIndex = group.photoIds.indexOf(String(over.id));
      return oldIndex >= 0 && newIndex >= 0
        ? {
            ...group,
            photoIds: keepSpecialStructurePairsAdjacent(
              arrayMove(group.photoIds, oldIndex, newIndex),
              specialStructurePairs,
            ),
          }
        : group;
    }));
  };

  const handleUnclassifiedDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setUnclassifiedPhotos((current) => {
      const oldIndex = current.findIndex((photo) => photo.id === active.id);
      const newIndex = current.findIndex((photo) => photo.id === over.id);
      return oldIndex >= 0 && newIndex >= 0
        ? prioritizeAttentionPhotos(arrayMove(current, oldIndex, newIndex))
        : current;
    });
  };

  const updateGroup = (
    id: string,
    field: 'name' | 'showInside' | 'showInclusion' | 'showExclusion',
    value: string | boolean,
  ) => {
    setGroups((current) => current.map((group) => group.id === id
      ? { ...group, [field]: value }
      : group));
  };

  const addGroup = () => setGroups((current) => [...current, createInteriorGroup(null)]);

  const removeGroup = (index: number) => {
    const group = groups[index];
    if (!group || (groups.length === 1 && group.photoIds.length > 0)) return;
    if (group.photoIds.length === 0) {
      setGroups((current) => current.filter((_, itemIndex) => itemIndex !== index));
      return;
    }

    const targetIndex = index > 0 ? index - 1 : index + 1;
    const targetGroup = groups[targetIndex];
    if (!targetGroup) return;
    const movingIdSet = new Set(group.photoIds);
    setGroups((current) => current
      .map((item, itemIndex) => itemIndex === targetIndex
        ? { ...item, photoIds: [...item.photoIds, ...group.photoIds] }
        : item)
      .filter((_, itemIndex) => itemIndex !== index));
    const nextInteriorPhotos = interiorPhotos.map((photo) => movingIdSet.has(photo.id)
      ? { ...photo, buildingGroup: targetGroup.buildingGroup }
      : photo);
    setInteriorPhotos(nextInteriorPhotos);
    setSpecialStructurePairs((current) => buildSpecialStructurePairs(nextInteriorPhotos, current));
  };

  const movePhotoToGroup = (photoId: string, targetGroupId: string) => {
    const targetGroup = groups.find((group) => group.id === targetGroupId);
    if (!targetGroup) return;
    const specialPair = findSpecialStructurePair(specialStructurePairs, photoId);
    const movingPhotoIds = specialPair?.photoIds ?? [photoId];
    const movingIdSet = new Set(movingPhotoIds);
    setGroups((current) => current.map((group) => ({
      ...group,
      photoIds: group.id === targetGroupId
        ? [...group.photoIds.filter((id) => !movingIdSet.has(id)), ...movingPhotoIds]
        : group.photoIds.filter((id) => !movingIdSet.has(id)),
    })));
    const nextInteriorPhotos = interiorPhotos.map((photo) => movingIdSet.has(photo.id)
      ? { ...photo, buildingGroup: targetGroup.buildingGroup }
      : photo);
    setInteriorPhotos(nextInteriorPhotos);
    setSpecialStructurePairs((current) => buildSpecialStructurePairs(nextInteriorPhotos, current));
  };

  const updatePairInclusion = (pairId: string, inclusionStatus: InclusionStatus) => {
    setSpecialStructurePairs((current) => (
      updateSpecialStructureInclusion(current, pairId, inclusionStatus)
    ));
  };

  const splitGroupAtPhoto = (groupId: string, photoId: string) => {
    setGroups((current) => {
      const index = current.findIndex((group) => group.id === groupId);
      if (index < 0) return current;
      const group = current[index];
      const splitIndex = group.photoIds.indexOf(photoId);
      if (splitIndex <= 0) return current;
      const newGroup: InteriorGroup = {
        ...createInteriorGroup(group.buildingGroup, group.photoIds.slice(splitIndex)),
        name: `${group.name} 2`,
        showInside: group.showInside,
        showInclusion: group.showInclusion,
        showExclusion: group.showExclusion,
      };
      const next = [...current];
      next[index] = { ...group, photoIds: group.photoIds.slice(0, splitIndex) };
      next.splice(index + 1, 0, newGroup);
      return next;
    });
  };

  const mergeWithPreviousGroup = (index: number) => {
    if (index <= 0) return;
    const previous = groups[index - 1];
    const target = groups[index];
    if (!previous || !target) return;
    const nextGroups = [...groups];
    nextGroups[index - 1] = { ...previous, photoIds: [...previous.photoIds, ...target.photoIds] };
    nextGroups.splice(index, 1);
    setGroups(nextGroups);
    const movingIdSet = new Set(target.photoIds);
    const nextInteriorPhotos = interiorPhotos.map((photo) => movingIdSet.has(photo.id)
      ? { ...photo, buildingGroup: previous.buildingGroup }
      : photo);
    setInteriorPhotos(nextInteriorPhotos);
    setSpecialStructurePairs((current) => buildSpecialStructurePairs(nextInteriorPhotos, current));
  };

  const handleGeneratePdf = async () => {
    if (exteriorData.length === 0 && interiorData.length === 0) return;
    setProcessingMessage('写真.pdfを生成しています...');
    try {
      const { downloadPhotoPdf } = await import('./utils/pdfGenerator');
      await downloadPhotoPdf(exteriorData, interiorData);
    } catch (error) {
      console.error('PDFの生成中にエラーが発生しました:', error);
      window.alert('PDFの生成に失敗しました。');
    } finally {
      setProcessingMessage(null);
    }
  };

  const renderPhotoGrid = (
    photos: PhotoWithCaption[],
    category: PhotoCategory,
    onDragEnd: (event: DragEndEvent) => void,
    footer?: (photo: PhotoWithCaption, index: number) => React.ReactNode,
    boundaryControl?: (photo: PhotoWithCaption, index: number) => React.ReactNode,
    nearbyControl?: (photo: PhotoWithCaption, index: number) => React.ReactNode,
  ) => (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={photos.map((photo) => photo.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {photos.map((photo, index) => (
            <div key={photo.id} className="min-w-0">
              {boundaryControl && (
                <div className="h-7 flex items-center justify-center">
                  {boundaryControl(photo, index)}
                </div>
              )}
              <SortablePhotoItem
                id={photo.id}
                url={photo.url}
                caption={photo.caption}
                fileName={photo.originalFileName}
                rotation={photo.rotation}
                needsAttention={photo.needsAttention}
                isCustomCaption={photo.customCaption !== null}
                onRemove={(id) => handleRemovePhoto(id, category)}
                isSelected={selectedIds.has(photo.id)}
                onToggleSelect={toggleSelection}
                onRotate={handleRotatePhoto}
                onChangeCaption={handleChangeCaption}
                footer={footer?.(photo, index)}
              />
              {nearbyControl?.(photo, index)}
            </div>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800">
          <ImageIcon className="text-blue-600" />
          建物登記 写真台帳作成
        </h1>
        <div className="flex items-center gap-3">
          <label className="cursor-pointer flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-slate-700 px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm">
            <UploadCloud size={17} />
            写真を追加
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={handleAddPhotos}
              disabled={Boolean(processingMessage)}
            />
          </label>
          {(exteriorPhotos.length > 0 || interiorPhotos.length > 0) && (
            <button
              type="button"
              onClick={handleGeneratePdf}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors shadow-sm"
            >
              <Download size={18} />
              PDFを出力
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 flex flex-col lg:flex-row gap-8 items-start">
        <aside className="w-full lg:w-80 bg-white border border-gray-200 rounded-xl shadow-sm p-5 shrink-0 lg:sticky lg:top-24">
          <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-3">
            <Settings size={20} className="text-slate-500" />
            <h2 className="text-lg font-bold text-slate-800">内観グループ設定</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            ファイル名から初期分類します。名前・表示内容・写真の所属は自由に修正できます。
          </p>

          <div className="space-y-3 mb-4">
            {groups.map((group, index) => (
              <div key={group.id}>
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => mergeWithPreviousGroup(index)}
                    className="w-full mb-2 flex items-center justify-center gap-1 py-1 text-xs text-slate-500 hover:text-blue-600"
                  >
                    <Merge size={13} /> 上のグループと結合
                  </button>
                )}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg relative group/item">
                  <button
                    type="button"
                    onClick={() => removeGroup(index)}
                    disabled={groups.length === 1 && group.photoIds.length > 0}
                    className="absolute -top-2 -right-2 bg-red-100 text-red-600 hover:bg-red-500 hover:text-white rounded-full p-1 opacity-0 group-hover/item:opacity-100 transition-opacity disabled:hidden"
                    title="グループを削除（写真は隣のグループへ移動）"
                  >
                    <X size={14} />
                  </button>
                  <div className="flex items-center justify-between mb-2 text-xs text-slate-500">
                    <span>{getBuildingGroupLabel(group.buildingGroup)}</span>
                    <span>{group.photoIds.length}枚</span>
                  </div>
                  <input
                    type="text"
                    value={group.name}
                    onChange={(event) => updateGroup(group.id, 'name', event.target.value)}
                    placeholder="グループ名（例: 居宅）"
                    className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none mb-2"
                  />
                  <div className="mb-1 text-[10px] text-slate-400">通常内観写真の表示</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <label className="flex items-center gap-1 cursor-pointer hover:text-slate-900">
                      <input
                        type="checkbox"
                        checked={group.showInside}
                        onChange={(event) => updateGroup(group.id, 'showInside', event.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      内部
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer hover:text-slate-900">
                      <input
                        type="checkbox"
                        checked={group.showInclusion}
                        onChange={(event) => updateGroup(group.id, 'showInclusion', event.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      （算入）
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer hover:text-slate-900">
                      <input
                        type="checkbox"
                        checked={group.showExclusion}
                        onChange={(event) => updateGroup(group.id, 'showExclusion', event.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      （不算入）
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addGroup}
            className="w-full flex items-center justify-center gap-1 py-2 border-2 border-dashed border-slate-300 text-slate-600 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors text-sm font-medium"
          >
            <Plus size={16} /> グループを追加
          </button>
        </aside>

        <div className="flex-1 w-full space-y-10">
          {totalPhotoCount === 0 && (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-500">
              <ImageIcon className="mx-auto mb-3 opacity-50" size={36} />
              <p className="font-medium text-slate-700">写真をまとめて追加してください</p>
              <p className="mt-1 text-sm">ファイル名から外観・内観・所属建物を自動判定します。</p>
            </div>
          )}

          {exteriorData.length > 0 && (
            <section>
              <div className="flex items-center gap-4 mb-4 border-b border-gray-200 pb-2">
                <h2 className="text-xl font-bold text-slate-800">外観写真</h2>
                {exteriorPhotos.some((photo) => selectedIds.has(photo.id)) && (
                  <button
                    type="button"
                    onClick={() => movePhotosToInterior('exterior')}
                    className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-md text-sm font-medium"
                  >
                    <ArrowDown size={16} /> 内観に移動
                  </button>
                )}
              </div>
              {renderPhotoGrid(
                exteriorData,
                'exterior',
                (event) => handleListDragEnd(event, exteriorPhotos, setExteriorPhotos),
              )}
            </section>
          )}

          {groupedInteriorData.some(({ photos }) => photos.length > 0) && (
            <section>
              <div className="flex items-center gap-4 mb-4 border-b border-gray-200 pb-2">
                <h2 className="text-xl font-bold text-slate-800">内観写真</h2>
                {interiorPhotos.some((photo) => selectedIds.has(photo.id)) && (
                  <button
                    type="button"
                    onClick={moveSelectedInteriorToExterior}
                    className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-md text-sm font-medium"
                  >
                    <ArrowUp size={16} /> 外観に移動
                  </button>
                )}
              </div>
              <div className="space-y-8">
                {groupedInteriorData.map(({ group, photos, specialPairs }) => photos.length > 0 && (
                  <div key={group.id}>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-semibold text-slate-700">
                        {getBuildingGroupLabel(group.buildingGroup)}
                        <span className="ml-2 text-sm font-normal text-slate-500">{group.name}</span>
                      </h3>
                      <span className="text-xs text-slate-500">{photos.length}枚</span>
                    </div>
                    {renderPhotoGrid(
                      photos,
                      'interior',
                      (event) => handleGroupDragEnd(event, group.id),
                      (photo) => (
                        <div>
                          <select
                            value={group.id}
                            onChange={(event) => movePhotoToGroup(photo.id, event.target.value)}
                            className="w-full text-[11px] px-1.5 py-0.5 border border-slate-200 rounded bg-white text-slate-600"
                            aria-label={`${photo.originalFileName}の所属グループ`}
                          >
                            {groups.map((option) => (
                              <option key={option.id} value={option.id}>{option.name}</option>
                            ))}
                          </select>
                        </div>
                      ),
                      (photo, index) => {
                        const pair = findSpecialStructurePair(specialPairs, photo.id);
                        const canSplitBefore = index > 0 && (!pair || pair.photoIds[0] === photo.id);
                        return canSplitBefore ? (
                          <button
                            type="button"
                            onClick={() => splitGroupAtPhoto(group.id, photo.id)}
                            className="rounded-full border border-dashed border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] leading-4 text-blue-600 hover:border-blue-300 hover:bg-blue-50"
                          >
                            ここから別グループ
                          </button>
                        ) : null;
                      },
                      (photo) => {
                        const pair = findSpecialStructurePair(specialPairs, photo.id);
                        if (!pair || pair.photoIds.at(-1) !== photo.id) return null;
                        const label = getSpecialStructureLabel(pair);
                        const options: { value: InclusionStatus; label: string }[] = [
                          { value: 'unset', label: '未設定' },
                          { value: 'included', label: '算入' },
                          { value: 'excluded', label: '不算入' },
                        ];
                        return (
                          <fieldset className="mt-2 rounded-lg border border-blue-100 bg-blue-50/60 px-2 py-1.5">
                            <legend className="px-1 text-[10px] font-medium text-slate-600">
                              {label}の算入設定{pair.photoIds.length > 1 ? '（2枚共通）' : ''}
                            </legend>
                            <div className="grid grid-cols-3 gap-1" role="group" aria-label={`${label}の算入状態`}>
                              {options.map((option) => {
                                const isActive = pair.inclusionStatus === option.value;
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => updatePairInclusion(pair.id, option.value)}
                                    aria-pressed={isActive}
                                    className={`rounded border px-1 py-1 text-[10px] font-medium transition-colors ${
                                      isActive
                                        ? 'border-blue-500 bg-blue-600 text-white'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700'
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                          </fieldset>
                        );
                      },
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {unclassifiedPhotos.length > 0 && (
            <section className="bg-amber-50/60 border border-amber-200 rounded-xl p-5">
              <div className="flex flex-wrap items-center gap-3 mb-4 border-b border-amber-200 pb-3">
                <h2 className="text-xl font-bold text-amber-900">未分類写真</h2>
                <span className="text-sm text-amber-700">{unclassifiedPhotos.length}枚を確認してください</span>
                {unclassifiedPhotos.some((photo) => selectedIds.has(photo.id)) && (
                  <>
                    <button
                      type="button"
                      onClick={moveSelectedUnclassifiedToExterior}
                      className="flex items-center gap-1 bg-white text-amber-800 border border-amber-300 px-3 py-1.5 rounded-md text-sm font-medium"
                    >
                      <ArrowUp size={15} /> 外観へ
                    </button>
                    <button
                      type="button"
                      onClick={() => movePhotosToInterior('unclassified')}
                      className="flex items-center gap-1 bg-white text-amber-800 border border-amber-300 px-3 py-1.5 rounded-md text-sm font-medium"
                    >
                      <ArrowDown size={15} /> 内観へ
                    </button>
                  </>
                )}
              </div>
              {renderPhotoGrid(
                unclassifiedPhotos.map((photo) => ({
                  ...photo,
                  caption: resolvePhotoCaption(
                    photo,
                    photo.needsAttention ? '要確認（番号なし）' : '未分類',
                  ),
                })),
                'unclassified',
                handleUnclassifiedDragEnd,
              )}
            </section>
          )}
        </div>
      </main>

      {processingMessage && (
        <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-[100] flex items-center justify-center">
          <div className="bg-white px-6 py-4 rounded-lg shadow-lg border border-slate-200 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="font-medium text-slate-700">{processingMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
