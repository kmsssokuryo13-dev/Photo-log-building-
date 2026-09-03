import { describe, expect, it } from 'vitest';
import {
  getOptimizedImageDimensions,
  pdfImageProcessingSettings,
} from './imageProcessing';
import { getPhotoPdfPageCount, PHOTO_PDF_FILENAME } from './pdfGenerator';

describe('PDF layout', () => {
  it.each([
    [0, 1, 1],
    [0, 7, 1],
    [0, 8, 1],
    [0, 9, 2],
    [8, 0, 1],
    [9, 0, 2],
    [1, 1, 2],
    [9, 9, 4],
  ])('外観%s枚・内観%s枚を%sページにする', (exterior, interior, pages) => {
    expect(getPhotoPdfPageCount(exterior, interior)).toBe(pages);
  });

  it('固定ファイル名を使用する', () => {
    expect(PHOTO_PDF_FILENAME).toBe('写真.pdf');
  });

  it('PDF用画像設定を実寸に必要な範囲へ制限する', () => {
    expect(pdfImageProcessingSettings).toEqual({
      maxImageDimension: 1000,
      jpegQuality: 0.76,
    });
  });

  it('回転画像もPDF用最大寸法内へ1回で変換できる寸法にする', () => {
    expect(getOptimizedImageDimensions(3000, 2000, 90, 1100)).toEqual({
      canvasWidth: 733,
      canvasHeight: 1100,
      drawWidth: 1100,
      drawHeight: 733,
    });
  });
});
