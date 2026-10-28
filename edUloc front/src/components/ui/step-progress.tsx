import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

type StepProgressProps = {
  /** 1-indexed current step. */
  step: number;
  total: number;
  /** Optional title or label for the current step */
  title?: string;
  /** Whether to show the detailed text header */
  showText?: boolean;
};

/**
 * Dynamic progress component reflecting actual step-by-step advancement.
 * Displays step indicator (e.g. "Étape 3 sur 9 • 33%"), a continuous dynamic
 * progress bar, and the segmented dots.
 */
export function StepProgress({ step, total, title, showText = true }: StepProgressProps) {
  const { t } = useTranslation();
  const boundedStep = Math.min(Math.max(step, 1), total);
  const percent = Math.round((boundedStep / total) * 100);

  return (
    <View className="px-5 pb-[14px]">
      {showText ? (
        <View className="mb-[6px] flex-row items-center justify-between">
          <Text className="text-[12px] font-bold text-primary">
            {t("ui.stepProgress.stepOf", { step: boundedStep, total })}
            {title ? ` • ${title}` : ""}
          </Text>
          <Text className="text-[11.5px] font-semibold text-ink-soft">{percent}%</Text>
        </View>
      ) : null}

      {/* Dynamic continuous bar with segments */}
      <View className="flex-row items-center gap-[6px]">
        {Array.from({ length: total }, (_, i) => i + 1).map((index) => {
          const isCurrent = index === boundedStep;
          const isDone = index < boundedStep;
          return (
            <View
              key={index}
              className={[
                "h-[6px] rounded-full transition-all duration-300",
                isCurrent ? "flex-1 bg-primary" : isDone ? "flex-1 bg-primary/70" : "flex-1 bg-line",
              ].join(" ")}
            />
          );
        })}
      </View>
    </View>
  );
}
