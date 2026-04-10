import { useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { uploadBoardFile } from '../../../api/files';
import { deserializeClipboardPayload, getClipboardElements, readStoredClipboardElements, setClipboardElements } from '../clipboard/clipboardService';
import { cloneElementsForInsertion, isInteractiveTextTarget, KEYBOARD_DUPLICATE_OFFSET } from './canvasUtils';
import { createAddElementsCommand } from '../realtime/localBoardCommands';
import { asOperationPayload, createElementAddedOperation } from '../realtime/boardOperations';
import type { BoardElement, FileElement, TextElement } from '../../../types/models';
import { HorizontalLabelAlignment, ImageFit, VerticalLabelAlignment } from '../../../types/models';
import type { LocalBoardCommand } from '../realtime/localBoardCommands';
import type { BoardOperationPayload } from '../realtime/boardOperations';

const MAX_IMAGE_SIZE = 600;

interface UseCanvasPasteAndDropOptions {
  boardId: string;
  editable: boolean;
  elements: BoardElement[];
  cameraX: number;
  cameraY: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  strokeColor: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  addElement: (element: BoardElement) => void;
  setElements: (elements: BoardElement[]) => void;
  setSelectedElementIds: (ids: string[]) => void;
  onBoardChanged: (changeKind: string, operation?: BoardOperationPayload) => void;
  pushCommand: (command: LocalBoardCommand) => void;
  refreshClipboardAvailability: () => void;
}

async function resolveImageDimensions(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_IMAGE_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
      resolve({ w: Math.round(img.naturalWidth * scale), h: Math.round(img.naturalHeight * scale) });
    };
    img.onerror = () => resolve({ w: 400, h: 300 });
    img.src = src;
  });
}

