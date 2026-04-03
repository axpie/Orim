import { memo, useState, useEffect, useReducer } from 'react';
import { Group, Image as KonvaImage, Line, Rect } from 'react-konva';
import type { ImageElement } from '../../../types/models';
import { ImageFit } from '../../../types/models';
import { deletedImageIds, onImageDeleted } from '../../../api/images';

interface ImageRendererProps {
  element: ImageElement;
}

function extractImageId(imageUrl: string): string {
  return imageUrl.split('/').pop() ?? '';
}

function ImageRendererInner({ element: el }: ImageRendererProps) {
  const [imageState, setImageState] = useState<{
    src: string | null;
    image: HTMLImageElement | null;
    failed: boolean;
  }>({
    src: null,
    image: null,
    failed: false,
  });
  // Re-render when the global deletedImageIds set changes
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    return onImageDeleted(forceUpdate);
  }, [forceUpdate]);

  const isDeleted = deletedImageIds.has(extractImageId(el.imageUrl));

  useEffect(() => {
    if (isDeleted) {
      return;
    }

    const img = new window.Image();
    img.onload = () => {
      setImageState({
        src: el.imageUrl,
        image: img,
        failed: false,
      });
    };
    img.onerror = () => {
      setImageState({
        src: el.imageUrl,
        image: null,
        failed: true,
      });
    };
    img.src = el.imageUrl;
    return () => { img.onload = null; img.onerror = null; };
  }, [el.imageUrl, isDeleted]);

  const image = imageState.src === el.imageUrl ? imageState.image : null;
  const failed = isDeleted || (imageState.src === el.imageUrl && imageState.failed);

  const { x, y, width, height, rotation } = el;
  const fit = el.imageFit ?? ImageFit.Uniform;

  // Compute rendered image position/size based on fit mode
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
    // Fill: imgX=0, imgY=0, imgW=width, imgH=height — already set as defaults
  }

  return (
    <Group rotation={rotation} x={x} y={y} clipRect={clipRect ?? undefined}>
      {image && !failed ? (
        <KonvaImage
          x={imgX}
          y={imgY}
          width={imgW}
          height={imgH}
          image={image}
          opacity={el.opacity ?? 1}
          listening={false}
        />
      ) : (
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
          {/* Diagonal lines to indicate missing/loading image */}
          <Line points={[0, 0, width, height]} stroke="#cbd5e1" strokeWidth={1} listening={false} />
          <Line points={[width, 0, 0, height]} stroke="#cbd5e1" listening={false} strokeWidth={1} />
        </>
      )}
      {/* Transparent hit area — covers full bounding box for reliable click/drag detection */}
      <Rect
        width={width}
        height={height}
        fill="rgba(0,0,0,0)"
        data-element-id={el.id}
      />
    </Group>
  );
}

export const ImageRenderer = memo(ImageRendererInner);
