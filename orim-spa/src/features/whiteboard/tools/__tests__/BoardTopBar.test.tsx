import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardVisibility, type Board, type BoardSyncStatus } from '../../../../types/models';
import { useBoardStore } from '../../store/boardStore';
import { BoardTopBar } from '../BoardTopBar';

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

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../../../../api/boards', () => ({
  exportBoardJson: vi.fn(),
}));

const savedSyncStatus: BoardSyncStatus = {
  kind: 'saved',
  hasPendingChanges: false,
  queuedChangesCount: 0,
  detail: null,
};

describe('BoardTopBar export actions', () => {
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
  });

  beforeEach(() => {
    useBoardStore.setState({
      board: createBoard(),
      followingClientId: null,
    });
  });

  it('uses a custom JSON export handler when one is provided', async () => {
    const onExportJson = vi.fn();

    render(
      <BoardTopBar
        onOpenProperties={() => {}}
        onOpenChat={() => {}}
        propertiesOpen={false}
        chatOpen={false}
        syncStatus={savedSyncStatus}
        titleEditable={false}
        showShare={false}
        onExportJson={onExportJson}
      />,
    );

    fireEvent.click(screen.getByTestId('FileDownloadIcon').closest('button')!);
    fireEvent.click(await screen.findByText('board.exportJson'));

    expect(onExportJson).toHaveBeenCalledOnce();
  });

  it('uses a custom PNG export handler when one is provided', async () => {
    const onExportPng = vi.fn();

    render(
      <BoardTopBar
        onOpenProperties={() => {}}
        onOpenChat={() => {}}
        propertiesOpen={false}
        chatOpen={false}
        syncStatus={savedSyncStatus}
        titleEditable={false}
        showShare={false}
        onExportPng={onExportPng}
      />,
    );

    fireEvent.click(screen.getByTestId('FileDownloadIcon').closest('button')!);
    fireEvent.click(await screen.findByText('board.exportPng'));

    expect(onExportPng).toHaveBeenCalledOnce();
  });
});

function createBoard(): Board {
  return {
    id: 'board-1',
    ownerId: 'owner-1',
    title: 'Shared Board',
    labelOutlineEnabled: true,
    arrowOutlineEnabled: true,
    surfaceColor: null,
    themeKey: null,
    enabledIconGroups: [],
    customColors: [],
    recentColors: [],
    stickyNotePresets: [],
    members: [],
    elements: [],
    comments: [],
    snapshots: [],
    visibility: BoardVisibility.Public,
    shareLinkToken: 'share-token',
    sharedAllowAnonymousEditing: true,
    sharePasswordHash: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
