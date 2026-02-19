import { useEffect } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import RoomView from './pages/RoomView';
import MeetingHistoryPage from './pages/MeetingHistoryPage';
import AgentsPage from './pages/AgentsPage';
import SkillsPage from './pages/SkillsPage';
import ProvidersPage from './pages/ProvidersPage';
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/AdminPage';
import LoginPage from './pages/LoginPage';
import NotFound from './pages/NotFound';
import { hasSupabaseConfig, supabase } from '@/integrations/supabase/client';
import { hydrateProvidersFromServer } from '@/lib/providerHydration';

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) return;

    // Only hydrate providers when we have an authenticated session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        hydrateProvidersFromServer();
      }
    });

    // Re-hydrate when auth state changes (e.g. after login)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        hydrateProvidersFromServer();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/room/:id" element={<RoomView />} />
                      <Route path="/room/:id/history" element={<MeetingHistoryPage />} />
                      <Route path="/agents" element={<AgentsPage />} />
                      <Route path="/skills" element={<SkillsPage />} />
                      <Route path="/providers" element={<ProvidersPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/admin" element={<AdminPage />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
