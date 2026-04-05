import { useState, type FocusEvent as ReactFocusEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import {
  Divider,
  ListItemIcon,
  Menu,
  MenuItem,
  SvgIcon,
  Typography,
} from '@mui/material';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { mdiLayersOutline } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { ZOrderMenuItems } from '../ZOrderMenuItems';
import {
  type ZOrderAction,
  type ZOrderAvailability,
} from '../zOrder';

export type WhiteboardContextMenuAction =
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'edit-text'
  | 'group'
  | 'ungroup'
  | 'select-all'
  | 'lock'
  | 'unlock'
  | ZOrderAction;

interface WhiteboardContextMenuProps {
  position: { left: number; top: number } | null;
  hasSelection: boolean;
  canPaste: boolean;
  canInlineEditSelection: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  isLocked: boolean;
  canDeleteSelection: boolean;
  canSelectAll: boolean;
  zOrderAvailability: ZOrderAvailability;
  onClose: () => void;
  onAction: (action: WhiteboardContextMenuAction) => void;
}

interface ActionMenuItemProps {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
}

function ActionMenuItem({
  icon,
  label,
  shortcut,
  disabled = false,
  onClick,
  onMouseEnter,
}: ActionMenuItemProps) {
  return (
    <MenuItem disabled={disabled} onClick={onClick} onMouseEnter={onMouseEnter}>
      <ListItemIcon sx={{ minWidth: 34 }}>{icon}</ListItemIcon>
      <Typography variant="body2" sx={{ flex: 1 }}>
        {label}
      </Typography>
      {shortcut ? (
        <Typography variant="caption" color="text.secondary">
          {shortcut}
        </Typography>
      ) : null}
    </MenuItem>
  );
}

export function WhiteboardContextMenu({
  position,
  hasSelection,
  canPaste,
  canInlineEditSelection,
  isLocked,
  canDeleteSelection,
  canGroup,
  canUngroup,
  canSelectAll,
  zOrderAvailability,
  onClose,
  onAction,
}: WhiteboardContextMenuProps) {
  const { t } = useTranslation();
  const [arrangeAnchorEl, setArrangeAnchorEl] = useState<HTMLElement | null>(null);

  const hasArrangeActions = Object.values(zOrderAvailability).some(Boolean);

  const closeAllMenus = () => {
    setArrangeAnchorEl(null);
    onClose();
  };

  const handleAction = (action: WhiteboardContextMenuAction) => {
    closeAllMenus();
    onAction(action);
  };

  const closeArrangeMenu = () => {
    setArrangeAnchorEl(null);
  };

  const openArrangeMenu = (event: ReactMouseEvent<HTMLElement> | ReactFocusEvent<HTMLElement>) => {
    setArrangeAnchorEl(event.currentTarget);
  };

  return (
    <>
      <Menu
        open={position != null}
        onClose={closeAllMenus}
        anchorReference="anchorPosition"
        anchorPosition={position == null ? undefined : position}
      >
        {hasSelection ? (
          <>
            <ActionMenuItem
              icon={<ContentCutIcon fontSize="small" />}
              label={t('contextMenu.cut')}
              shortcut="Cmd/Ctrl + X"
              disabled={!canDeleteSelection}
              onClick={() => handleAction('cut')}
              onMouseEnter={closeArrangeMenu}
            />
            <ActionMenuItem
              icon={<ContentCopyIcon fontSize="small" />}
              label={t('contextMenu.copy')}
              shortcut="Cmd/Ctrl + C"
              onClick={() => handleAction('copy')}
              onMouseEnter={closeArrangeMenu}
            />
            <ActionMenuItem
              icon={<ContentPasteIcon fontSize="small" />}
              label={t('contextMenu.paste')}
              shortcut="Cmd/Ctrl + V"
              disabled={!canPaste}
              onClick={() => handleAction('paste')}
              onMouseEnter={closeArrangeMenu}
            />
            <ActionMenuItem
              icon={<FileCopyIcon fontSize="small" />}
              label={t('contextMenu.duplicate')}
              shortcut="Cmd/Ctrl + D"
              onClick={() => handleAction('duplicate')}
              onMouseEnter={closeArrangeMenu}
            />
            <Divider />
            {canInlineEditSelection ? (
              <ActionMenuItem
                icon={<EditIcon fontSize="small" />}
                label={t('contextMenu.editText')}
                shortcut="Enter"
                onClick={() => handleAction('edit-text')}
                onMouseEnter={closeArrangeMenu}
              />
            ) : null}
            {canGroup ? (
              <ActionMenuItem
                icon={<GroupWorkIcon fontSize="small" />}
                label={t('tools.group')}
                shortcut="Cmd/Ctrl + G"
                onClick={() => handleAction('group')}
                onMouseEnter={closeArrangeMenu}
              />
            ) : null}
            {canUngroup ? (
              <ActionMenuItem
                icon={<CallSplitIcon fontSize="small" />}
                label={t('tools.ungroup')}
                shortcut="Cmd/Ctrl + Shift + G"
                onClick={() => handleAction('ungroup')}
                onMouseEnter={closeArrangeMenu}
              />
            ) : null}
            <MenuItem
              disabled={!hasArrangeActions}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openArrangeMenu(event);
              }}
              onMouseEnter={openArrangeMenu}
              onFocus={openArrangeMenu}
            >
              <ListItemIcon sx={{ minWidth: 34 }}>
                <SvgIcon fontSize="small">
                  <path d={mdiLayersOutline} />
                </SvgIcon>
              </ListItemIcon>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {t('tools.arrange')}
              </Typography>
              <KeyboardArrowRightIcon fontSize="small" color="action" />
            </MenuItem>
            <ActionMenuItem
              icon={isLocked ? <LockOpenIcon fontSize="small" /> : <LockIcon fontSize="small" />}
              label={isLocked ? t('contextMenu.unlock') : t('contextMenu.lock')}
              shortcut="Ctrl + L"
              onClick={() => handleAction(isLocked ? 'unlock' : 'lock')}
              onMouseEnter={closeArrangeMenu}
            />
            <Divider />
            <ActionMenuItem
              icon={<DeleteIcon fontSize="small" />}
              label={t('tools.delete')}
              shortcut="Delete"
              disabled={!canDeleteSelection}
              onClick={() => handleAction('delete')}
              onMouseEnter={closeArrangeMenu}
            />
          </>
        ) : (
          <>
            <ActionMenuItem
              icon={<ContentPasteIcon fontSize="small" />}
              label={t('contextMenu.paste')}
              shortcut="Cmd/Ctrl + V"
              disabled={!canPaste}
              onClick={() => handleAction('paste')}
              onMouseEnter={closeArrangeMenu}
            />
            {canSelectAll ? (
              <ActionMenuItem
                icon={<SelectAllIcon fontSize="small" />}
                label={t('contextMenu.selectAll')}
                shortcut="Cmd/Ctrl + A"
                onClick={() => handleAction('select-all')}
                onMouseEnter={closeArrangeMenu}
              />
            ) : null}
          </>
        )}
      </Menu>

      <Menu
        anchorEl={arrangeAnchorEl}
        open={Boolean(arrangeAnchorEl) && hasArrangeActions}
        onClose={closeArrangeMenu}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        MenuListProps={{
          onMouseLeave: closeArrangeMenu,
        }}
      >
        <ZOrderMenuItems
          availability={zOrderAvailability}
          onSelect={(action) => handleAction(action)}
        />
      </Menu>
    </>
  );
}
