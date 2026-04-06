import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Paper, TextField, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import type { BoardElement } from '../../../types/models';
import { useBoardStore } from '../store/boardStore';

function getSearchableText(el: BoardElement): string {
  const parts: string[] = [];
  if (el.label) parts.push(el.label);
  if (el.$type === 'text' || el.$type === 'sticky') parts.push(el.text);
  if (el.$type === 'icon') parts.push(el.iconName);
  return parts.join(' ');
}

export interface CanvasSearchProps {
  onClose: () => void;
}

export function CanvasSearch({ onClose }: CanvasSearchProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const elements = useBoardStore((s) => s.board?.elements ?? []);
  const setSelectedElementIds = useBoardStore((s) => s.setSelectedElementIds);
  const setCamera = useBoardStore((s) => s.setCamera);
  const zoom = useBoardStore((s) => s.zoom);
  const viewportWidth = useBoardStore((s) => s.viewportWidth);
  const viewportHeight = useBoardStore((s) => s.viewportHeight);

  const [searchText, setSearchText] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const matchIds = useMemo(() => {
    if (!searchText.trim()) return [];
    const query = searchText.toLowerCase();
    return elements
      .filter((el) => getSearchableText(el).toLowerCase().includes(query))
      .map((el) => el.id);
  }, [searchText, elements]);

  const centerOnElement = useCallback(
    (element: BoardElement) => {
      const centerX = element.x + element.width / 2;
      const centerY = element.y + element.height / 2;
      const newCameraX = -(centerX * zoom) + viewportWidth / 2;
      const newCameraY = -(centerY * zoom) + viewportHeight / 2;
      setCamera(newCameraX, newCameraY);
    },
    [zoom, viewportWidth, viewportHeight, setCamera],
  );

  const navigateToMatch = useCallback(
    (index: number) => {
      if (matchIds.length === 0) return;
      const id = matchIds[index];
      setSelectedElementIds([id]);
      const el = elements.find((e) => e.id === id);
      if (el) centerOnElement(el);
    },
    [matchIds, elements, setSelectedElementIds, centerOnElement],
  );

  const handleNext = useCallback(() => {
    if (matchIds.length === 0) return;
    const next = (currentMatchIndex + 1) % matchIds.length;
    setCurrentMatchIndex(next);
    navigateToMatch(next);
  }, [currentMatchIndex, matchIds.length, navigateToMatch]);

  const handlePrevious = useCallback(() => {
    if (matchIds.length === 0) return;
    const prev = (currentMatchIndex - 1 + matchIds.length) % matchIds.length;
    setCurrentMatchIndex(prev);
    navigateToMatch(prev);
  }, [currentMatchIndex, matchIds.length, navigateToMatch]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newText = e.target.value;
      setSearchText(newText);
      setCurrentMatchIndex(0);
    },
    [],
  );

  // Navigate to first match when matchIds change
  const matchIdsLengthRef = useRef(0);
  useEffect(() => {
    if (matchIds.length > 0 && matchIds.length !== matchIdsLengthRef.current) {
      navigateToMatch(0);
    }
    matchIdsLengthRef.current = matchIds.length;
  }, [matchIds, navigateToMatch]);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          handlePrevious();
        } else {
          handleNext();
        }
      }
    },
    [onClose, handleNext, handlePrevious],
  );

  const matchDisplay =
    matchIds.length > 0
      ? `${currentMatchIndex + 1} ${t('canvasSearch.of', 'of')} ${matchIds.length}`
      : searchText.trim()
        ? t('canvasSearch.noResults', 'No results')
        : '';

  return (
    <Paper
      elevation={4}
      onKeyDown={handleKeyDown}
      sx={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.5,
        py: 0.5,
        borderRadius: 2,
        bgcolor: 'rgba(var(--mui-palette-background-defaultChannel) / 0.85)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <TextField
        inputRef={inputRef}
        size="small"
        variant="standard"
        placeholder={t('canvasSearch.placeholder', 'Find on canvas…')}
        value={searchText}
        onChange={handleSearchChange}
        slotProps={{ input: { disableUnderline: true } }}
        sx={{ minWidth: 180 }}
      />

      {matchDisplay && (
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', mx: 0.5 }}>
          {matchDisplay}
        </Typography>
      )}

      <IconButton size="small" onClick={handlePrevious} disabled={matchIds.length === 0} aria-label={t('canvasSearch.previous', 'Previous match')}>
        <KeyboardArrowUpIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" onClick={handleNext} disabled={matchIds.length === 0} aria-label={t('canvasSearch.next', 'Next match')}>
        <KeyboardArrowDownIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" onClick={onClose} aria-label={t('common.close', 'Close')}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Paper>
  );
}
