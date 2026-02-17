import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/authContext';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, authenticated, authEnabled } = useAuth();
  const location = useLocation();

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Checking session...</div>;
  if (authEnabled && !authenticated && location.pathname !== '/login') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
