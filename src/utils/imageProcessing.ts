import type { PhotoRotation } from '../types/photo';

const MAX_IMAGE_EDGE = 1500;
const JPEG_QUALITY = 0.84;

// PDF上の写真枠（最大約3.4inch幅）を300dpi前後で満たしつつ、
// 画面表示用データを必要以上の解像度で埋め込まない。
export const PDF_IMAGE_MAX_DIMENSION = 1000;
export const PDF_JPEG_QUALITY = 0.76;

const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new window.Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('画像を読み込めませんでした。'));
  image.src = source;
});

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = () => reject(new Error(`${file.name} を読み込めませんでした。`));
  reader.readAsDataURL(file);
});

export const compressImage = async (file: File) => {
  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas context not available');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
};

export const getOptimizedImageDimensions = (
  sourceWidth: number,
  sourceHeight: number,
  rotation: PhotoRotation,
  maxDimension: number,
) => {
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const scaledWidth = Math.max(1, Math.round(sourceWidth * scale));
  const scaledHeight = Math.max(1, Math.round(sourceHeight * scale));
  const swapsDimensions = rotation === 90 || rotation === 270;
  return {
    canvasWidth: swapsDimensions ? scaledHeight : scaledWidth,
    canvasHeight: swapsDimensions ? scaledWidth : scaledHeight,
    drawWidth: scaledWidth,
    drawHeight: scaledHeight,
  };
};

export const prepareImageForPdf = async (source: string, rotation: PhotoRotation) => {
  const image = await loadImage(source);
  const dimensions = getOptimizedImageDimensions(
    image.width,
    image.height,
    rotation,
    PDF_IMAGE_MAX_DIMENSION,
  );
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.canvasWidth;
  canvas.height = dimensions.canvasHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas context not available');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(
    image,
    -dimensions.drawWidth / 2,
    -dimensions.drawHeight / 2,
    dimensions.drawWidth,
    dimensions.drawHeight,
  );
  return canvas.toDataURL('image/jpeg', PDF_JPEG_QUALITY);
};

export const getNextRotation = (rotation: PhotoRotation): PhotoRotation => (
  ((rotation + 90) % 360) as PhotoRotation
);

export const imageProcessingSettings = {
  maxImageEdge: MAX_IMAGE_EDGE,
  jpegQuality: JPEG_QUALITY,
};

export const pdfImageProcessingSettings = {
  maxImageDimension: PDF_IMAGE_MAX_DIMENSION,
  jpegQuality: PDF_JPEG_QUALITY,
};
