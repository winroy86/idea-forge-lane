import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AuthGate from "@/components/AuthGate";
import { AuthProvider } from "@/lib/authContext";
import AppLayout from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import RoomView from "./pages/RoomView";
import MeetingHistoryPage from "./pages/MeetingHistoryPage";
import AgentsPage from "./pages/AgentsPage";
import SkillsPage from "./pages/SkillsPage";
import ProvidersPage from "./pages/ProvidersPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";
import LoginPage from "./pages/LoginPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="*"
              element={
                <AuthGate>
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
                </AuthGate>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
