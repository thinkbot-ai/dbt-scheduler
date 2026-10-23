import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { JobDetailsPage } from './pages/JobDetailsPage.tsx';
import { JobsPage } from './pages/JobsPage.tsx';
import { ProjectsPage } from './pages/ProjectsPage.tsx';
import { SchedulesPage } from './pages/SchedulesPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { WorkersPage } from './pages/WorkersPage.tsx';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/schedules" element={<SchedulesPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/:id" element={<JobDetailsPage />} />
        <Route path="/workers" element={<WorkersPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
