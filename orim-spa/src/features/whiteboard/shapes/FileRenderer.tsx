import { memo, useState, useEffect, useReducer } from 'react';
import { Group, Image as KonvaImage, Line, Rect, Text as KonvaText } from 'react-konva';
import type { FileElement } from '../../../types/models';
import { ImageFit } from '../../../types/models';
import { deletedFileIds, onFileDeleted } from '../../../api/files';

interface FileRendererProps {
  element: FileElement;
}

function isImageContentType(contentType: string): boolean {
  return contentType.startsWith('image/');
}

function extractFileId(fileUrl: string): string {
  return fileUrl.split('/').pop() ?? '';
}

/** Opens a file URL in a new tab for download/preview. */
function openFile(fileUrl: string): void {
  window.open(fileUrl, '_blank', 'noopener,noreferrer');
}

/** Triggers a browser download for the given file URL. */
function downloadFile(fileUrl: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = fileUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Renders an image loaded from a URL using Konva. */
function ImageContent({
  el,
  width,
  height,
}: {
  el: FileElement;
  width: number;
  height: number;
}) {
  const [imageState, setImageState] = useState<{
    src: string | null;
    image: HTMLImageElement | null;
    failed: boolean;
  }>({ src: null, image: null, failed: false });

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setImageState({ src: el.fileUrl, image: img, failed: false });
    img.onerror = () => setImageState({ src: el.fileUrl, image: null, failed: true });
    img.src = el.fileUrl;
    return () => { img.onload = null; img.onerror = null; };
  }, [el.fileUrl]);

  const image = imageState.src === el.fileUrl ? imageState.image : null;
  const failed = imageState.src === el.fileUrl && imageState.failed;
  const fit = el.imageFit ?? ImageFit.Uniform;

  let imgX = 0;
  let imgY = 0;
  let imgW = width;
  let imgH = height;
  let clipRect: { x: number; y: number; width: number; height: number } | null = null;

  if (image && !failed) {
    const natW = image.naturalWidth || width;
    const natH = image.naturalHeight || height;

    if (fit === ImageFit.Uniform) {
      const scale = Math.min(width / natW, height / natH);
      imgW = natW * scale;
      imgH = natH * scale;
      imgX = (width - imgW) / 2;
      imgY = (height - imgH) / 2;
    } else if (fit === ImageFit.UniformToFill) {
      const scale = Math.max(width / natW, height / natH);
      imgW = natW * scale;
      imgH = natH * scale;
      imgX = (width - imgW) / 2;
      imgY = (height - imgH) / 2;
      clipRect = { x: 0, y: 0, width, height };
    }
  }

  if (image && !failed) {
    return (
      <Group clipRect={clipRect ?? undefined}>
        <KonvaImage
          x={imgX}
          y={imgY}
          width={imgW}
          height={imgH}
          image={image}
          opacity={el.opacity ?? 1}
          listening={false}
        />
      </Group>
    );
  }

  return <Placeholder width={width} height={height} />;
}

function Placeholder({ width, height }: { width: number; height: number }) {
  return (
    <>
      <Rect
        width={width}
        height={height}
        fill="#f8fafc"
        stroke="#e2e8f0"
        strokeWidth={1}
        dash={[6, 4]}
        listening={false}
      />
      <Line points={[0, 0, width, height]} stroke="#cbd5e1" strokeWidth={1} listening={false} />
      <Line points={[width, 0, 0, height]} stroke="#cbd5e1" strokeWidth={1} listening={false} />
    </>
  );
}

