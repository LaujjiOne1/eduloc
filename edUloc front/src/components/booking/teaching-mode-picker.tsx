import { useState } from "react";
import { Text, View } from "react-native";

import { ChevronRightIcon, HouseIcon, VideoIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { RadioCard } from "@/components/ui/selectable-card";
import { IN_PERSON_MODES, TEACHING_MODE_LABELS } from "@/lib/teaching-mode";
import type { TeachingModeId } from "@/types/booking";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";

const IN_PERSON_HINTS: Record<TeachingModeId, string> = {
  online: "",
  get at_home_beneficiary() { return tr("booking.teachingModePicker.theTutorTravelsToThe"); },
  get at_home_tutor() { return tr("booking.teachingModePicker.youGoToTheTutor"); },
  get public_place() { return tr("booking.teachingModePicker.inAPublicPlaceSuggested"); },
  get partner_room() { return tr("booking.teachingModePicker.inAPartnerStudyRoom"); },
};

const IN_PERSON_LABELS: Record<TeachingModeId, string> = {
  ...TEACHING_MODE_LABELS,
  get at_home_beneficiary() { return tr("booking.teachingModePicker.atMyPlace"); },
};

type TeachingModePickerProps = {
  /** Modes acceptés par le tuteur pour cette offre — un mode absent n'est pas proposé. */
  available: TeachingModeId[];
  value: TeachingModeId | null;
  onChange: (mode: TeachingModeId) => void;
};

/**
 * « Où souhaitez-vous le cours ? » : En ligne, ou Présentiel qui se déplie en Chez moi / Chez le tuteur / Lieu public
 * / Salle partenaire (seulement ceux que le tuteur propose).
 */
export function TeachingModePicker({ available, value, onChange }: TeachingModePickerProps) {
  const { t } = useTranslation();
  const inPersonModes = IN_PERSON_MODES.filter((m) => available.includes(m));
  const hasOnline = available.includes("online");
  const hasInPerson = inPersonModes.length > 0;
  const [expanded, setExpanded] = useState(value !== null && value !== "online");
  const open = expanded && hasInPerson;
  const inPersonSelected = value !== null && value !== "online";

  const toggleInPerson = () => {
    if (open) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    // Un seul mode présentiel proposé : inutile de demander, on le retient directement.
    if (inPersonModes.length === 1) onChange(inPersonModes[0]);
  };

  return (
    <View className="gap-[10px]">
      {hasOnline ? (
        <PressableScale
          onPress={() => {
            setExpanded(false);
            onChange("online");
          }}
          accessibilityLabel={t("common.online")}
        >
          <ModeRow
            icon={<VideoIcon size={18} color={value === "online" ? "#332E86" : "#585B78"} />}
            title={t("common.online")}
            description={t("booking.teachingModePicker.videoCallFromWhereverYou")}
            selected={value === "online"}
          />
        </PressableScale>
      ) : null}

      {hasInPerson ? (
        <View>
          <PressableScale onPress={toggleInPerson} accessibilityLabel={t("common.inPerson")}>
            <ModeRow
              icon={<HouseIcon size={18} color={inPersonSelected ? "#332E86" : "#585B78"} />}
              title={t("common.inPerson")}
              description={inPersonSelected && value ? IN_PERSON_LABELS[value] : t("booking.teachingModePicker.theLessonTakesPlaceFace")}
              selected={inPersonSelected}
              trailing={
                <View style={{ transform: [{ rotate: open ? "-90deg" : "90deg" }] }}>
                  <ChevronRightIcon size={17} color="#9799AF" />
                </View>
              }
            />
          </PressableScale>

          {open ? (
            <View className="ml-4 mt-[10px] gap-[10px] border-l-2 border-line pl-3">
              {inPersonModes.map((mode) => (
                <View key={mode}>
                  <RadioCard
                    label={IN_PERSON_LABELS[mode]}
                    selected={value === mode}
                    onPress={() => onChange(mode)}
                    variant="dot"
                  />
                  <Text className="ml-1 mt-1 text-[12px] text-ink-faint">{IN_PERSON_HINTS[mode]}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

type ModeRowProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  trailing?: React.ReactNode;
};

function ModeRow({ icon, title, description, selected, trailing }: ModeRowProps) {
  return (
    <View
      className={[
        "flex-row items-center gap-3 rounded-lg border p-4",
        selected ? "border-primary bg-primary-tint" : "border-line bg-surface",
      ].join(" ")}
    >
      <View className="h-[38px] w-[38px] items-center justify-center rounded-md bg-primary-tint">{icon}</View>
      <View className="flex-1">
        <Text className="text-[15px] font-bold text-ink">{title}</Text>
        <Text className="mt-[2px] text-[12.5px] text-ink-soft">{description}</Text>
      </View>
      {trailing ?? (
        <View
          className="h-5 w-5 rounded-full"
          style={{ borderWidth: selected ? 6 : 2, borderColor: selected ? "#332E86" : "#E7E3D7" }}
        />
      )}
    </View>
  );
}
