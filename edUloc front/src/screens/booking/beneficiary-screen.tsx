import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CheckIcon, PlusIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { SelectField, type SelectOption } from "@/components/ui/select-field";
import { StepProgress } from "@/components/ui/step-progress";
import { TextField } from "@/components/ui/text-field";
import { useCreateBeneficiary } from "@/hooks/use-create-beneficiary";
import { useLevels } from "@/hooks/use-levels";
import { useMyBeneficiaries } from "@/hooks/use-my-beneficiaries";
import { useSelfBeneficiary } from "@/hooks/use-self-beneficiary";
import { useBookingWizardStore } from "@/store/booking-wizard.store";
import { useSearchWizardStore } from "@/store/search-wizard.store";
import type { Relationship, SavedBeneficiary } from "@/types/beneficiary";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";
import { t as translate } from "@/i18n";

const BENEFICIARY_PROFILE_ROUTE = "/beneficiary-profile" as Href;

// Options match the real `Relationship` enum (BeneficiaryType["id"] minus
// "self") one-to-one — only the French labels are our own copy, not an
// invented business rule (AGENTS.md §11). Exported so 34_Beneficiaries'
// "Ajouter un bénéficiaire" form (a different screen — the standalone address
// book, not this booking-flow step) reuses the same list.
export const RELATION_OPTIONS: SelectOption[] = [
  { id: "child", get label() { return tr("common.myChild"); } },
  { id: "spouse", get label() { return tr("booking.beneficiary.mySpouse"); } },
  { id: "sibling", get label() { return tr("booking.beneficiary.myBrotherSister"); } },
  { id: "parent", get label() { return tr("booking.beneficiary.myFatherMother"); } },
  { id: "relative", get label() { return tr("booking.beneficiary.anotherRelative"); } },
  { id: "other", get label() { return tr("common.other"); } },
];

