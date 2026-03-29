import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { getThemes } from './api/themes';
import { useThemeStore } from './stores/themeStore';
import { useAuthStore } from './stores/authStore';
import { AppLayout } from './components/Layout/AppLayout';
import { AdminRoute } from './components/Layout/AdminRoute';
import { ProtectedRoute } from './components/Layout/ProtectedRoute';
import { LoginPage } from './features/auth/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { SettingsPage } from './features/admin/SettingsPage';
import { WhiteboardEditor } from './features/whiteboard/WhiteboardEditor';
import { SharedBoardView } from './features/sharing/SharedBoardView';
import { UsersPage } from './features/admin/UsersPage';
import type { ThemeDefinition } from './types/models';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function AppRoutes() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route path="/shared/:token" element={<SharedBoardView />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route element={<AdminRoute />}>
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="/board/:id" element={<WhiteboardEditor />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const fallbackTheme: ThemeDefinition = {
  key: 'light',
  name: 'Light',
  isDarkMode: false,
  isEnabled: true,
  fontFamily: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
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
