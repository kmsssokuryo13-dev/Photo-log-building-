import { PDFDocument, rgb } from 'pdf-lib';
import type { PhotoWithCaption } from '../types/photo';
import { prepareImageForPdf } from './imageProcessing';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 42.52; // 15mm
const COLUMN_GAP = 18;
const ROW_GAP = 10;
const CAPTION_HEIGHT = 18;
const PAGE_SIZE = 8;

export const PHOTO_PDF_FILENAME = '写真.pdf';

export const getPhotoPdfPageCount = (exteriorCount: number, interiorCount: number) => (
  Math.ceil(exteriorCount / PAGE_SIZE) + Math.ceil(interiorCount / PAGE_SIZE)
);

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const dataUrlToBytes = (dataUrl: string) => {
  const base64 = dataUrl.split(',')[1];
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const createCaptionPng = (caption: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 72;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas context not available');

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#1f2937';
  context.font = '600 42px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(caption, canvas.width / 2, canvas.height / 2, canvas.width - 16);
  return dataUrlToBytes(canvas.toDataURL('image/png'));
};

export const generatePhotoPdf = async (
  exteriorPhotos: PhotoWithCaption[],
  interiorPhotos: PhotoWithCaption[],
) => {
  const document = await PDFDocument.create();
  document.setTitle('写真');
  document.setCreator('建物登記 写真台帳作成');

  // 既存の印刷レイアウトと同様、外観と内観はページ境界を分ける。
  const pageBatches = [
    ...chunk(exteriorPhotos, PAGE_SIZE),
    ...chunk(interiorPhotos, PAGE_SIZE),
  ];
  const captionCache = new Map<string, Awaited<ReturnType<typeof document.embedPng>>>();
  const contentWidth = A4_WIDTH - MARGIN * 2;
  const contentHeight = A4_HEIGHT - MARGIN * 2;
  const cellWidth = (contentWidth - COLUMN_GAP) / 2;
  const cellHeight = (contentHeight - ROW_GAP * 3) / 4;
  const imageBoxHeight = cellHeight - CAPTION_HEIGHT - 4;

  for (const batch of pageBatches) {
    const page = document.addPage([A4_WIDTH, A4_HEIGHT]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: A4_WIDTH,
      height: A4_HEIGHT,
      color: rgb(1, 1, 1),
    });

    for (let index = 0; index < batch.length; index += 1) {
      const photo = batch[index];
      const column = index % 2;
      const row = Math.floor(index / 2);
      const cellX = MARGIN + column * (cellWidth + COLUMN_GAP);
      const cellTop = A4_HEIGHT - MARGIN - row * (cellHeight + ROW_GAP);
      // 画面表示用画像とは分け、PDF枠に必要な解像度へ回転と同時に1回だけ変換する。
      const imageData = await prepareImageForPdf(photo.url, photo.rotation);
      const embeddedImage = await document.embedJpg(dataUrlToBytes(imageData));
      const imageScale = Math.min(
        cellWidth / embeddedImage.width,
        imageBoxHeight / embeddedImage.height,
      );
      const imageWidth = embeddedImage.width * imageScale;
      const imageHeight = embeddedImage.height * imageScale;
      const imageX = cellX + (cellWidth - imageWidth) / 2;
      const imageY = cellTop - imageHeight;
      page.drawImage(embeddedImage, {
        x: imageX,
        y: imageY,
        width: imageWidth,
        height: imageHeight,
      });

      let captionImage = captionCache.get(photo.caption);
      if (!captionImage) {
        captionImage = await document.embedPng(createCaptionPng(photo.caption));
        captionCache.set(photo.caption, captionImage);
      }
      page.drawImage(captionImage, {
        x: cellX,
        y: cellTop - imageBoxHeight - CAPTION_HEIGHT,
        width: cellWidth,
        height: CAPTION_HEIGHT,
      });
    }
  }

  return document.save({ useObjectStreams: true });
};

export const downloadPhotoPdf = async (
  exteriorPhotos: PhotoWithCaption[],
  interiorPhotos: PhotoWithCaption[],
) => {
  const bytes = await generatePhotoPdf(exteriorPhotos, interiorPhotos);
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = PHOTO_PDF_FILENAME;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // click直後の失効でダウンロードが中断されるブラウザーを避ける。
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
