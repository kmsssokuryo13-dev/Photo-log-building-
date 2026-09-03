import { useState } from 'react';
import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical, Pencil, RotateCcw, RotateCw, Trash2, X } from 'lucide-react';
import type { PhotoRotation } from '../types/photo';

type SortablePhotoItemProps = {
  id: string;
  url: string;
  caption: string;
  fileName: string;
  rotation: PhotoRotation;
  needsAttention: boolean;
  isCustomCaption: boolean;
  onRemove: (id: string) => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onRotate: (id: string) => void;
  onChangeCaption: (id: string, caption: string | null) => void;
  footer?: ReactNode;
};

export default function SortablePhotoItem({
  id,
  url,
  caption,
  fileName,
  rotation,
  needsAttention,
  isCustomCaption,
  onRemove,
  isSelected,
  onToggleSelect,
  onRotate,
  onChangeCaption,
  footer,
}: SortablePhotoItemProps) {
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(caption);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  const startCaptionEditing = () => {
    setCaptionDraft(caption);
    setIsEditingCaption(true);
  };

  const saveCaption = () => {
    onChangeCaption(id, captionDraft.trim() || null);
    setIsEditingCaption(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group bg-white border rounded-lg shadow-sm overflow-hidden flex flex-col ${
        isDragging ? 'opacity-50 ring-2 ring-blue-500 border-blue-500'
          : isSelected ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-200'
      }`}
    >
      <div className="absolute top-2 left-2 z-20 flex items-center gap-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(id)}
          className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shadow-sm"
          aria-label={`${fileName}を選択`}
        />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRotate(id);
          }}
          className="p-1 bg-white/90 backdrop-blur-sm rounded-md shadow-sm hover:bg-gray-100 text-gray-700 cursor-pointer border border-gray-200"
          title="90度回転"
        >
          <RotateCw size={14} />
        </button>
      </div>

      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="p-1.5 bg-white/90 backdrop-blur-sm rounded-md shadow-sm hover:bg-gray-100 text-gray-700 cursor-grab active:cursor-grabbing"
          title="ドラッグして並び替え"
        >
          <GripVertical size={16} />
        </button>
        <button
          type="button"
          onClick={() => onRemove(id)}
          className="p-1.5 bg-red-500/90 backdrop-blur-sm rounded-md shadow-sm hover:bg-red-600 text-white cursor-pointer"
          title="削除"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {needsAttention && (
        <div className="absolute top-10 left-2 z-10 rounded-full border border-amber-300 bg-amber-100/95 px-2 py-0.5 text-[10px] font-semibold text-amber-800 shadow-sm">
          要確認・番号なし
        </div>
      )}

      <div
        className="flex-1 aspect-square bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer"
        onClick={() => onToggleSelect(id)}
      >
        <img
          src={url}
          alt={caption}
          className="w-full h-full object-cover"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      </div>
      <div className="px-2 py-1.5 text-center bg-slate-50 border-t border-gray-200">
        {isEditingCaption ? (
          <div className="flex h-5 items-center gap-1">
            <input
              type="text"
              value={captionDraft}
              onChange={(event) => setCaptionDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveCaption();
                if (event.key === 'Escape') setIsEditingCaption(false);
              }}
              className="min-w-0 flex-1 rounded border border-blue-300 bg-white px-1 text-xs leading-5 outline-none focus:ring-1 focus:ring-blue-400"
              aria-label={`${fileName}のキャプション`}
              autoFocus
            />
            <button type="button" onClick={saveCaption} className="text-blue-600" title="保存">
              <Check size={14} />
            </button>
            <button type="button" onClick={() => setIsEditingCaption(false)} className="text-slate-400" title="キャンセル">
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex h-5 items-center justify-center gap-1">
            <div className="min-w-0 truncate text-sm font-semibold leading-5 text-slate-800" title={caption}>{caption}</div>
            <button
              type="button"
              onClick={startCaptionEditing}
              className="shrink-0 text-slate-400 hover:text-blue-600"
              title="キャプションを編集"
              aria-label={`${fileName}のキャプションを編集`}
            >
              <Pencil size={12} />
            </button>
            {isCustomCaption && (
              <button
                type="button"
                onClick={() => onChangeCaption(id, null)}
                className="shrink-0 text-slate-400 hover:text-blue-600"
                title="自動キャプションに戻す"
                aria-label={`${fileName}を自動キャプションに戻す`}
              >
                <RotateCcw size={12} />
              </button>
            )}
          </div>
        )}
        <div className="text-[9px] leading-3 text-slate-400 truncate" title={fileName}>{fileName}</div>
      </div>
      {footer && <div className="p-1.5 border-t border-slate-200 bg-white">{footer}</div>}
    </div>
  );
}
