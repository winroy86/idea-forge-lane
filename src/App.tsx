  <<<<<<< codex/add-playwright-tests-and-ci-workflow
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
import LoginPage from './pages/LoginPage';
import NotFound from './pages/NotFound';

const queryClient = new QueryClient();

const App = () => (
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
=======
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import RoomView from "./pages/RoomView";
import MeetingHistoryPage from "./pages/MeetingHistoryPage";
import AgentsPage from "./pages/AgentsPage";
import SkillsPage from "./pages/SkillsPage";
import ProvidersPage from "./pages/ProvidersPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";
import { hasSupabaseConfig } from "@/integrations/supabase/client";
import { hydrateProvidersFromServer } from "@/lib/providerHydration";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    if (hasSupabaseConfig) {
      hydrateProvidersFromServer();
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppLayout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/room/:id" element={<RoomView />} />
              <Route path="/room/:id/history" element={<MeetingHistoryPage />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/skills" element={<SkillsPage />} />
              <Route path="/providers" element={<ProvidersPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLayout>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};
  >>>>>>> codex/create-prs-for-multiple-issues

export default App;
