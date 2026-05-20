import React, { useState, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2, Plus, GripVertical, Download, Image as ImageIcon, Settings, X, UploadCloud, ArrowDown, ArrowUp, RotateCw } from 'lucide-react';

// --- ユーティリティ関数 ---

// アルファベットへの変換 (0 -> A, 1 -> B, ..., 26 -> AA)
const getAlphabet = (index: number) => {
  let res = '';
  let n = index;
  while (n >= 0) {
    res = String.fromCharCode(65 + (n % 26)) + res;
    n = Math.floor(n / 26) - 1;
  }
  return res;
};

// 配列をN個ずつのチャンク（塊）に分割
const chunkArray = <T,>(arr: T[], size: number): T[][] => {
  const chunked = [];
  for (let i = 0; i < arr.length; i += size) {
    chunked.push(arr.slice(i, i + size));
  }
  return chunked;
};

// クライアントサイドでの画像圧縮処理 (印刷時のパフォーマンスとメモリ削減のため)
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new window.Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200; 
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8)); // 品質80%
        } else {
          reject(new Error('Canvas context not available'));
        }
      };
      img.onerror = (e) => reject(e);
    };
    reader.onerror = (e) => reject(e);
  });
};

// 画像データを90度回転させる処理
const rotateImageData = (url: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.src = url;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // 90度回転後のサイズ設定（幅と高さを入れ替え）
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // 回転の中心を移動して回転描画
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((90 * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } else {
        resolve(url);
      }
    };
    img.onerror = () => resolve(url);
  });
};

// --- 型定義 ---
type Photo = { id: string; url: string };
type GroupSetting = { 
  id: string; 
  start: number; 
  end: number; 
  name: string;
  showInside: boolean;
  showInclusion: boolean;
  showExclusion: boolean;
};
type PhotoWithCaption = Photo & { caption: string };

// --- コンポーネント群 ---

// ドラッグ可能な写真アイテムコンポーネント
const SortablePhotoItem = ({ 
  id, 
  url, 
  caption, 
  onRemove,
  isSelected,
  onToggleSelect,
  onRotate
}: { 
  id: string, 
  url: string, 
  caption: string, 
  onRemove: (id: string) => void,
  isSelected: boolean,
  onToggleSelect: (id: string) => void,
  onRotate: (id: string) => void
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`relative group bg-white border rounded-lg shadow-sm overflow-hidden flex flex-col ${
        isDragging ? 'opacity-50 ring-2 ring-blue-500 border-blue-500' : 
        isSelected ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-200'
      }`}
    >
      {/* 左上：選択チェックボックスと回転ボタン */}
      <div className="absolute top-2 left-2 z-20 print:hidden flex items-center gap-2">
        <input 
          type="checkbox" 
          checked={isSelected}
          onChange={() => onToggleSelect(id)}
          className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shadow-sm"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRotate(id);
          }}
          className="p-1 bg-white/90 backdrop-blur-sm rounded-md shadow-sm hover:bg-gray-100 text-gray-700 cursor-pointer border border-gray-200"
          title="90度回転"
        >
          <RotateCw size={14} />
        </button>
      </div>

      {/* 右上：操作ボタン */}
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 print:hidden">
        <button 
          {...attributes} 
          {...listeners} 
          className="p-1.5 bg-white/90 backdrop-blur-sm rounded-md shadow-sm hover:bg-gray-100 text-gray-700 cursor-grab active:cursor-grabbing"
          title="ドラッグして並び替え"
        >
          <GripVertical size={16} />
        </button>
        <button 
          onClick={() => onRemove(id)} 
          className="p-1.5 bg-red-500/90 backdrop-blur-sm rounded-md shadow-sm hover:bg-red-600 text-white cursor-pointer"
          title="削除"
        >
          <Trash2 size={16} />
        </button>
      </div>
      
      <div 
        className="flex-1 aspect-square bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer"
        onClick={() => onToggleSelect(id)}
      >
        <img src={url} alt={caption} className="w-full h-full object-cover" />
      </div>
      <div className="p-2.5 text-center text-sm font-semibold text-slate-800 bg-slate-50 border-t border-gray-200">
        {caption}
      </div>
    </div>
  );
};

