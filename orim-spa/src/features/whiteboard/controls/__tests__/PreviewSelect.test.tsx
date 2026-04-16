import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PreviewSelect } from '../PreviewSelect';

describe('PreviewSelect', () => {
  it('renders its menu above auxiliary panels', async () => {
    render(
      <PreviewSelect
        label="Linienstil"
        value="solid"
        onChange={vi.fn()}
        options={[
          { value: 'solid', ariaLabel: 'Solid', preview: <span>Solid</span> },
          { value: 'dashed', ariaLabel: 'Dashed', preview: <span>Dashed</span> },
        ]}
      />,
    );

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Linienstil' }));

    const listbox = await screen.findByRole('listbox');
    const popover = listbox.closest('.MuiPopover-root');
    expect(popover).not.toBeNull();
    expect(window.getComputedStyle(popover!).zIndex).toBe('1500');
  });
});
