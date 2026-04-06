import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Board } from '../../../../types/models';
import { Toolbar } from '../Toolbar';
import { useBoardStore } from '../../store/boardStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, optionsOrDefault?: unknown, maybeDefault?: string) => {
      if (typeof optionsOrDefault === 'string') {
        return optionsOrDefault;
      }

      if (typeof maybeDefault === 'string') {
        return maybeDefault;
      }

      if (optionsOrDefault && typeof optionsOrDefault === 'object' && 'defaultValue' in optionsOrDefault) {
        const defaultValue = (optionsOrDefault as { defaultValue?: unknown }).defaultValue;
        if (typeof defaultValue === 'string') {
          return defaultValue;
        }
      }

      return key;
    },
  }),
}));

class ResizeObserverMock {
  observe() { }
  disconnect() { }
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverMock,
  });
});

function createBoard(enabledIconGroups: string[]): Board {
  return {
    id: 'board-1',
    ownerId: 'owner-1',
    title: 'Test Board',
    labelOutlineEnabled: true,
    arrowOutlineEnabled: true,
    surfaceColor: null,
    themeKey: null,
    enabledIconGroups,
    customColors: [],
    recentColors: [],
    stickyNotePresets: [],
    members: [],
    elements: [],
    comments: [],
    snapshots: [],
    visibility: 'Private',
    shareLinkToken: null,
    sharedAllowAnonymousEditing: false,
    sharePasswordHash: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Board;
}

describe('Toolbar icon dialog', () => {
  beforeEach(() => {
    useBoardStore.setState({
      board: createBoard([]),
      selectedElementIds: [],
      activeTool: 'select',
      zoom: 1,
      cameraX: 0,
      cameraY: 0,
      viewportWidth: 1200,
      viewportHeight: 800,
      viewportInsets: { top: 0, right: 0, bottom: 0, left: 0 },
      isDirty: false,
      pendingIconName: 'mdi-star',
      pendingStickyNotePresetId: null,
    });
  });

  it('keeps the icon tool visible, opens the full dialog, and can find MDI icons when no toolbar groups are enabled', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Toolbar />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'tools.icon' }));

    expect(await screen.findByText('Alle Icons')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByText('Activities')).toBeInTheDocument();
    expect(screen.queryByText('Alle aktivierten Icons')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('tools.iconSearch'), {
      target: { value: 'apple safari' },
    });

    expect(await screen.findByText('Apple Safari')).toBeInTheDocument();
  });
});
