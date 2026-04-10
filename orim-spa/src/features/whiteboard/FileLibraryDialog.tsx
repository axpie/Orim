import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  SvgIcon,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { mdiFileDocumentOutline, mdiFileTableOutline, mdiFileCodeOutline, mdiFileOutline } from '@mdi/js';
import { getBoardFiles, uploadBoardFile, deleteBoardFile } from '../../api/files';
import type { BoardFileInfo } from '../../types/models';

interface FileLibraryDialogProps {
  open: boolean;
  boardId: string;
  onClose: () => void;
  onInsertFile: (file: BoardFileInfo) => void;
}

function isImageType(contentType: string): boolean {
  return contentType.startsWith('image/');
}

function FileTypeIcon({ contentType }: { contentType: string }) {
  if (contentType === 'application/pdf') {
    return <PictureAsPdfIcon sx={{ fontSize: 40, color: '#e53935' }} />;
  }
  if (contentType.startsWith('text/')) {
    return <SvgIcon sx={{ fontSize: 40, color: '#1565c0' }}><path d={mdiFileDocumentOutline} /></SvgIcon>;
  }
  if (contentType.includes('spreadsheet') || contentType.includes('excel') || contentType.includes('csv')) {
    return <SvgIcon sx={{ fontSize: 40, color: '#2e7d32' }}><path d={mdiFileTableOutline} /></SvgIcon>;
  }
  if (contentType.includes('json') || contentType.includes('xml') || contentType.includes('javascript')) {
    return <SvgIcon sx={{ fontSize: 40, color: '#6a1b9a' }}><path d={mdiFileCodeOutline} /></SvgIcon>;
  }
  return <SvgIcon sx={{ fontSize: 40, color: '#546e7a' }}><path d={mdiFileOutline} /></SvgIcon>;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileLibraryDialog({ open, boardId, onClose, onInsertFile }: FileLibraryDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['board-files', boardId],
    queryFn: () => getBoardFiles(boardId),
    enabled: open,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadBoardFile(boardId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['board-files', boardId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => deleteBoardFile(boardId, fileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['board-files', boardId] }),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
      e.target.value = '';
    }
  };

  const handleInsert = (file: BoardFileInfo) => {
    onInsertFile(file);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {t('files.library')}
          <Button
            variant="outlined"
            startIcon={uploadMutation.isPending ? <CircularProgress size={16} /> : <CloudUploadIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            size="small"
          >
            {t('files.upload')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={handleFileChange}
          />
        </Box>
      </DialogTitle>
      <DialogContent>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : files.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <InsertDriveFileOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary">{t('files.noFiles')}</Typography>
            <Button
              variant="contained"
              startIcon={<CloudUploadIcon />}
              onClick={() => fileInputRef.current?.click()}
              sx={{ mt: 2 }}
            >
              {t('files.uploadFirst')}
            </Button>
          </Box>
        ) : (
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {files.map((file) => (
              <Grid size={{ xs: 6, sm: 4, md: 3 }} key={file.id}>
                <Box
                  sx={{
                    position: 'relative',
                    aspectRatio: '1',
                    borderRadius: 1,
                    overflow: 'hidden',
                    border: '2px solid',
                    borderColor: 'divider',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    '&:hover': { borderColor: 'primary.main' },
                    '&:hover .file-actions': { opacity: 1 },
                  }}
                  onClick={() => handleInsert(file)}
                >
                  {isImageType(file.contentType) ? (
                    <Box
                      component="img"
                      src={file.url}
                      alt={file.fileName}
                      sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <Box
                      sx={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 0.5,
                        p: 1,
                        bgcolor: 'action.hover',
                      }}
                    >
                      <FileTypeIcon contentType={file.contentType} />
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: '100%' }}>
                        {formatFileSize(file.size)}
                      </Typography>
                    </Box>
                  )}
                  <Box
                    className="file-actions"
                    sx={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      opacity: 0,
                      transition: 'opacity 0.15s',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Tooltip title={t('files.delete')}>
                      <IconButton
                        size="small"
                        onClick={() => deleteMutation.mutate(file.id)}
                        sx={{ bgcolor: 'background.paper' }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box
                    sx={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      p: 0.5,
                      bgcolor: 'rgba(0,0,0,0.5)',
                    }}
                  >
                    <Typography variant="caption" color="white" noWrap>
                      {file.fileName}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
      </DialogActions>
    </Dialog>
  );
}
