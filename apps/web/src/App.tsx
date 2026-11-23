import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { canCreateUsers } from '@tcms/shared';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { ToastProvider } from './contexts/ToastContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { AppShell } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { ProjectsPage } from './pages/ProjectsPage';

const RepositoryPage = lazy(() =>
  import('./pages/RepositoryPage').then((m) => ({ default: m.RepositoryPage })),
);
const TestPlansPage = lazy(() =>
  import('./pages/TestPlansPage').then((m) => ({ default: m.TestPlansPage })),
);
const TestRunsPage = lazy(() =>
  import('./pages/TestRunsPage').then((m) => ({ default: m.TestRunsPage })),
);
const TestRunDetailPage = lazy(() =>
  import('./pages/TestRunDetailPage').then((m) => ({ default: m.TestRunDetailPage })),
);
const DefectsPage = lazy(() =>
  import('./pages/DefectsPage').then((m) => ({ default: m.DefectsPage })),
);
const ProjectOverviewPage = lazy(() =>
  import('./pages/ProjectOverviewPage').then((m) => ({ default: m.ProjectOverviewPage })),
);
const ProjectHistoryPage = lazy(() =>
  import('./pages/ProjectHistoryPage').then((m) => ({ default: m.ProjectHistoryPage })),
);
const ProjectSettingsPage = lazy(() =>
  import('./pages/ProjectSettingsPage').then((m) => ({ default: m.ProjectSettingsPage })),
);
const UsersPage = lazy(() =>
  import('./pages/UsersPage').then((m) => ({ default: m.UsersPage })),
);
const MyWorkPage = lazy(() =>
  import('./pages/MyWorkPage').then((m) => ({ default: m.MyWorkPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
    },
  },
});

function PageLoader() {
  const { tx } = useLanguage();
  return (
    <div className="flex-1 flex items-center justify-center p-12 text-sm text-slate-400">
      {tx('Đang tải giao diện...', 'Loading interface...')}
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { tx } = useLanguage();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-400">
        {tx('Đang khởi tạo phiên đăng nhập...', 'Initializing session...')}
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </AppShell>
  );
}

function UsersRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!canCreateUsers(user?.role)) return <Navigate to="/projects" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route
                    path="/projects"
                    element={
                      <ProtectedRoute>
                        <ProjectsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/my-work"
                    element={
                      <ProtectedRoute>
                        <MyWorkPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/projects/:projectId/repository"
                    element={
                      <ProtectedRoute>
                        <RepositoryPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/projects/:projectId/plans"
                    element={
                      <ProtectedRoute>
                        <TestPlansPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/projects/:projectId/runs"
                    element={
                      <ProtectedRoute>
                        <TestRunsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/projects/:projectId/runs/:runId"
                    element={
                      <ProtectedRoute>
                        <TestRunDetailPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/projects/:projectId/defects"
                    element={
                      <ProtectedRoute>
                        <DefectsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/projects/:projectId/overview"
                    element={
                      <ProtectedRoute>
                        <ProjectOverviewPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/projects/:projectId/history"
                    element={
                      <ProtectedRoute>
                        <ProjectHistoryPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/projects/:projectId/settings"
                    element={
                      <ProtectedRoute>
                        <ProjectSettingsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/users"
                    element={
                      <ProtectedRoute>
                        <UsersRoute>
                          <UsersPage />
                        </UsersRoute>
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<Navigate to="/projects" replace />} />
                </Routes>
              </BrowserRouter>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
    </LanguageProvider>
  );
}

export default App;
