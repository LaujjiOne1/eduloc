import { Circle, Path, Rect, Svg } from "react-native-svg";

export type IconProps = {
  size?: number;
  color?: string;
};

const STROKE_WIDTH = 1.8;

/** Graduation cap — EduLoc brand mark (splash screen). */
export function GraduationCapIcon({ size = 32, color = "#fff" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 4 2.5 9 12 14l9.5-5Z" />
      <Path d="M6.5 11.4V16c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-4.6" />
    </Svg>
  );
}

export function SearchIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="11" cy="11" r="6.5" />
      <Path d="M20 20l-4.3-4.3" />
    </Svg>
  );
}

export function SubjectIcon({ size = 16, color = "#9799AF" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3.5 20.5 8 12 12.5 3.5 8Z" />
      <Path d="M3.5 13 12 17.5 20.5 13" />
    </Svg>
  );
}

export function LevelIcon({ size = 16, color = "#9799AF" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="8" />
      <Circle cx="12" cy="12" r="4.2" />
      <Circle cx="12" cy="12" r="0.8" />
    </Svg>
  );
}

export function LocationIcon({ size = 16, color = "#9799AF" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 21s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12Z" />
      <Circle cx="12" cy="9" r="2.4" />
    </Svg>
  );
}

export function TeachIcon({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3.5" y="4.5" width="17" height="12" rx="2" />
      <Path d="M8 20.5l4-4 4 4" />
      <Path d="M7.5 8.5h9M7.5 11.5h6" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 18, color = "#332E86" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 5.5 15.5 12 9 18.5" />
    </Svg>
  );
}

export function ChevronLeftIcon({ size = 18, color = "#332E86" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 18.5 8.5 12 15 5.5" />
    </Svg>
  );
}

export function ArrowLeftIcon({ size = 17, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5M11 6l-6 6 6 6" />
    </Svg>
  );
}

export function CheckIcon({ size = 11, color = "#fff" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12.5 9.5 17 19 6.5" />
    </Svg>
  );
}

/** "Langues" subject icon — search wizard Need step. */
export function LanguagesIcon({ size = 19, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M15.3 8.7 13.4 13.4 8.7 15.3l1.9-4.7Z" />
    </Svg>
  );
}

/** "Finance" subject icon — search wizard Need step. */
export function FinanceIcon({ size = 19, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 3.5v17" />
      <Path d="M6 4.5h11l-2.6 3.5L17 11.5H6Z" />
    </Svg>
  );
}

/** "Sciences" subject icon — search wizard Need step. */
export function ScienceIcon({ size = 19, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3.5" y="4.5" width="17" height="12" rx="2" />
      <Path d="M8 20.5l4-4 4 4" />
      <Path d="M7.5 8.5h9M7.5 11.5h6" />
    </Svg>
  );
}

/** "Pour moi" beneficiary icon — search wizard ForWhom step. */
export function PersonIcon({ size = 21, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="8.2" r="3.4" />
      <Path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" />
    </Svg>
  );
}

/** "Mon enfant" beneficiary icon — search wizard ForWhom step. */
export function ChildIcon({ size = 21, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="7.5" r="2.7" />
      <Path d="M6.5 20c0-3 2.4-5.2 5.5-5.2s5.5 2.2 5.5 5.2" />
    </Svg>
  );
}

/** "Un proche" beneficiary icon — search wizard ForWhom step. */
export function FamilyIcon({ size = 21, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="9" cy="8" r="2.8" />
      <Circle cx="16.5" cy="9" r="2.2" />
      <Path d="M3.8 20c0-3 2.3-5.2 5.2-5.2 2.2 0 4 1.2 4.8 3M13.8 20c.2-2.6 2-4.5 4.6-4.5 2 0 3.6 1.3 4 3.3" />
    </Svg>
  );
}

