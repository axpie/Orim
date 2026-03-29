import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { UserRole } from '../../types/models';

export function AdminRoute() {
  const user = useAuthStore((s) => s.user);
  return user?.role === UserRole.Admin ? <Outlet /> : <Navigate to="/" replace />;
}