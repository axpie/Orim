import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
  Divider,
  Tooltip,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import PaletteIcon from '@mui/icons-material/Palette';
import MenuIcon from '@mui/icons-material/Menu';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import { OrimLogo } from '../Brand/OrimLogo';
import { AppSettingsDialog } from '../dialogs/AppSettingsDialog';
import { useAuthStore } from '../../stores/authStore';
import { UserRole } from '../../types/models';

const DRAWER_WIDTH = 240;

export function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleLogout = () => {
    setAnchorEl(null);
    logout();
    navigate('/login');
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ pt: 'env(safe-area-inset-top)' }}>
          <IconButton
            edge="start"
            color="inherit"
            onClick={() => setDrawerOpen(!drawerOpen)}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1, cursor: 'pointer' }} onClick={() => navigate('/')}>
            <OrimLogo textColor="inherit" />
          </Box>

          <Tooltip title={t('app.settings')}>
            <IconButton color="inherit" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon />
            </IconButton>
          </Tooltip>

          <IconButton color="inherit" onClick={(e) => setAnchorEl(e.currentTarget)}>
            <AccountCircleIcon />
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
          >
            <MenuItem disabled>
              <Typography variant="body2">{user?.username}</Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              {t('app.logout')}
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <List>
          <ListItemButton onClick={() => navigate('/')}>
            <ListItemIcon><DashboardIcon /></ListItemIcon>
            <ListItemText primary={t('app.dashboard')} />
          </ListItemButton>
          {user?.role === UserRole.Admin && (
            <>
              <ListItemButton onClick={() => navigate('/admin/users')}>
                <ListItemIcon><PeopleIcon /></ListItemIcon>
                <ListItemText primary={t('app.users')} />
              </ListItemButton>
              <ListItemButton onClick={() => navigate('/admin/settings')}>
                <ListItemIcon><PaletteIcon /></ListItemIcon>
                <ListItemText primary={t('admin.orimSettings')} />
              </ListItemButton>
            </>
          )}
        </List>
      </Drawer>

      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH },
        }}
      >
        <Toolbar />
        <List>
          <ListItemButton onClick={() => { navigate('/'); setDrawerOpen(false); }}>
            <ListItemIcon><DashboardIcon /></ListItemIcon>
            <ListItemText primary={t('app.dashboard')} />
          </ListItemButton>
          {user?.role === UserRole.Admin && (
            <>
              <ListItemButton onClick={() => { navigate('/admin/users'); setDrawerOpen(false); }}>
                <ListItemIcon><PeopleIcon /></ListItemIcon>
                <ListItemText primary={t('app.users')} />
              </ListItemButton>
              <ListItemButton onClick={() => { navigate('/admin/settings'); setDrawerOpen(false); }}>
                <ListItemIcon><PaletteIcon /></ListItemIcon>
                <ListItemText primary={t('admin.orimSettings')} />
              </ListItemButton>
            </>
          )}
        </List>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          mt: 'calc(64px + env(safe-area-inset-top))',
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          pb: 'calc(24px + env(safe-area-inset-bottom))',
        }}
      >
        <Outlet />
      </Box>

      <AppSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Box>
  );
}
