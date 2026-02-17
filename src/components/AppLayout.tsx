import { useState, createContext, useContext, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Puzzle,
  Key,
  Settings,
  Menu,
  X,
  Zap,
} from 'lucide-react';
import { capabilities, capabilityLabel } from '@/lib/capabilities';
import { clearSession, getSession, isAuthEnabled } from '@/lib/auth';
import { testIds } from '@/testIds';

interface LayoutContextType {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const LayoutContext = createContext<LayoutContextType>({ sidebarOpen: false, setSidebarOpen: () => {} });
export const useLayout = () => useContext(LayoutContext);

const navItems = [
  { label: 'Rooms', path: '/', icon: LayoutDashboard },
  { label: 'Agents', path: '/agents', icon: Users },
  { label: 'Skills', path: '/skills', icon: Puzzle },
  { label: 'Providers', path: '/providers', icon: Key },
  { label: 'Settings', path: '/settings', icon: Settings },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const session = getSession();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <LayoutContext.Provider value={{ sidebarOpen, setSidebarOpen }}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-card transition-transform duration-200 md:relative md:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-14 items-center gap-2 border-b border-border px-4">
            <Zap className="h-5 w-5 text-accent" />
            <span className="text-base font-semibold tracking-tight text-foreground">
              Brainstorm Room
            </span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted md:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            {navItems.map((item) => (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setSidebarOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(item.path)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="border-t border-border p-3">
            <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Data stored locally in browser
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden md:block" />
            {isAuthEnabled() && session && (
              <button
                onClick={() => {
                  clearSession();
                  navigate('/login', { replace: true });
                }}
                className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                data-testid={testIds.auth.logoutButton}
              >
                Logout
              </button>
            )}
            <div className="ml-auto hidden items-center gap-2 text-[11px] text-muted-foreground lg:flex">
              <span className="font-medium">Capabilities:</span>
              <span className={capabilities.supabase ? 'text-emerald-500' : 'text-amber-500'}>
                Supabase {capabilityLabel(capabilities.supabase)}
              </span>
              <span className={capabilities.personaGeneration ? 'text-emerald-500' : 'text-amber-500'}>
                Persona gen {capabilityLabel(capabilities.personaGeneration)}
              </span>
              <span className={capabilities.documentExtraction ? 'text-emerald-500' : 'text-amber-500'}>
                Doc extraction {capabilityLabel(capabilities.documentExtraction)}
              </span>
            </div>
          </header>

          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </LayoutContext.Provider>
  );
}
