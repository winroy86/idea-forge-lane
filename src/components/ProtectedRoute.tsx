import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getSession, isAuthEnabled } from '@/lib/auth';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();

  if (!isAuthEnabled()) return <>{children}</>;
  if (!getSession()) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return <>{children}</>;
}