/** "Autre personne" beneficiary icon — search wizard ForWhom step. */
export function EditIcon({ size = 21, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 19.5l.9-3.6L15.6 6.2l2.7 2.7L8.6 18.6l-3.6.9Z" />
      <Path d="M13.8 7.9l2.7 2.7" />
    </Svg>
  );
}

/** "Utiliser ma position" icon — search wizard Location step. */
export function CrosshairIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="7.5" />
      <Path d="M12 2.5V6M12 18v3.5M2.5 12H6M18 12h3.5" />
    </Svg>
  );
}

/** "Ajouter un vocal" icon — search wizard Detail step. */
export function MicIcon({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="9" y="3" width="6" height="11" rx="3" />
      <Path d="M6 11a6 6 0 0 0 12 0" />
      <Path d="M12 17v4M9 21h6" />
    </Svg>
  );
}

/** Rating star — results list / tutor profile / 32_ReviewTutor (filled once selected). */
export function StarIcon({ size = 13, color = "#BD7E28", filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9L12 17l-5.2 2.8 1-5.9-4.3-4.2 5.9-.8Z" />
    </Svg>
  );
}

/** Clock — next-slot / offer duration. */
export function ClockIcon({ size = 13, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M12 7.5V12l3.2 2" />
    </Svg>
  );
}

/** "Tuteur validé" badge — tutor profile. */
export function VerifiedBadgeIcon({ size = 12, color = "#0E9C82" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3.5 19 6v6c0 4.8-3 8-7 9-4-1-7-4.2-7-9V6Z" />
      <Path d="M8.7 12l2.3 2.3 4.3-4.3" />
    </Svg>
  );
}

/** "Liste" tab icon — results List/Map toggle. */
export function ListIcon({ size = 15, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M8 6.5h12M8 12h12M8 17.5h12" />
      <Circle cx="4" cy="6.5" r="1" />
      <Circle cx="4" cy="12" r="1" />
      <Circle cx="4" cy="17.5" r="1" />
    </Svg>
  );
}

/** "Carte" tab icon — results List/Map toggle. */
export function MapIcon({ size = 15, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 4.5 4.5 6.5v13L9 17.5l6 2 4.5-2v-13l-4.5 2Z" />
      <Path d="M9 4.5v13M15 6.5v13" />
    </Svg>
  );
}

/** "Présentiel" format icon — tutor profile. */
export function HouseIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4.5 11 12 4.5 19.5 11" />
      <Path d="M6.5 9.5V19a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9.5" />
    </Svg>
  );
}

/** "En ligne" format icon — tutor profile. */
export function VideoIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3.5" y="6.5" width="12" height="11" rx="2.5" />
      <Path d="M15.5 10.5 20.5 7v10l-5-3.5Z" />
    </Svg>
  );
}

/** Date row icon — BookingSummary. */
export function CalendarIcon({ size = 15, color = "#9799AF" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <Path d="M3.5 10h17M8 3v4M16 3v4" />
    </Svg>
  );
}

/** Success confirmation icon — BookingPending. */
export function CheckCircleIcon({ size = 34, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M8.3 12.3l2.5 2.5 5-5" />
    </Svg>
  );
}

/** "Ajouter" plus icon — tutor onboarding add-item links (skills, locations, availability). */
export function PlusIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 5.5v13M5.5 12h13" />
    </Svg>
  );
}

/** Paperclip icon — TutorDocuments upload rows. */
export function AttachIcon({ size = 15, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M16.5 7.5 8.8 15.2a3.5 3.5 0 1 0 5 5l8-8a5.5 5.5 0 1 0-7.8-7.8l-8 8" />
    </Svg>
  );
}

/** "Demandes" tab icon — tutor dashboard bottom nav. */
export function InboxIcon({ size = 21, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 12.5 6 5.5h12l2 7" />
      <Path d="M4 12.5h5.2c.3 1.4 1.4 2.4 2.8 2.4s2.5-1 2.8-2.4H20V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18Z" />
    </Svg>
  );
}

