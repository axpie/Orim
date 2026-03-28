import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import MenuIcon from '@mui/icons-material/Menu';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import CheckIcon from '@mui/icons-material/Check';
import PaletteIcon from '@mui/icons-material/Palette';
import TranslateIcon from '@mui/icons-material/Translate';
import LogoutIcon from '@mui/icons-material/Logout';
import { getThemes } from '../../api/themes';
import { OrimLogo } from '../Brand/OrimLogo';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import { UserRole } from '../../types/models';

const DRAWER_WIDTH = 240;

export function AppLayout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const themeKey = useThemeStore((s) => s.themeKey);
  const setTheme = useThemeStore((s) => s.setTheme);
  const { data: themes = [] } = useQuery({
    queryKey: ['themes'],
    queryFn: getThemes,
    staleTime: 60_000,
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [themeAnchorEl, setThemeAnchorEl] = useState<null | HTMLElement>(null);

  const activeTheme = themes.find((theme) => theme.key === themeKey) ?? themes[0] ?? null;

  const handleLogout = () => {
    setAnchorEl(null);
    logout();
    navigate('/login');
  };

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'de' ? 'en' : 'de');
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
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

          <Tooltip title={t('app.language')}>
            <IconButton color="inherit" onClick={toggleLanguage}>
              <TranslateIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title={activeTheme?.name ?? t('app.theme')}>
            <IconButton color="inherit" onClick={(e) => setThemeAnchorEl(e.currentTarget)}>
              <PaletteIcon />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={themeAnchorEl}
            open={Boolean(themeAnchorEl)}
            onClose={() => setThemeAnchorEl(null)}
          >
            {themes.map((theme) => (
              <MenuItem
                key={theme.key}
                selected={theme.key === themeKey}
                onClick={() => {
                  setTheme(theme.key);
                  setThemeAnchorEl(null);
                }}
              >
                <ListItemIcon>
                  {theme.key === themeKey ? <CheckIcon fontSize="small" /> : <Box sx={{ width: 20 }} />}
                </ListItemIcon>
                {theme.name}
              </MenuItem>
            ))}
          </Menu>

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
            <ListItemButton onClick={() => navigate('/admin/users')}>
              <ListItemIcon><PeopleIcon /></ListItemIcon>
              <ListItemText primary={t('app.users')} />
            </ListItemButton>
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
            <ListItemButton onClick={() => { navigate('/admin/users'); setDrawerOpen(false); }}>
              <ListItemIcon><PeopleIcon /></ListItemIcon>
              <ListItemText primary={t('app.users')} />
            </ListItemButton>
          )}
        </List>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          mt: 8,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
