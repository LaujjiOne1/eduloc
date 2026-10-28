import {
  LayoutDashboard, UserCheck, Scale, BookOpen, Users, Calendar, AlertTriangle, Building2, DoorOpen, Star, Tag,
  type LucideIcon,
} from 'lucide-react';

export type NavSection =
  | 'dashboard' | 'applications' | 'equivalences' | 'offers'
  | 'users' | 'bookings' | 'conflicts'
  | 'venues' | 'rooms' | 'room-reviews' | 'plans';

export interface NavItem {
  id: NavSection;
  label: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, title: 'À traiter', subtitle: 'Ce qui attend une décision de l’administration.' },
    ],
  },
  {
    label: 'Tuteurs',
    items: [
      { id: 'applications', label: 'Dossiers tuteurs', icon: UserCheck, title: 'Dossiers tuteurs', subtitle: 'Contrôle des justificatifs, niveau académique validé, approbation, refus et suspension.' },
      { id: 'equivalences', label: 'Équivalences de diplômes', icon: Scale, title: 'Équivalences de diplômes', subtitle: 'Décisions réutilisées pour les diplômes hors catégories principales.' },
      { id: 'offers', label: 'Offres de cours', icon: BookOpen, title: 'Modération des offres', subtitle: 'Retirer ou rétablir une offre ; le tuteur ne peut pas la réactiver lui-même.' },
    ],
  },
  {
    label: 'Plateforme',
    items: [
      { id: 'users', label: 'Utilisateurs', icon: Users, title: 'Comptes utilisateurs', subtitle: 'Suspendre ou réactiver un compte.' },
      { id: 'bookings', label: 'Réservations', icon: Calendar, title: 'Réservations', subtitle: 'Consultation des séances et des salles réservées. L’administration ne modifie pas leur statut.' },
      { id: 'conflicts', label: 'Conflits', icon: AlertTriangle, title: 'Conflits de réservation', subtitle: 'Séances devenues impossibles : à résoudre ou à classer.' },
    ],
  },
  {
    label: 'Lieux partenaires',
    items: [
      { id: 'venues', label: 'Structures', icon: Building2, title: 'Structures partenaires', subtitle: 'Examen des dossiers, justificatifs, NIF/STAT et offre commerciale.' },
      { id: 'rooms', label: 'Salles', icon: DoorOpen, title: 'Salles partenaires', subtitle: 'Chaque salle est examinée et publiée séparément.' },
      { id: 'room-reviews', label: 'Avis sur les salles', icon: Star, title: 'Avis sur les salles', subtitle: 'Masquer un avis frauduleux, offensant ou contenant des informations privées.' },
      { id: 'plans', label: 'Offres commerciales', icon: Tag, title: 'Offres commerciales', subtitle: 'Catalogue des plans proposés aux structures (prix et durée en données).' },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
