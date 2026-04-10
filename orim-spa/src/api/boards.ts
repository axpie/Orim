import client from './client';
import { BoardVisibility } from '../types/models';
import type {
  Board,
  BoardFolder,
  BoardSummary,
  BoardTemplateDefinition,
  BoardMember,
  BoardRole,
  BoardSnapshot,
  AssistantResponse,
  ChatMessageEntry,
  BoardOperationHistoryResponse,
  CreateBoardRequest,
  ImportBoardRequest,
  User,
} from '../types/models';
import { ensureBoardElementsTypeDiscriminators } from '../features/whiteboard/boardElementTransport';

// --- Board CRUD ---

export async function getBoards(): Promise<BoardSummary[]> {
  const { data } = await client.get<BoardSummary[]>('/api/boards');
  return data;
}

export async function getBoard(id: string): Promise<Board> {
  const { data } = await client.get<Board>(`/api/boards/${id}`);
  return data;
}

export async function getBoardHistory(id: string, since = 0, limit = 100): Promise<BoardOperationHistoryResponse> {
  const { data } = await client.get<BoardOperationHistoryResponse>(`/api/boards/${id}/history`, {
    params: { since, limit },
  });
  return data;
}

export async function createBoard(request: CreateBoardRequest): Promise<Board> {
  const { data } = await client.post<Board>('/api/boards', {
    title: request.title,
    templateId: request.templateId,
    themeKey: request.themeKey,
  });

  if (request.visibility && request.visibility !== BoardVisibility.Private) {
    return setVisibility(data.id, request.visibility);
  }

  return data;
}

export async function saveBoard(
  id: string,
  board: Pick<Board, 'title' | 'labelOutlineEnabled' | 'arrowOutlineEnabled' | 'gridStyle' | 'surfaceColor' | 'themeKey' | 'enabledIconGroups' | 'customColors' | 'recentColors' | 'stickyNotePresets' | 'stylePresetState' | 'elements'>,
  sourceClientId?: string | null,
  changeKind: 'Content' | 'Metadata' = 'Content',
): Promise<Board> {
  const { data } = await client.put<Board>(`/api/boards/${id}`, {
    title: board.title,
    labelOutlineEnabled: board.labelOutlineEnabled,
    arrowOutlineEnabled: board.arrowOutlineEnabled,
    gridStyle: board.gridStyle ?? null,
    surfaceColor: board.surfaceColor ?? null,
    themeKey: board.themeKey ?? null,
    enabledIconGroups: board.enabledIconGroups ?? null,
    customColors: board.customColors,
    recentColors: board.recentColors,
    stickyNotePresets: board.stickyNotePresets,
    stylePresetState: board.stylePresetState ?? null,
    elements: ensureBoardElementsTypeDiscriminators(board.elements),
    sourceClientId: sourceClientId ?? null,
    changeKind,
  });
  return data;
}

export async function renameBoard(id: string, title: string, sourceClientId?: string | null): Promise<Board> {
  const { data } = await client.put<Board>(`/api/boards/${id}/title`, {
    title,
    sourceClientId: sourceClientId ?? null,
  });
  return data;
}

export async function replaceBoardContent(id: string, board: Board): Promise<Board> {
  const { data } = await client.put<Board>(`/api/boards/${id}/content`, board);
  return data;
}

export async function deleteBoard(id: string): Promise<void> {
  await client.delete(`/api/boards/${id}`);
}

export async function getTemplates(): Promise<BoardTemplateDefinition[]> {
  const { data } = await client.get<BoardTemplateDefinition[]>('/api/boards/templates');
  return data;
}

// --- Sharing ---

export async function setVisibility(
  id: string,
  visibility: BoardVisibility,
  allowAnonymousEditing = false
): Promise<Board> {
  const { data } = await client.put<Board>(`/api/boards/${id}/visibility`, {
    visibility,
    allowAnonymousEditing,
  });
  return data;
}

export async function generateShareToken(id: string): Promise<{ shareLinkToken: string }> {
  const { data } = await client.post<{ shareLinkToken: string }>(`/api/boards/${id}/share-token`);
  return data;
}

export async function getSharedBoard(token: string): Promise<Board | { requiresPassword: boolean; boardId: string; title: string }> {
  const { data } = await client.get(`/api/boards/shared/${token}`);
  return data;
}

export async function validateSharePassword(token: string, password: string): Promise<Board> {
  const { data } = await client.post<Board>(`/api/boards/shared/${token}/validate-password`, { password });
  return data;
}

