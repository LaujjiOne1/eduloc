import { cn } from "@/lib/utils";

export const CapIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M12 4 2.5 9 12 14l9.5-5Z" />
    <path d="M6.5 11.4V16c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-4.6" />
  </svg>
);

export const Logo = ({ inverted = false, className }: { inverted?: boolean; className?: string }) => (
  <span className={cn("inline-flex items-center gap-2.5", className)}>
    <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-primary-tint text-primary">
      <CapIcon className="h-6 w-6" />
    </span>
    <span className="font-display text-xl font-bold tracking-tight">
      <span className={inverted ? "text-primary-foreground" : "text-foreground"}>edU</span>
      <span className={inverted ? "text-violet" : "text-primary"}>loc</span>
    </span>
  </span>
);
