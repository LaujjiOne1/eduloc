import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { adminApi } from './lib/api';
import { LoginPage } from './components/auth/LoginPage';
import { AdminLayout } from './components/layout/AdminLayout';
import type { NavSection } from './components/layout/nav';
import { ToastProvider } from './components/ui/Toast';
import { DashboardView } from './components/dashboard/DashboardView';
import { ApplicationsView } from './components/applications/ApplicationsView';
import { EquivalencesView } from './components/equivalences/EquivalencesView';
import { OffersView } from './components/offers/OffersView';
import { UsersView } from './components/users/UsersView';
import { BookingsView } from './components/bookings/BookingsView';
import { ConflictsView } from './components/conflicts/ConflictsView';
import { VenuesView } from './components/partners/VenuesView';
import { RoomsView } from './components/partners/RoomsView';
import { RoomReviewsView } from './components/partners/RoomReviewsView';
import { PlansView } from './components/partners/PlansView';

type Todo = Partial<Record<NavSection, number>>;

const AdminApp: React.FC = () => {
  const { admin } = useAuth();
  const [section, setSection] = useState<NavSection>('dashboard');
  // Incrémenté pour que chaque vue recharge ses données (bouton « Actualiser », action qui change les compteurs).
  const [refreshKey, setRefreshKey] = useState(0);
  const [todo, setTodo] = useState<Todo>({});
  const [roomToOpen, setRoomToOpen] = useState<string | null>(null);

  const loadTodo = useCallback(async () => {
    // Un compteur qui échoue n'empêche pas les autres : il reste simplement absent du menu.
    const [dash, venues, rooms, conflicts] = await Promise.allSettled([
      adminApi.dashboard(),
      adminApi.venues('SUBMITTED'),
      adminApi.rooms('SUBMITTED'),
      adminApi.conflicts('OPEN'),
    ]);
    setTodo({
      applications: dash.status === 'fulfilled' ? dash.value.pendingApplications : undefined,
      venues: venues.status === 'fulfilled' ? venues.value.length : undefined,
      rooms: rooms.status === 'fulfilled' ? rooms.value.length : undefined,
      conflicts: conflicts.status === 'fulfilled' ? conflicts.value.length : undefined,
    });
  }, []);

  useEffect(() => { void loadTodo(); }, [loadTodo, refreshKey]);

  const refreshAll = () => setRefreshKey((k) => k + 1);

  if (!admin) return <LoginPage />;

  return (
    <AdminLayout currentSection={section} onSelectSection={setSection} badges={todo} onRefresh={refreshAll}>
      {section === 'dashboard' && <DashboardView refreshKey={refreshKey} todo={todo} onNavigate={setSection} />}
      {section === 'applications' && <ApplicationsView refreshKey={refreshKey} onChanged={loadTodo} />}
      {section === 'equivalences' && <EquivalencesView refreshKey={refreshKey} />}
      {section === 'offers' && <OffersView refreshKey={refreshKey} onChanged={loadTodo} />}
      {section === 'users' && <UsersView refreshKey={refreshKey} />}
      {section === 'bookings' && <BookingsView refreshKey={refreshKey} />}
      {section === 'conflicts' && <ConflictsView refreshKey={refreshKey} onChanged={loadTodo} />}
      {section === 'venues' && (
        <VenuesView
          refreshKey={refreshKey}
          onChanged={loadTodo}
          onOpenRoom={(id) => { setRoomToOpen(id); setSection('rooms'); }}
        />
      )}
      {section === 'rooms' && (
        <RoomsView refreshKey={refreshKey} onChanged={loadTodo} openRoomId={roomToOpen} onOpened={() => setRoomToOpen(null)} />
      )}
      {section === 'room-reviews' && <RoomReviewsView refreshKey={refreshKey} />}
      {section === 'plans' && <PlansView refreshKey={refreshKey} />}
    </AdminLayout>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AdminApp />
      </AuthProvider>
    </ToastProvider>
  );
}
