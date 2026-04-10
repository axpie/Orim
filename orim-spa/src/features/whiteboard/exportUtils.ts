import type Konva from 'konva';

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

export function exportStageAsPng(stage: Konva.Stage, title: string | undefined) {
  const transientLayer = stage.findOne('.whiteboard-export-hidden') as Konva.Layer | null;
  const previousVisibility = transientLayer?.visible() ?? true;

  if (transientLayer) {
    transientLayer.visible(false);
    stage.batchDraw();
  }

  try {
    const anchor = document.createElement('a');
    anchor.href = stage.toDataURL({
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
