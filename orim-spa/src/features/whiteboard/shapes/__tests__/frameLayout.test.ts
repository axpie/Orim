import { describe, expect, it } from 'vitest';
import { getFrameHeaderHeight, resolveFrameTitleFontSize } from '../frameLayout';

describe('frameLayout', () => {
  it('uses a compact default header height when the frame label is empty', () => {
    const headerHeight = getFrameHeaderHeight(180, 240, '', undefined);

    expect(headerHeight).toBeGreaterThanOrEqual(28);
    expect(headerHeight).toBeLessThanOrEqual(40);
  });

  it('grows the header for multiline content', () => {
    const fontSize = resolveFrameTitleFontSize({ height: 180, labelFontSize: null });
    const singleLine = getFrameHeaderHeight(180, 220, 'Short title', fontSize);
    const multiline = getFrameHeaderHeight(180, 220, 'First line\nSecond line\nThird line', fontSize);

    expect(multiline).toBeGreaterThan(singleLine);
  });

  it('grows the header when narrow width forces wrapping', () => {
    const fontSize = resolveFrameTitleFontSize({ height: 180, labelFontSize: null });
    const wide = getFrameHeaderHeight(180, 260, 'A long frame title that can stay on one line', fontSize);
    const narrow = getFrameHeaderHeight(180, 120, 'A long frame title that can stay on one line', fontSize);

    expect(narrow).toBeGreaterThan(wide);
  });
});
