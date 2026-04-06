import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuxiliaryPanelHost } from '../AuxiliaryPanelHost';
import { getAuxiliaryPanelWidth, toggleAuxiliaryPanel } from '../auxiliaryPanels';

describe('auxiliaryPanels', () => {
  it('returns the configured width for each panel', () => {
    expect(getAuxiliaryPanelWidth('properties')).toBe(360);
    expect(getAuxiliaryPanelWidth('assistant')).toBe(420);
    expect(getAuxiliaryPanelWidth(null)).toBe(0);
  });

  it('toggles the same panel off and switches to a different panel', () => {
    expect(toggleAuxiliaryPanel(null, 'assistant')).toBe('assistant');
    expect(toggleAuxiliaryPanel('assistant', 'assistant')).toBeNull();
    expect(toggleAuxiliaryPanel('assistant', 'properties')).toBe('properties');
  });
});

describe('AuxiliaryPanelHost', () => {
  it('renders desktop content only while open', () => {
    const { rerender } = render(
      <AuxiliaryPanelHost open mobile={false} width={320} onClose={vi.fn()}>
        {() => <div>Panel content</div>}
      </AuxiliaryPanelHost>,
    );

    expect(screen.getByText('Panel content')).toBeInTheDocument();

    rerender(
      <AuxiliaryPanelHost open={false} mobile={false} width={320} onClose={vi.fn()}>
        {() => <div>Panel content</div>}
      </AuxiliaryPanelHost>,
    );

    expect(screen.queryByText('Panel content')).not.toBeInTheDocument();
  });
});
