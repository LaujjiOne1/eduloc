import { Text, View } from "react-native";

export type BadgeTone = "neutral" | "warning" | "success" | "error" | "info";

const TONES: Record<BadgeTone, { bg: string; text: string; dot: string }> = {
  neutral: { bg: "bg-paper-alt", text: "text-ink-soft", dot: "bg-ink-soft" },
  warning: { bg: "bg-warning-tint", text: "text-warning", dot: "bg-warning" },
  success: { bg: "bg-accent-tint", text: "text-accent", dot: "bg-accent" },
  error: { bg: "bg-error-tint", text: "text-error", dot: "bg-error" },
  info: { bg: "bg-primary-tint", text: "text-primary", dot: "bg-primary" },
};

/** Pastille d'état générique (statuts de dossier, de publication, de souscription). */
export function ToneBadge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  const t = TONES[tone];
  return (
    <View className={["flex-row items-center gap-[6px] self-start rounded-full px-[11px] py-[5px]", t.bg].join(" ")}>
      <View className={["h-[7px] w-[7px] rounded-full", t.dot].join(" ")} />
      <Text className={["text-[12px] font-semibold", t.text].join(" ")}>{label}</Text>
    </View>
  );
}
