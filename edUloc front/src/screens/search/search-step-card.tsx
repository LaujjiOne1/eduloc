import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Collapsible, ExpandableCard } from "@/components/motion/expandable-card";
import { PressableScale } from "@/components/motion/pressable-scale";

type SearchStepCardProps = {
  /** Libellé de la carte repliée (« Niveau », « Série »…). */
  label: string;
  /** Question posée quand la carte est ouverte. */
  question: string;
  /** Choix déjà fait, affiché à droite de la carte repliée. */
  value: string | null;
  open: boolean;
  /** Étape pas encore accessible : une étape précédente n'est pas renseignée. */
  locked?: boolean;
  onOpen: () => void;
  children: ReactNode;
};

/**
 * Une étape de la recherche, façon Airbnb : repliée, elle tient sur une ligne « libellé — choix » ; ouverte, elle pose
 * sa question et affiche ses options. Une seule étape est ouverte à la fois.
 */
export function SearchStepCard({ label, question, value, open, locked, onOpen, children }: SearchStepCardProps) {
  const { t } = useTranslation();

  return (
    <View pointerEvents={locked ? "none" : "auto"} style={{ opacity: locked ? 0.55 : 1 }}>
      <ExpandableCard
        style={{ borderRadius: 22, borderWidth: 1, borderColor: "#E6E7EE", backgroundColor: "#FFFFFF" }}
      >
        {open ? null : (
          <PressableScale
            onPress={onOpen}
            disabled={locked}
            accessibilityLabel={`${label} : ${value ?? t("search.sheet.choose")}`}
            className="flex-row items-center justify-between gap-3 px-5 py-[18px]"
          >
            <Text className="text-[14px] font-medium text-ink-soft">{label}</Text>
            <Text className={value ? "flex-1 text-right text-[14.5px] font-bold text-ink" : "text-[14.5px] font-semibold text-primary"} numberOfLines={1}>
              {value ?? t("search.sheet.choose")}
            </Text>
          </PressableScale>
        )}

        <Collapsible open={open}>
          <View className="px-5 pb-5 pt-5">
            <Text className="mb-4 text-[22px] font-bold text-ink">{question}</Text>
            {children}
          </View>
        </Collapsible>
      </ExpandableCard>
    </View>
  );
}