export function BeneficiaryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const offer = useBookingWizardStore((s) => s.offer);
  const chosenBeneficiary = useBookingWizardStore((s) => s.beneficiary);
  const setBeneficiary = useBookingWizardStore((s) => s.setBeneficiary);
  const searchLevel = useSearchWizardStore((s) => s.criteria.level);

  const { state: beneficiariesState } = useMyBeneficiaries();
  const { state: levelsState } = useLevels();
  const { state: createState, submit: createBeneficiary } = useCreateBeneficiary();

  const [selectedId, setSelectedId] = useState<string | null>(chosenBeneficiary?.id ?? null);
  const [isAdding, setIsAdding] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // « Pour qui » n'est plus demandé dans la recherche : c'est ici que le bénéficiaire se choisit. Le compte lui-même
  // (« Moi-même ») est créé ou retrouvé côté serveur pour toujours figurer dans la liste.
  const { state: selfState } = useSelfBeneficiary(!!offer, searchLevel?.id ?? null);
  const selfBeneficiary = selfState.status === "ready" ? selfState.beneficiary : null;
  const beneficiaries = useMemo<SavedBeneficiary[]>(() => {
    if (beneficiariesState.status !== "success") return [];
    const saved = beneficiariesState.beneficiaries;
    return selfBeneficiary && !saved.some((b) => b.id === selfBeneficiary.id) ? [selfBeneficiary, ...saved] : saved;
  }, [beneficiariesState, selfBeneficiary]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [relation, setRelation] = useState<SelectOption | null>(null);
  const [level, setLevel] = useState<SelectOption | null>(
    searchLevel ? { id: searchLevel.id, label: searchLevel.label } : null,
  );

  useFocusEffect(
    useCallback(() => {
      setIsNavigating(false);
    }, []),
  );

  // Once the address book loads, default to the beneficiary already chosen for this booking, else to the
  // account's own "(vous)" entry — the most common case.
  const defaultSelectedId =
    isAdding || beneficiariesState.status !== "success"
      ? null
      : (beneficiaries.find((b) => b.id === chosenBeneficiary?.id) ?? beneficiaries.find((b) => b.isSelf))?.id ?? null;
  const currentSelectedId = selectedId ?? defaultSelectedId;

  // Guard: Beneficiary only makes sense once an offer/slot has been picked
  // on BookDate — including the case of reaching here via Login/Signup/Verify
  // with no booking ever started (AGENTS.md §13).
  useEffect(() => {
    if (!offer) router.replace("/home");
  }, [offer, router]);

  if (!offer) return null;

  const levelOptions: SelectOption[] =
    levelsState.status === "success" ? levelsState.levels.map((l) => ({ id: l.id, label: l.label })) : [];

  const canAdd =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    !!level &&
    !!relation &&
    createState.status !== "loading";

  const canContinue = (isAdding ? false : !!currentSelectedId) && !isNavigating;

  const continueWithBeneficiary = (beneficiary: SavedBeneficiary) => {
    setIsNavigating(true);
    setBeneficiary(beneficiary);
    router.push(BENEFICIARY_PROFILE_ROUTE);
  };

  const handleContinue = () => {
    if (!canContinue) return;
    const beneficiary = beneficiaries.find((b) => b.id === currentSelectedId);
    if (beneficiary) continueWithBeneficiary(beneficiary);
  };

  const handleAdd = async () => {
    if (!canAdd || !level) return;
    const created = await createBeneficiary({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      relationship: relation!.id as Exclude<Relationship, "self">,
      levelId: level.id,
    });
    if (created) continueWithBeneficiary(created);
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <StepProgress step={1} total={3} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <Text className="mb-1 text-[24px] font-bold text-ink">{t("booking.beneficiary.whoWillTakeTheLesson")}</Text>
          <Text className="mb-5 text-[13.5px] text-ink-soft">{t("booking.beneficiary.theRequesterIsNotAlways")}</Text>
        </FadeIn>

        {beneficiariesState.status === "loading" ? (
          <View className="items-center py-10">
            <ActivityIndicator color="#332E86" />
          </View>
        ) : beneficiariesState.status === "error" ? (
          <Text className="text-[13.5px] text-error">{beneficiariesState.message}</Text>
        ) : (
          <FadeIn delay={90}>
            <View className="gap-[10px]">
              {beneficiaries.map((beneficiary) => (
                <PressableScale
                  key={beneficiary.id}
                  onPress={() => {
                    setSelectedId(beneficiary.id);
                    setIsAdding(false);
                  }}
                  accessibilityLabel={`${beneficiary.firstName} ${beneficiary.lastName}`}
                >
                  <View
                    className={[
                      "flex-row items-center justify-between rounded-lg border p-4",
                      !isAdding && currentSelectedId === beneficiary.id ? "border-primary bg-primary-tint" : "border-line bg-surface",
                    ].join(" ")}
                  >
                    <View className="flex-1">
                      <Text className="text-[15px] font-semibold text-ink">
                        {beneficiary.isSelf ? translate("booking.beneficiary.myself") : `${beneficiary.firstName} ${beneficiary.lastName}`}
                      </Text>
                      <Text className="mt-[2px] text-[12.5px] text-ink-soft">
                        {[beneficiary.relationLabel, beneficiary.level?.label].filter(Boolean).join(" • ") || "—"}
                      </Text>
                    </View>
                    <View
                      className={[
                        "h-5 w-5 items-center justify-center rounded-full border-2",
                        !isAdding && currentSelectedId === beneficiary.id ? "border-primary bg-primary" : "border-line",
                      ].join(" ")}
                    >
                      {!isAdding && currentSelectedId === beneficiary.id ? <CheckIcon size={11} color="#fff" /> : null}
                    </View>
                  </View>
                </PressableScale>
              ))}
            </View>
          </FadeIn>
        )}

        <FadeIn delay={120}>
          <PressableScale
            onPress={() => {
              setIsAdding((v) => !v);
              setSelectedId(null);
            }}
            accessibilityLabel={t("booking.beneficiary.addANewBeneficiary")}
          >
            <View className="mt-3.5 flex-row items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface/70 py-3">
              <PlusIcon size={15} color="#332E86" />
              <Text className="text-[13.5px] font-bold text-primary">
                {isAdding ? t("booking.beneficiary.chooseAnExistingBeneficiary") : t("booking.beneficiary.addANewBeneficiary")}
              </Text>
            </View>
          </PressableScale>
        </FadeIn>

        {isAdding ? (
          <FadeIn delay={40}>
            {createState.status === "error" ? (
              <View className="mt-3">
                <FormError message={createState.message} />
              </View>
            ) : null}
            <View className="mt-3">
              <TextField label={t("common.firstName")} value={firstName} onChangeText={setFirstName} placeholder="Thomas" />
              <TextField label={t("common.lastName")} value={lastName} onChangeText={setLastName} placeholder="Rakoto" />
              <SelectField label={t("common.relationship")} value={relation} options={RELATION_OPTIONS} onSelect={setRelation} />
              <SelectField
                label={t("common.level")}
                value={level}
                options={levelOptions}
                placeholder={levelsState.status === "loading" ? t("common.loading2") : t("common.select")}
                disabled={levelsState.status !== "success"}
                onSelect={setLevel}
              />
            </View>
          </FadeIn>
        ) : null}
      </ScrollView>

      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        <Button
          label={isAdding ? t("booking.beneficiary.addAndContinue") : t("common.continue")}
          disabled={isAdding ? !canAdd : !canContinue}
          loading={isAdding && createState.status === "loading"}
          loadingLabel={t("common.adding")}
          onPress={isAdding ? handleAdd : handleContinue}
        />
      </View>
    </View>
  );
}
