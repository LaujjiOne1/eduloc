import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { ChevronRightIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { RadioCard } from "@/components/ui/selectable-card";
import { useTranslation } from "react-i18next";
import { t as translate } from "@/i18n";

export type SelectOption = { id: string; label: string };

type SelectFieldProps = {
  label: string;
  value: SelectOption | null;
  placeholder?: string;
  options: SelectOption[];
  onSelect: (option: SelectOption) => void;
  error?: string;
  disabled?: boolean;
};

/**
 * Labeled pressable field matching the EduLoc .field-label / .input styles,
 * opening a modal sheet of RadioCard options — the RN equivalent of the
 * mock's bordered "value + chevron" dropdown boxes (Relation, Niveau).
 */
export function SelectField({
  label,
  value,
  placeholder = translate("ui.selectField.select"),
  options,
  onSelect,
  error,
  disabled,
}: SelectFieldProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <View className="mb-[14px]">
      <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
        {label}
      </Text>
      <PressableScale
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityLabel={`${label}: ${value?.label ?? placeholder}`}
      >
        <View
          className={[
            "flex-row items-center justify-between rounded-sm border bg-surface px-[14px] py-[13px]",
            error ? "border-error" : "border-line",
          ].join(" ")}
        >
          <Text className={value ? "text-[15px] text-ink" : "text-[15px] text-ink-faint"}>
            {value?.label ?? placeholder}
          </Text>
          <View style={{ transform: [{ rotate: "90deg" }] }}>
            <ChevronRightIcon size={16} color="#9799AF" />
          </View>
        </View>
      </PressableScale>
      {error ? <Text className="mb-0 mt-[6px] ml-0.5 text-[12.5px] text-error">{error}</Text> : null}

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(20,22,43,0.45)" }}
          onPress={() => setOpen(false)}
          accessibilityLabel={t("common.close")}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View className="rounded-t-xl bg-paper p-5" style={{ paddingBottom: 32 }}>
              <Text className="mb-4 text-[16px] font-bold text-ink">{label}</Text>
              <View className="gap-[10px]">
                {options.map((option) => (
                  <RadioCard
                    key={option.id}
                    label={option.label}
                    selected={value?.id === option.id}
                    onPress={() => {
                      onSelect(option);
                      setOpen(false);
                    }}
                  />
                ))}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
