import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ThemeProvider, createTheme, CssBaseline, Box, CircularProgress } from '@mui/material';
import { getThemes } from './api/themes';
import { useThemeStore } from './stores/themeStore';
import { useAuthStore } from './stores/authStore';
import { AppLayout } from './components/Layout/AppLayout';
import { AdminRoute } from './components/Layout/AdminRoute';
import { ProtectedRoute } from './components/Layout/ProtectedRoute';
import type { ThemeDefinition } from './types/models';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const LoginPage = lazy(() => import('./features/auth/LoginPage').then((module) => ({ default: module.LoginPage })));
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const SettingsPage = lazy(() => import('./features/admin/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const ProfilePage = lazy(() => import('./features/profile/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const WhiteboardEditor = lazy(() => import('./features/whiteboard/WhiteboardEditor').then((module) => ({ default: module.WhiteboardEditor })));
const SharedBoardView = lazy(() => import('./features/sharing/SharedBoardView').then((module) => ({ default: module.SharedBoardView })));
const UsersPage = lazy(() => import('./features/admin/UsersPage').then((module) => ({ default: module.UsersPage })));

function RouteLoadingFallback() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <CircularProgress />
    </Box>
  );
}

function AppRoutes() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrating = useAuthStore((s) => s.isHydrating);
  const currentUserId = useAuthStore((s) => s.user?.id ?? 'current-user');

  if (isHydrating) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route path="/shared/:token" element={<SharedBoardView />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage key={currentUserId} />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route element={<AdminRoute />}>
              <Route path="/admin/users" element={<UsersPage />} />
              <Route path="/admin/settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="/board/:id" element={<WhiteboardEditor />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

const fallbackTheme: ThemeDefinition = {
  key: 'light',
  name: 'Light',
  isDarkMode: false,
  isEnabled: true,
  fontFamily: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
  cssVariables: {
    '--orim-board-toolbar-bg': 'rgba(255, 255, 255, 0.94)',
    '--orim-board-toolbar-border': 'rgba(15, 23, 42, 0.12)',
    '--orim-board-toolbar-text': '#24292F',
  },
  palette: {
    primary: '#6E40C9',
    secondary: '#1F8A5B',
    tertiary: '#EA580C',
    appbarBackground: '#0D1117',
    appbarText: '#FFFFFF',
    background: '#F6F8FA',
    surface: '#FFFFFF',
    drawerBackground: '#161B22',
    drawerText: '#C9D1D9',
    drawerIcon: '#C9D1D9',
    textPrimary: '#24292F',
    textSecondary: '#57606A',
    linesDefault: '#D0D7DE',
    success: '#1F8A5B',
    warning: '#EA580C',
    info: '#6E40C9',
  },
  boardDefaults: {
    surfaceColor: '#FFFFFF',
    gridColor: '#EEF2F7',
    shapeFillColor: '#FFFFFF',
    strokeColor: '#0F172A',
    iconColor: '#0F172A',
    selectionColor: '#2563EB',
    selectionTintRgb: '37, 99, 235',
    handleSurfaceColor: '#FFFFFF',
    dockTargetColor: '#0F766E',
    themeColors: ['#6E40C9', '#1F8A5B', '#EA580C', '#0F172A', '#2563EB', '#FFFFFF', '#F59E0B', '#0EA5E9'],
  },
};

function ThemedApplication() {
  const themeKey = useThemeStore((s) => s.themeKey);
  const setTheme = useThemeStore((s) => s.setTheme);
  const { data: themes = [] } = useQuery({
    queryKey: ['themes'],
    queryFn: getThemes,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (themes.length > 0 && !themes.some((theme) => theme.key === themeKey)) {
      setTheme(themes[0].key);
    }
  }, [setTheme, themeKey, themes]);

  const activeTheme = themes.find((theme) => theme.key === themeKey) ?? themes[0] ?? fallbackTheme;

  useEffect(() => {
    const root = document.documentElement;
    const cssVariables = activeTheme.cssVariables ?? {};

    for (const [key, value] of Object.entries(cssVariables)) {
      root.style.setProperty(key, value);
    }

    return () => {
      for (const key of Object.keys(cssVariables)) {
        root.style.removeProperty(key);
      }
    };
  }, [activeTheme]);

  const theme = createTheme({
    typography: {
      fontFamily: activeTheme.fontFamily.join(', '),
    },
    palette: {
      mode: activeTheme.isDarkMode ? 'dark' : 'light',
      primary: { main: activeTheme.palette.primary },
      secondary: { main: activeTheme.palette.secondary },
      success: { main: activeTheme.palette.success ?? activeTheme.palette.secondary },
      warning: { main: activeTheme.palette.warning ?? activeTheme.palette.tertiary },
      info: { main: activeTheme.palette.info ?? activeTheme.palette.primary },
      background: {
        default: activeTheme.palette.background,
        paper: activeTheme.palette.surface,
      },
      text: {
        primary: activeTheme.palette.textPrimary,
        secondary: activeTheme.palette.textSecondary,
      },
    },
    shape: { borderRadius: 10 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '*': {
            scrollbarWidth: 'thin',
            scrollbarColor: `${activeTheme.palette.primary}66 transparent`,
          },
          '*::-webkit-scrollbar': {
            width: '6px',
            height: '6px',
          },
          '*::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: `${activeTheme.palette.primary}66`,
            borderRadius: '3px',
          },
          '*::-webkit-scrollbar-thumb:hover': {
            backgroundColor: `${activeTheme.palette.primary}aa`,
          },
          '*::-webkit-scrollbar-corner': {
            background: 'transparent',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: activeTheme.palette.appbarBackground,
            color: activeTheme.palette.appbarText,
            '& .MuiIconButton-root': {
              color: activeTheme.palette.appbarText,
            },
            '& .MuiSvgIcon-root': {
              color: 'inherit',
            },
            '& .MuiChip-root': {
              color: activeTheme.palette.appbarText,
              borderColor: `${activeTheme.palette.appbarText}33`,
            },
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            background: activeTheme.palette.drawerBackground,
            color: activeTheme.palette.drawerText,
            '& .MuiListItemIcon-root': {
              color: activeTheme.palette.drawerIcon,
            },
          },
        },
      },
    },
  });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemedApplication />
    </QueryClientProvider>
  );
}