export async function replaceSharedBoardContent(token: string, board: Board, password?: string | null, sourceClientId?: string | null): Promise<Board> {
  const { data } = await client.put<Board>(`/api/boards/shared/${token}/content`, {
    board: {
      ...board,
      elements: ensureBoardElementsTypeDiscriminators(board.elements),
    },
    password: password ?? null,
    sourceClientId: sourceClientId ?? null,
  });
  return data;
}

export async function getSharedBoardHistory(
  token: string,
  password?: string | null,
  since = 0,
  limit = 100,
): Promise<BoardOperationHistoryResponse> {
  const { data } = await client.post<BoardOperationHistoryResponse>(`/api/boards/shared/${token}/history`, {
    password: password ?? null,
    since,
    limit,
  });
  return data;
}

export async function exportSharedBoardJson(token: string, password?: string | null): Promise<string> {
  const { data } = await client.post<string>(`/api/boards/shared/${token}/export/json`, {
    password: password ?? null,
  });
  return typeof data === 'string' ? data : JSON.stringify(data);
}

export async function setSharePassword(id: string, password: string | null): Promise<void> {
  await client.post(`/api/boards/${id}/share-password`, { password });
}

// --- Members ---

export async function addMember(id: string, username: string, role: BoardRole): Promise<BoardMember[]> {
  const { data } = await client.post<BoardMember[]>(`/api/boards/${id}/members`, { username, role });
  return data;
}

export async function searchShareableUsers(id: string, query: string): Promise<User[]> {
  const { data } = await client.get<User[]>(`/api/boards/${id}/shareable-users`, {
    params: { query },
  });
  return data;
}

export async function removeMember(id: string, userId: string): Promise<void> {
  await client.delete(`/api/boards/${id}/members/${userId}`);
}

export async function updateMemberRole(id: string, userId: string, role: BoardRole): Promise<void> {
  await client.put(`/api/boards/${id}/members/${userId}/role`, { role });
}

// --- Snapshots ---

export async function createSnapshot(id: string, name?: string): Promise<BoardSnapshot> {
  const { data } = await client.post<BoardSnapshot>(`/api/boards/${id}/snapshots`, { name });
  return data;
}

export async function restoreSnapshot(id: string, snapshotId: string): Promise<Board> {
  const { data } = await client.post<Board>(`/api/boards/${id}/snapshots/${snapshotId}/restore`);
  return data;
}

// --- Import / Export ---

export async function importBoard(request: ImportBoardRequest): Promise<Board> {
  const { data } = await client.post<Board>('/api/boards/import', request);
  return data;
}

export async function exportBoardJson(id: string): Promise<string> {
  const { data } = await client.get<string>(`/api/boards/${id}/export/json`);
  return typeof data === 'string' ? data : JSON.stringify(data);
}

export async function exportBoardZip(id: string): Promise<Blob> {
  const { data } = await client.get(`/api/boards/${id}/export/zip`, { responseType: 'blob' });
  return data;
}

export async function importBoardZip(file: File, title?: string): Promise<Board> {
  const formData = new FormData();
  formData.append('file', file);
  if (title) formData.append('title', title);
  const { data } = await client.post<Board>('/api/boards/import/zip', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function exportUserZip(): Promise<Blob> {
  const { data } = await client.get('/api/user/export/zip', { responseType: 'blob' });
  return data;
}

// --- AI Assistant ---

export async function sendAssistantMessage(
  id: string,
  messages: ChatMessageEntry[]
): Promise<AssistantResponse> {
  const { data } = await client.post<AssistantResponse>(`/api/boards/${id}/assistant`, { messages });
  return data;
}

// --- Presence ---

export async function sendPresenceLeave(boardId: string, clientId: string): Promise<void> {
  await client.post('/api/presence/leave', { boardId, clientId });
}

// --- Folders ---

export async function getFolders(): Promise<BoardFolder[]> {
  const { data } = await client.get<BoardFolder[]>('/api/boards/folders');
  return data;
}

export async function createFolder(name: string, parentFolderId?: string): Promise<BoardFolder> {
  const { data } = await client.post<BoardFolder>('/api/boards/folders', { name, parentFolderId });
  return data;
}

export async function updateFolder(id: string, name: string): Promise<void> {
  await client.put(`/api/boards/folders/${id}`, { name });
}

export async function deleteFolder(id: string, deleteBoards = false): Promise<void> {
  await client.delete(`/api/boards/folders/${id}`, { params: { deleteBoards } });
}

export async function setBoardFolder(boardId: string, folderId: string | null): Promise<void> {
  await client.put(`/api/boards/${boardId}/folder`, { folderId });
}

export async function setBoardTags(boardId: string, tags: string[]): Promise<void> {
  await client.put(`/api/boards/${boardId}/tags`, { tags });
}
