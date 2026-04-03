import { memo } from 'react';
import { Line } from 'react-konva';
import type { AlignmentGuide } from '../../../utils/geometry';

interface AlignmentGuidesProps {
  guides: AlignmentGuide[];
  zoom: number;
  stageSize: { width: number; height: number };
  cameraX: number;
  cameraY: number;
}

function AlignmentGuidesInner({ guides, zoom, stageSize, cameraX, cameraY }: AlignmentGuidesProps) {
  if (guides.length === 0) return null;

  const worldLeft = -cameraX / zoom;
  const worldTop = -cameraY / zoom;
  const worldRight = worldLeft + stageSize.width / zoom;
  const worldBottom = worldTop + stageSize.height / zoom;

  // Deduplicate guides
  const seen = new Set<string>();
  const unique = guides.filter((g) => {
    const key = `${g.orientation}:${Math.round(g.position * 10)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <>
      {unique.map((g, i) =>
        g.orientation === 'vertical' ? (
          <Line
            key={`ag-${i}`}
            points={[g.position, worldTop, g.position, worldBottom]}
            stroke="#e53935"
            strokeWidth={1 / zoom}
            listening={false}
          />
        ) : (
          <Line
            key={`ag-${i}`}
            points={[worldLeft, g.position, worldRight, g.position]}
            stroke="#e53935"
            strokeWidth={1 / zoom}
            listening={false}
          />
        ),
      )}
    </>
  );
}

export const AlignmentGuides = memo(AlignmentGuidesInner);