// 印刷用プレビューレイアウト（通常時は非表示、印刷時のみ表示）
const PrintLayout = ({ exteriorData, interiorData }: { exteriorData: PhotoWithCaption[], interiorData: PhotoWithCaption[] }) => {
  // それぞれ8枚ずつのグループに分割
  const extChunks = chunkArray(exteriorData, 8);
  const intChunks = chunkArray(interiorData, 8);

  return (
    <div className="w-full bg-white text-black">
      <style>{`
        @page { size: A4 portrait; margin: 15mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; background: white; }
          .page-break { page-break-after: always; }
          .page-break:last-child { page-break-after: auto; }
          .avoid-break { page-break-inside: avoid; }
        }
      `}</style>
      
      {/* 外観写真 */}
      {extChunks.map((chunk, i) => (
        <div key={`ext-${i}`} className="page-break w-full pt-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {chunk.map((photo) => (
              <div key={photo.id} className="flex flex-col items-center justify-start h-[230px] avoid-break">
                <img src={photo.url} alt={photo.caption} className="w-full h-[200px] object-contain mb-1" />
                <p className="text-sm font-medium text-center text-gray-800">{photo.caption}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 内装写真 (外観写真の後に続く) */}
      {intChunks.map((chunk, i) => (
        <div key={`int-${i}`} className="page-break w-full pt-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {chunk.map((photo) => (
              <div key={photo.id} className="flex flex-col items-center justify-start h-[230px] avoid-break">
                <img src={photo.url} alt={photo.caption} className="w-full h-[200px] object-contain mb-1" />
                <p className="text-sm font-medium text-center text-gray-800">{photo.caption}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// --- メインアプリケーション ---
export default function App() {
  const [exteriorPhotos, setExteriorPhotos] = useState<Photo[]>([]);
  const [interiorPhotos, setInteriorPhotos] = useState<Photo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<GroupSetting[]>([
    { id: 'default-1', start: 1, end: 8, name: '居宅', showInside: true, showInclusion: false, showExclusion: false }
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  // センサー設定 (DnD)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // キャプション計算済みのデータを生成
  const exteriorData: PhotoWithCaption[] = useMemo(() => {
    return exteriorPhotos.map((photo, index) => ({
      ...photo,
      caption: `方向 ${getAlphabet(index)}`
    }));
  }, [exteriorPhotos]);

  const interiorData: PhotoWithCaption[] = useMemo(() => {
    return interiorPhotos.map((photo, index) => {
      const num = index + 1;
      const group = groups.find(g => g.start <= num && num <= g.end);
      
      let captionText = '内部';
      if (group) {
        captionText = group.name;
        if (group.showInside) captionText += ' 内部';
        if (group.showInclusion) captionText += '（算入）';
        if (group.showExclusion) captionText += '（不算入）';
      }

      return {
        ...photo,
        caption: captionText
      };
    });
  }, [interiorPhotos, groups]);

  // 選択切り替え
  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // 写真回転処理
  const handleRotatePhoto = async (id: string, type: 'exterior' | 'interior') => {
    const isExterior = type === 'exterior';
    const photos = isExterior ? exteriorPhotos : interiorPhotos;
    const photo = photos.find(p => p.id === id);
    if (!photo) return;

    const newUrl = await rotateImageData(photo.url);
    
    const setPhotos = isExterior ? setExteriorPhotos : setInteriorPhotos;
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, url: newUrl } : p));
  };

  // 外観 -> 内装 移動
  const moveSelectedToInterior = () => {
    const itemsToMove = exteriorPhotos.filter(p => selectedIds.has(p.id));
    if (itemsToMove.length === 0) return;

    setExteriorPhotos(prev => prev.filter(p => !selectedIds.has(p.id)));
    setInteriorPhotos(prev => [...prev, ...itemsToMove]);
    setSelectedIds(new Set());
  };

  // 内装 -> 外観 移動
  const moveSelectedToExterior = () => {
    const itemsToMove = interiorPhotos.filter(p => selectedIds.has(p.id));
    if (itemsToMove.length === 0) return;

    setInteriorPhotos(prev => prev.filter(p => !selectedIds.has(p.id)));
    setExteriorPhotos(prev => [...prev, ...itemsToMove]);
    setSelectedIds(new Set());
  };

  // 写真追加ハンドラー
  const handleAddPhotos = async (e: React.ChangeEvent<HTMLInputElement>, type: 'exterior' | 'interior') => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setIsProcessing(true);
    try {
      const newPhotos = await Promise.all(
        files.map(async (file) => {
          const url = await compressImage(file);
          return { id: crypto.randomUUID(), url };
        })
      );

      if (type === 'exterior') {
        setExteriorPhotos(prev => [...prev, ...newPhotos]);
      } else {
        setInteriorPhotos(prev => [...prev, ...newPhotos]);
      }
    } catch (error) {
      console.error("画像の処理中にエラーが発生しました:", error);
      alert("画像の読み込みに失敗しました。");
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  // 写真削除ハンドラー
  const handleRemovePhoto = (id: string, type: 'exterior' | 'interior') => {
    if (type === 'exterior') {
      setExteriorPhotos(prev => prev.filter(p => p.id !== id));
    } else {
      setInteriorPhotos(prev => prev.filter(p => p.id !== id));
    }
    if (selectedIds.has(id)) {
      const newSelected = new Set(selectedIds);
      newSelected.delete(id);
      setSelectedIds(newSelected);
    }
  };

  // 並び替え完了ハンドラー
  const handleDragEnd = (event: DragEndEvent, type: 'exterior' | 'interior') => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const setPhotos = type === 'exterior' ? setExteriorPhotos : setInteriorPhotos;
      setPhotos((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // グループ設定ハンドラー
  const handleAddGroup = () => {
    const lastEnd = groups.length > 0 ? Math.max(...groups.map(g => g.end)) : 0;
    setGroups([...groups, { 
      id: crypto.randomUUID(), 
      start: lastEnd + 1, 
      end: lastEnd + 5, 
      name: '新グループ',
      showInside: true,
      showInclusion: false,
      showExclusion: false
    }]);
  };

  const handleUpdateGroup = (id: string, field: keyof GroupSetting, value: string | number | boolean) => {
    setGroups(prevGroups => {
      const index = prevGroups.findIndex(g => g.id === id);
      if (index === -1) return prevGroups;

      const newGroups = [...prevGroups];
      newGroups[index] = { ...newGroups[index], [field]: value };

      if (field === 'end' && typeof value === 'number') {
        if (index + 1 < newGroups.length) {
          newGroups[index + 1] = { ...newGroups[index + 1], start: value + 1 };
        }
      } else if (field === 'start' && typeof value === 'number') {
        if (index > 0) {
          newGroups[index - 1] = { ...newGroups[index - 1], end: value - 1 };
        }
      }

      return newGroups;
    });
  };

  const handleRemoveGroup = (id: string) => {
    setGroups(groups.filter(g => g.id !== id));
  };

  // 印刷をトリガーする関数
  const handlePrint = () => {
    const printArea = document.getElementById('print-area');
    if (!printArea) {
      window.print();
      return;
    }

    const clone = printArea.cloneNode(true) as HTMLElement;
    clone.classList.remove('hidden', 'print:block');
    clone.style.display = 'block';

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('ポップアップがブロックされました。ブラウザのアドレスバー付近からポップアップを許可していただくか、キーボードの Ctrl+P (Macは Cmd+P) を押して直接印刷してください。');
      window.print();
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>建物写真台帳 - 印刷プレビュー</title>
          <script src="https://cdn.tailwindcss.com"><${""}/script>
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            body { 
              -webkit-print-color-adjust: exact; 
              print-color-adjust: exact; 
              margin: 0; 
              background: white; 
              color: black;
              font-family: sans-serif;
            }
            .page-break { page-break-before: always; }
            .avoid-break { page-break-inside: avoid; }
          </style>
        </head>
        <body>
          ${clone.outerHTML}
          <script>
            setTimeout(() => {
              window.print();
            }, 800);
          <${""}/script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <>
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20 print:hidden">
        {/* ヘッダー */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
          <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800">
            <ImageIcon className="text-blue-600" />
            建物登記 写真台帳作成
          </h1>
          
          <div className="flex items-center gap-4">
            {(exteriorPhotos.length > 0 || interiorPhotos.length > 0) && (
              <button 
                onClick={handlePrint}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors shadow-sm"
              >
                <Download size={18} />
                PDFを出力
              </button>
            )}
          </div>
        </header>

        <main className="max-w-7xl mx-auto p-6 flex flex-col lg:flex-row gap-8 items-start">
          
          {/* 左サイドバー: 内装グループ設定 */}
          <aside className="w-full lg:w-80 bg-white border border-gray-200 rounded-xl shadow-sm p-5 shrink-0 sticky top-24">
            <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-3">
              <Settings size={20} className="text-slate-500" />
              <h2 className="text-lg font-bold text-slate-800">内装グループ設定</h2>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              内装写真の番号に応じたキャプションを設定します。設定外の番号は「内部」となります。
            </p>

            <div className="space-y-3 mb-4">
              {groups.map((group) => (
                <div key={group.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg relative group/item">
                  <button 
                    onClick={() => handleRemoveGroup(group.id)}
                    className="absolute -top-2 -right-2 bg-red-100 text-red-600 hover:bg-red-500 hover:text-white rounded-full p-1 opacity-0 group-hover/item:opacity-100 transition-opacity"
                  >
                    <X size={14} />
                  </button>
                  <div className="flex items-center gap-2 mb-2">
                    <input 
                      type="number" 
                      value={group.start} 
                      onChange={(e) => handleUpdateGroup(group.id, 'start', parseInt(e.target.value) || 0)}
                      className="w-16 px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                      min="1"
                    />
                    <span className="text-slate-400">～</span>
                    <input 
                      type="number" 
                      value={group.end} 
                      onChange={(e) => handleUpdateGroup(group.id, 'end', parseInt(e.target.value) || 0)}
                      className="w-16 px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                      min="1"
                    />
                  </div>
                  <input 
                    type="text" 
                    value={group.name} 
                    onChange={(e) => handleUpdateGroup(group.id, 'name', e.target.value)}
                    placeholder="グループ名 (例: 居宅)"
                    className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none mb-2"
                  />
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <label className="flex items-center gap-1 cursor-pointer hover:text-slate-900">
                      <input 
                        type="checkbox" 
                        checked={group.showInside} 
                        onChange={(e) => handleUpdateGroup(group.id, 'showInside', e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      内部
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer hover:text-slate-900">
                      <input 
                        type="checkbox" 
                        checked={group.showInclusion} 
                        onChange={(e) => handleUpdateGroup(group.id, 'showInclusion', e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      （算入）
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer hover:text-slate-900">
                      <input 
                        type="checkbox" 
                        checked={group.showExclusion} 
                        onChange={(e) => handleUpdateGroup(group.id, 'showExclusion', e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      （不算入）
                    </label>
                  </div>
                </div>
              ))}
            </div>
            
            <button 
              onClick={handleAddGroup}
              className="w-full flex items-center justify-center gap-1 py-2 border-2 border-dashed border-slate-300 text-slate-600 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors text-sm font-medium"
            >
              <Plus size={16} /> グループを追加
            </button>
          </aside>

          {/* メイン: 写真エリア */}
          <div className="flex-1 w-full space-y-10">
            
            {/* 外観写真セクション */}
            <section>
              <div className="flex items-center justify-between mb-4 border-b border-gray-200 pb-2">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-bold text-slate-800">外観写真</h2>
                  {exteriorPhotos.some(p => selectedIds.has(p.id)) && (
                    <button 
                      onClick={moveSelectedToInterior}
                      className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                    >
                      <ArrowDown size={16} />
                      内装に移動
                    </button>
                  )}
                </div>
                
                <label className="cursor-pointer flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-slate-700 px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm">
                  <UploadCloud size={16} />
                  写真を追加
                  <input 
                    type="file" 
                    multiple 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => handleAddPhotos(e, 'exterior')}
                    disabled={isProcessing}
                  />
                </label>
              </div>
              
              {exteriorData.length === 0 ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-10 text-center text-slate-500">
                  <ImageIcon className="mx-auto mb-2 opacity-50" size={32} />
                  <p>右上のボタンから外観写真を追加してください。</p>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'exterior')}>
                  <SortableContext items={exteriorData.map(p => p.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {exteriorData.map((photo) => (
                        <SortablePhotoItem 
                          key={photo.id} 
                          id={photo.id} 
                          url={photo.url} 
                          caption={photo.caption} 
                          onRemove={(id) => handleRemovePhoto(id, 'exterior')}
                          isSelected={selectedIds.has(photo.id)}
                          onToggleSelect={toggleSelection}
                          onRotate={(id) => handleRotatePhoto(id, 'exterior')}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </section>

            {/* 内装写真セクション */}
            <section>
              <div className="flex items-center justify-between mb-4 border-b border-gray-200 pb-2">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-bold text-slate-800">内装写真</h2>
                  {interiorPhotos.some(p => selectedIds.has(p.id)) && (
                    <button 
                      onClick={moveSelectedToExterior}
                      className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                    >
                      <ArrowUp size={16} />
                      外観に移動
                    </button>
                  )}
                </div>

                <label className="cursor-pointer flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-slate-700 px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm">
                  <UploadCloud size={16} />
                  写真を追加
                  <input 
                    type="file" 
                    multiple 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => handleAddPhotos(e, 'interior')}
                    disabled={isProcessing}
                  />
                </label>
              </div>

              {interiorData.length === 0 ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-10 text-center text-slate-500">
                  <ImageIcon className="mx-auto mb-2 opacity-50" size={32} />
                  <p>右上のボタンから内装写真を追加してください。</p>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'interior')}>
                  <SortableContext items={interiorData.map(p => p.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {interiorData.map((photo) => (
                        <SortablePhotoItem 
                          key={photo.id} 
                          id={photo.id} 
                          url={photo.url} 
                          caption={photo.caption} 
                          onRemove={(id) => handleRemovePhoto(id, 'interior')} 
                          isSelected={selectedIds.has(photo.id)}
                          onToggleSelect={toggleSelection}
                          onRotate={(id) => handleRotatePhoto(id, 'interior')}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </section>

          </div>
        </main>

        {/* 処理中のオーバーレイ */}
        {isProcessing && (
          <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-[100] flex items-center justify-center">
            <div className="bg-white px-6 py-4 rounded-lg shadow-lg border border-slate-200 flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="font-medium text-slate-700">写真を処理しています...</span>
            </div>
          </div>
        )}
      </div>

      {/* 印刷用のレイアウト */}
      <div id="print-area" className="hidden print:block">
        <PrintLayout exteriorData={exteriorData} interiorData={interiorData} />
      </div>
    </>
  );
}