/** "Offres" tab icon — tutor dashboard bottom nav. */
export function GridIcon({ size = 21, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="4" y="4" width="7" height="7" rx="1.5" />
      <Rect x="13" y="4" width="7" height="7" rx="1.5" />
      <Rect x="4" y="13" width="7" height="7" rx="1.5" />
      <Rect x="13" y="13" width="7" height="7" rx="1.5" />
    </Svg>
  );
}

/** Notification bell — tutor dashboard header. */
export function BellIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
      <Path d="M9.5 19a2.5 2.5 0 0 0 5 0" />
    </Svg>
  );
}

/** Alarm clock — « Alarme de cours » (Compte). */
export function AlarmIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={13} r={7.5} />
      <Path d="M12 9.5V13l2.5 1.5" />
      <Path d="M4 5.5 7 3M20 5.5 17 3" />
    </Svg>
  );
}

/** Play triangle — voice-note need preview, TutorRequestDetail. */
export function PlayIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M7.5 5.5v13l11-6.5Z" />
    </Svg>
  );
}

/** Pause — lecteur de message vocal. */
export function PauseIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M8 5.5v13M16 5.5v13" />
    </Svg>
  );
}

/** Warning triangle — 55_TutorRequestConflict. */
export function AlertTriangleIcon({ size = 32, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 4 21 19H3Z" />
      <Path d="M12 10v4.2M12 17.2v.1" />
    </Svg>
  );
}

/** Phone handset — "Appeler" cta (24_BookingConfirmed) and hang-up (28_Call). */
export function PhoneIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 4h3l1.5 4.5-2 1.6a11 11 0 0 0 5.4 5.4l1.6-2L20 15v3a1.6 1.6 0 0 1-1.7 1.6A15.6 15.6 0 0 1 4.4 5.7 1.6 1.6 0 0 1 6 4Z" />
    </Svg>
  );
}

/** PDF/file glyph — message bubbles and 27_DocumentExchange rows. */
export function FileIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7 3.5Z" />
      <Path d="M14 3.5V8h4" />
    </Svg>
  );
}

/** Paper airplane — "Envoyer" (26_VoiceRecording). */
export function SendIcon({ size = 17, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 12 20 4l-6 16-3-6.5Z" />
      <Path d="M4 12l10-2" />
    </Svg>
  );
}

/** Padlock — 29_SessionOTP's session code card. */
export function LockIcon({ size = 28, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2" />
      <Path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Svg>
  );
}

/** Circled X — 36_ModeSwitch's close button and the "Demande refusée" notification icon. */
export function XCircleIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M9.3 9.3l5.4 5.4M14.7 9.3l-5.4 5.4" />
    </Svg>
  );
}

/** Simple X / close icon. */
export function XIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  );
}

export const CloseIcon = XIcon;

/** Trash / delete icon. */
export function TrashIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <Path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

/** Sparkles / AI / highlights icon. */
export function SparklesIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </Svg>
  );
}

/** "Déconnexion" icon — 35_Account / 36_ModeSwitch. */
export function LogoutIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9.5 4.5h-4a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5h4" />
      <Path d="M20 12H10M17 8.5 20.5 12 17 15.5" />
    </Svg>
  );
}

/** Gear — 36_ModeSwitch's "Paramètres" row. */
export function SettingsIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="3" />
      <Path d="M12 3.5v2.3M12 18.2v2.3M20.5 12h-2.3M5.8 12H3.5M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6M17.8 17.8l-1.6-1.6M7.8 7.8 6.2 6.2" />
    </Svg>
  );
}

export function PencilIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <Path d="m15 5 4 4" />
    </Svg>
  );
}

/** Briefcase icon for professional experience. */
export function BriefcaseIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
      <Path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </Svg>
  );
}

/** Chat bubble — Conversations / Messages */
export function MessageSquareIcon({ size = 21, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  );
}
