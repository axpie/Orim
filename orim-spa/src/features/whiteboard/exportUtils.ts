import type Konva from 'konva';
import { toPng } from 'html-to-image';

export function createBoardFileName(title: string | undefined, extension: string) {
  const baseName = (title?.trim() || 'board').replace(/[\\/:*?"<>|]+/g, '-');
  return `${baseName}.${extension}`;
}

export function downloadTextFile(contents: string, mimeType: string, fileName: string) {
  const blob = new Blob([contents], { type: mimeType });
  downloadBlob(blob, fileName);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportStageAsPng(
  stage: Konva.Stage,
  title: string | undefined,
  container?: HTMLElement | null,
) {
  const transientLayer = stage.findOne('.whiteboard-export-hidden') as Konva.Layer | null;
  const previousVisibility = transientLayer?.visible() ?? true;

  if (transientLayer) {
    transientLayer.visible(false);
    stage.batchDraw();
  }

  try {
    if (container) {
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
    }

    const anchor = document.createElement('a');
    anchor.href = container
      ? await toPng(container, {
          cacheBust: true,
          pixelRatio: Math.max(window.devicePixelRatio || 1, 2),
          filter: (node) => !(node instanceof HTMLElement && node.dataset.whiteboardExportHidden === 'true'),
        })
      : stage.toDataURL({
          pixelRatio: Math.max(window.devicePixelRatio || 1, 2),
          mimeType: 'image/png',
        });
    anchor.download = createBoardFileName(title, 'png');
    anchor.click();
  } finally {
    if (transientLayer) {
      transientLayer.visible(previousVisibility);
      stage.batchDraw();
    }
  }
}