export function useCanvasPasteAndDrop({
  boardId,
  editable,
  elements,
  cameraX,
  cameraY,
  zoom,
  viewportWidth,
  viewportHeight,
  strokeColor,
  containerRef,
  addElement,
  setElements,
  setSelectedElementIds,
  onBoardChanged,
  pushCommand,
  refreshClipboardAvailability,
}: UseCanvasPasteAndDropOptions) {
  const getCenterWorld = useCallback(() => ({
    x: (-cameraX + viewportWidth / 2) / zoom,
    y: (-cameraY + viewportHeight / 2) / zoom,
  }), [cameraX, cameraY, viewportWidth, viewportHeight, zoom]);

  const getDropWorld = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return getCenterWorld();
    return {
      x: (clientX - rect.left - cameraX) / zoom,
      y: (clientY - rect.top - cameraY) / zoom,
    };
  }, [cameraX, cameraY, containerRef, getCenterWorld, zoom]);

  const insertFileElement = useCallback(async (file: File, cx: number, cy: number) => {
    let fileUrl: string;
    let contentType: string;
    try {
      const info = await uploadBoardFile(boardId, file);
      fileUrl = info.url;
      contentType = info.contentType;
    } catch {
      return;
    }

    const isImage = contentType.startsWith('image/');
    let w = isImage ? 400 : 160;
    let h = isImage ? 300 : 200;

    if (isImage) {
      const dims = await resolveImageDimensions(fileUrl);
      w = dims.w;
      h = dims.h;
    }

    const newElement: FileElement = {
      $type: 'file',
      id: uuidv4(),
      groupId: null,
      x: cx - w / 2,
      y: cy - h / 2,
      width: w,
      height: h,
      zIndex: elements.length + 1,
      rotation: 0,
      label: file.name,
      labelFontSize: null,
      labelColor: null,
      fontFamily: null,
      isBold: false,
      isItalic: false,
      isUnderline: false,
      isStrikethrough: false,
      isLocked: false,
      labelHorizontalAlignment: HorizontalLabelAlignment.Center,
      labelVerticalAlignment: VerticalLabelAlignment.Middle,
      fileUrl,
      fileName: file.name,
      contentType,
      fileSize: file.size,
      opacity: 1,
      imageFit: ImageFit.Uniform,
    };
    addElement(newElement);
    pushCommand(createAddElementsCommand([newElement]));
    setSelectedElementIds([newElement.id]);
    onBoardChanged('add', createElementAddedOperation(newElement));
  }, [boardId, addElement, elements.length, onBoardChanged, pushCommand, setSelectedElementIds]);

  const insertTextElement = useCallback((text: string, cx: number, cy: number) => {
    const DEFAULT_W = 240;
    const DEFAULT_H = 60;
    const newElement: TextElement = {
      $type: 'text',
      id: uuidv4(),
      groupId: null,
      x: cx - DEFAULT_W / 2,
      y: cy - DEFAULT_H / 2,
      width: DEFAULT_W,
      height: DEFAULT_H,
      zIndex: elements.length,
      rotation: 0,
      label: '',
      labelHorizontalAlignment: HorizontalLabelAlignment.Left,
      labelVerticalAlignment: VerticalLabelAlignment.Top,
      text,
      fontSize: 18,
      autoFontSize: false,
      fontFamily: null,
      color: strokeColor,
      isBold: false,
      isItalic: false,
      isUnderline: false,
      isStrikethrough: false,
    };
    addElement(newElement);
    pushCommand(createAddElementsCommand([newElement]));
    setSelectedElementIds([newElement.id]);
    onBoardChanged('add', createElementAddedOperation(newElement));
  }, [addElement, elements.length, onBoardChanged, pushCommand, setSelectedElementIds, strokeColor]);

  const pasteOrimElements = useCallback((sourceElements: BoardElement[]) => {
    const before = [...elements];
    const pasted = cloneElementsForInsertion(
      sourceElements,
      before.length,
      KEYBOARD_DUPLICATE_OFFSET,
      KEYBOARD_DUPLICATE_OFFSET,
    );
    const after = [...before, ...pasted];
    setClipboardElements(structuredClone(sourceElements));
    refreshClipboardAvailability();
    setElements(after);
    pushCommand(createAddElementsCommand(pasted));
    setSelectedElementIds(pasted.map((el) => el.id));
    onBoardChanged('paste', asOperationPayload(pasted.map((el) => createElementAddedOperation(el))));
  }, [elements, onBoardChanged, pushCommand, refreshClipboardAvailability, setElements, setSelectedElementIds]);

  // Paste event handler (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!editable) return;
      if (isInteractiveTextTarget(e.target)) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      // 1. Image in clipboard (e.g. screenshot)
      const imageItem = Array.from(items).find((item) => item.type.startsWith('image/'));
      if (imageItem) {
        e.preventDefault();
        const file = imageItem.getAsFile();
        if (file) {
          const { x, y } = getCenterWorld();
          void insertFileElement(file, x, y);
        }
        return;
      }

      // 2. Text – ORIM elements or plain text
      const textItem = Array.from(items).find((item) => item.type === 'text/plain');
      if (textItem) {
        // Must prevent default synchronously (before async getAsString callback)
        e.preventDefault();
        textItem.getAsString((raw) => {
          // ORIM board elements
          const oimElements = deserializeClipboardPayload(raw);
          if (oimElements && oimElements.length > 0) {
            pasteOrimElements(oimElements);
            return;
          }

          // Fallback: check in-memory / localStorage ORIM clipboard
          const inMemory = getClipboardElements();
          if (inMemory.length > 0) {
            pasteOrimElements(structuredClone(inMemory));
            return;
          }
          const stored = readStoredClipboardElements();
          if (stored && stored.length > 0) {
            pasteOrimElements(stored);
            return;
          }

          // Plain text → insert as text element
          const trimmed = raw.trim();
          if (trimmed.length > 0) {
            const { x, y } = getCenterWorld();
            insertTextElement(trimmed, x, y);
          }
        });
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [editable, getCenterWorld, insertFileElement, insertTextElement, pasteOrimElements]);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!editable) return;
    const hasFiles = e.dataTransfer.types.includes('Files');
    const hasText = e.dataTransfer.types.includes('text/plain') || e.dataTransfer.types.includes('text/uri-list');
    if (hasFiles || hasText) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, [editable]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!editable) return;
    e.preventDefault();

    const { x, y } = getDropWorld(e.clientX, e.clientY);

    // Files — any type
    if (e.dataTransfer.files.length > 0) {
      let offsetX = 0;
      for (const file of Array.from(e.dataTransfer.files)) {
        void insertFileElement(file, x + offsetX, y);
        offsetX += 20;
      }
      return;
    }

    // Plain text
    const text = e.dataTransfer.getData('text/plain').trim();
    if (text.length > 0) {
      insertTextElement(text, x, y);
    }
  }, [editable, getDropWorld, insertFileElement, insertTextElement]);

  return { onDragOver, onDrop };
}