/** Renders a generic file icon with filename and a click handler to open the file. */
function FileIconContent({
  el,
  width,
  height,
}: {
  el: FileElement;
  width: number;
  height: number;
}) {
  const iconSize = Math.min(width, height) * 0.45;
  const centerX = width / 2;
  const centerY = height / 2 - iconSize * 0.1;

  // Simple document icon drawn with Konva shapes
  const docW = iconSize * 0.65;
  const docH = iconSize * 0.85;
  const docX = centerX - docW / 2;
  const docY = centerY - docH / 2;
  const foldSize = docW * 0.3;

  const fontSize = Math.max(10, Math.min(14, width * 0.1));
  const label = el.fileName.length > 18 ? `${el.fileName.slice(0, 15)}…` : el.fileName;

  return (
    <>
      <Rect
        width={width}
        height={height}
        fill="#f1f5f9"
        stroke="#cbd5e1"
        strokeWidth={1}
        cornerRadius={4}
        listening={false}
      />
      {/* Document body */}
      <Rect
        x={docX}
        y={docY + foldSize}
        width={docW}
        height={docH - foldSize}
        fill="#ffffff"
        stroke="#94a3b8"
        strokeWidth={1}
        listening={false}
      />
      {/* Folded corner */}
      <Line
        points={[
          docX, docY + foldSize,
          docX + foldSize, docY,
          docX + docW, docY,
          docX + docW, docY + foldSize,
          docX, docY + foldSize,
        ]}
        fill="#e2e8f0"
        stroke="#94a3b8"
        strokeWidth={1}
        closed
        listening={false}
      />
      {/* Lines on document */}
      {[0.35, 0.5, 0.65].map((ratio) => (
        <Line
          key={ratio}
          points={[
            docX + docW * 0.15, docY + docH * ratio,
            docX + docW * 0.85, docY + docH * ratio,
          ]}
          stroke="#cbd5e1"
          strokeWidth={1}
          listening={false}
        />
      ))}
      {/* Filename label */}
      <KonvaText
        x={4}
        y={height - fontSize - 6}
        width={width - 8}
        text={label}
        fontSize={fontSize}
        fill="#475569"
        align="center"
        listening={false}
        ellipsis
      />
      {/* Transparent hit area — double-click/double-tap opens the file */}
      <Rect
        width={width}
        height={height}
        fill="rgba(0,0,0,0)"
        data-element-id={el.id}
        onDblClick={() => openFile(el.fileUrl)}
        onDblTap={() => openFile(el.fileUrl)}
      />
      {/* Download button — bottom-right corner */}
      {width >= 60 && height >= 60 && (
        <Group
          x={width - 27}
          y={height - 27}
          onClick={(e) => { e.cancelBubble = true; downloadFile(el.fileUrl, el.fileName); }}
          onTap={(e) => { e.cancelBubble = true; downloadFile(el.fileUrl, el.fileName); }}
          onDblClick={(e) => { e.cancelBubble = true; }}
          onDblTap={(e) => { e.cancelBubble = true; }}
        >
          <Rect width={22} height={22} fill="#3b82f6" cornerRadius={3} shadowBlur={3} shadowOpacity={0.18} />
          {/* Arrow shaft */}
          <Line points={[11, 3, 11, 13]} stroke="white" strokeWidth={2} lineCap="round" listening={false} />
          {/* Arrow head */}
          <Line points={[6, 9, 11, 14, 16, 9]} stroke="white" strokeWidth={2} lineCap="round" lineJoin="round" listening={false} />
          {/* Bottom bar */}
          <Line points={[5, 18, 17, 18]} stroke="white" strokeWidth={2} lineCap="round" listening={false} />
        </Group>
      )}
    </>
  );
}

function FileRendererInner({ element: el }: FileRendererProps) {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    return onFileDeleted(forceUpdate);
  }, [forceUpdate]);

  const isDeleted = deletedFileIds.has(extractFileId(el.fileUrl));
  const { x, y, width, height, rotation } = el;

  return (
    <Group
      x={x + width / 2}
      y={y + height / 2}
      offsetX={width / 2}
      offsetY={height / 2}
      rotation={rotation}
    >
      {isDeleted ? (
        <Placeholder width={width} height={height} />
      ) : isImageContentType(el.contentType) ? (
        <ImageContent el={el} width={width} height={height} />
      ) : (
        <FileIconContent el={el} width={width} height={height} />
      )}
      {/* Transparent hit rect for select/drag (images and placeholders) */}
      {(isDeleted || isImageContentType(el.contentType)) && (
        <Rect
          width={width}
          height={height}
          fill="rgba(0,0,0,0)"
          data-element-id={el.id}
        />
      )}
    </Group>
  );
}

export const FileRenderer = memo(FileRendererInner);
