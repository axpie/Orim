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
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { getUserImages, uploadUserImage, deleteUserImage } from '../../api/images';
import type { UserImageInfo } from '../../types/models';

interface ImageLibraryDialogProps {
  open: boolean;
  onClose: () => void;
  onInsertImage: (imageUrl: string, fileName: string) => void;
}

export function ImageLibraryDialog({ open, onClose, onInsertImage }: ImageLibraryDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['user-images'],
    queryFn: getUserImages,
    enabled: open,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadUserImage(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-images'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUserImage(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-images'] }),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
      e.target.value = '';
    }
  };

  const handleInsert = (image: UserImageInfo) => {
    onInsertImage(image.url, image.fileName);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {t('images.library')}
          <Button
            variant="outlined"
            startIcon={uploadMutation.isPending ? <CircularProgress size={16} /> : <CloudUploadIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            size="small"
          >
            {t('images.upload')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
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
        ) : images.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary">{t('images.noImages')}</Typography>
            <Button
              variant="contained"
              startIcon={<CloudUploadIcon />}
              onClick={() => fileInputRef.current?.click()}
              sx={{ mt: 2 }}
            >
              {t('images.uploadFirst')}
            </Button>
          </Box>
        ) : (
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {images.map((img) => (
              <Grid size={{ xs: 6, sm: 4, md: 3 }} key={img.id}>
                <Box
                  sx={{
                    position: 'relative',
                    aspectRatio: '1',
                    borderRadius: 1,
                    overflow: 'hidden',
                    border: '2px solid',
                    borderColor: 'divider',
                    cursor: 'pointer',
                    '&:hover': { borderColor: 'primary.main' },
                    '&:hover .img-actions': { opacity: 1 },
                  }}
                  onClick={() => handleInsert(img)}
                >
                  <Box
                    component="img"
                    src={img.url}
                    alt={img.fileName}
                    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <Box
                    className="img-actions"
                    sx={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      opacity: 0,
                      transition: 'opacity 0.15s',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Tooltip title={t('images.delete')}>
                      <IconButton
                        size="small"
                        onClick={() => deleteMutation.mutate(img.id)}
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
                      {img.fileName}
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
