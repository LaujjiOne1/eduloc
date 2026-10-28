import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CheckIcon, ChevronRightIcon, EditIcon, XIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { priceLabel } from "@/api/format/datetime";
import { useSubmitTutorApplication } from "@/hooks/use-submit-tutor-application";
import { useAuthStore } from "@/store/auth.store";
import { EXPERIENCE_AUDIENCES, EXPERIENCE_TYPES } from "@/lib/experience-types";
import { offerDescription, offerTitle } from "@/lib/offer-labels";
import { trackKindOf } from "@/lib/search-funnel";
import { useTutorApplicationStore } from "@/store/tutor-application.store";
import type { LocationFormatId } from "@/types/common";
import type { TutorApplicationSubmission } from "@/types/tutor-application";
import { useTranslation } from "react-i18next";

/** "12/05/1997" -> "1997-05-12" (IsoDate) — identity.birthDate is captured as JJ/MM/AAAA. */
function toIsoDate(ddmmyyyy: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy.trim());
  if (!match) return undefined;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

const TUTOR_IDENTITY_ROUTE = "/tutor-identity" as Href;
const TUTOR_PENDING_ROUTE = "/tutor-application-pending" as Href;
const TUTOR_APPLICATION_SUMMARY_ROUTE = "/tutor-application-summary" as Href;
const LOGIN_ROUTE = "/login" as Href;

type SectionTarget = {
  id: string;
  label: string;
  route: Href;
  done: boolean;
  summary: string;
};

export function TutorApplicationSummaryScreen() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const identity = useTutorApplicationStore((s) => s.identity);
  const background = useTutorApplicationStore((s) => s.background);
  const skills = useTutorApplicationStore((s) => s.skills);
  const subjectLevels = useTutorApplicationStore((s) => s.subjectLevels);
  const bio = useTutorApplicationStore((s) => s.bio);
  const introVideo = useTutorApplicationStore((s) => s.introVideo);
  const allOffers = useTutorApplicationStore((s) => s.offers);
  // Seules les lignes de tarif cochées deviennent des offres.
  const offers = allOffers.filter((o) => o.enabled);
  const formats = useTutorApplicationStore((s) => s.formats);
  const locations = useTutorApplicationStore((s) => s.locations);
  const inPersonModes = useTutorApplicationStore((s) => s.inPersonModes);
  const weeklyAvailability = useTutorApplicationStore((s) => s.weeklyAvailability);
  const dateAvailability = useTutorApplicationStore((s) => s.dateAvailability);
  const documents = useTutorApplicationStore((s) => s.documents);
  const setApplication = useTutorApplicationStore((s) => s.setApplication);
  const setIsPendingValidation = useTutorApplicationStore((s) => s.setIsPendingValidation);
  const setActiveMode = useAuthStore((s) => s.setActiveMode);
  const setReturnTo = useAuthStore((s) => s.setReturnTo);
  const { state, submit } = useSubmitTutorApplication();

  // Defensive net: the session could have expired between the tutor-intro
  // gate and this final step (e.g. a long form-filling session) — send the
  // user to log back in instead of leaving them stuck on a generic "session
  // expired" banner with no way forward. Their filled-in data stays intact
  // in useTutorApplicationStore, untouched by this redirect.
  useEffect(() => {
    if (state.status === "error" && state.code === "unauthorized") {
      setReturnTo(TUTOR_APPLICATION_SUMMARY_ROUTE);
      router.push(LOGIN_ROUTE);
    }
  }, [state, router, setReturnTo]);

  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);

  // Guard: reaching the recap without having started the wizard means there's
  // nothing to review — bounce back to the start.
  const hasContext = identity.firstName.trim().length > 0;
  useEffect(() => {
    if (!hasContext) router.replace(TUTOR_IDENTITY_ROUTE);
  }, [hasContext, router]);

  if (!hasContext) return null;

  const sections: SectionTarget[] = [
    {
      id: "identity",
      label: tr("common.personalInformation"),
      route: "/tutor-identity" as Href,
      done: !!identity.firstName && !!identity.lastName,
      summary: `${identity.firstName} ${identity.lastName} • ${identity.email}`,
    },
    {
      id: "background",
      label: tr("tutorOnboarding.tutorApplicationSummary.backgroundExperience"),
      route: "/tutor-background" as Href,
      done: !!background.degree,
      summary: `${background.degree?.label ?? tr("tutorOnboarding.tutorApplicationSummary.noDegree")} • ${background.field || tr("tutorOnboarding.tutorApplicationSummary.noField")}${(background.experiences?.length ?? 0) > 0 ? ` • ${tr("tutorOnboarding.tutorApplicationSummary.experienceShort", { count: background.experiences?.length ?? 0 })}` : ""}`,
    },
    {
      id: "skills",
      label: tr("tutorOnboarding.tutorApplicationSummary.skillsSubjects"),
      route: "/tutor-skills" as Href,
      done: skills.length > 0,
      summary: tr("tutorOnboarding.tutorApplicationSummary.skillsSelected", { count: skills.length }),
    },
    {
      id: "offers",
      label: tr("common.offersPricing"),
      route: "/tutor-offer" as Href,
      done: offers.length > 0 && offers.every((o) => o.hourlyRate > 0),
      summary: offers.length
        ? tr("tutorOnboarding.tutorApplicationSummary.offersFrom", { count: offers.length, price: priceLabel({ amount: String(Math.min(...offers.map((o) => o.hourlyRate))), currency: "MGA" }) })
        : tr("tutorOnboarding.tutorApplicationSummary.noOffer"),
    },
    {
      id: "locations",
      label: tr("common.placesAreasOfActivity"),
      route: "/tutor-locations" as Href,
      done: locations.length > 0,
      summary: tr("tutorOnboarding.tutorApplicationSummary.locationsCount", { count: locations.length }),
    },
    {
      id: "availability",
      label: tr("common.availabilities"),
      route: "/tutor-availability" as Href,
      done: weeklyAvailability.some((d) => d.active && d.slots.length > 0) || dateAvailability.length > 0,
      summary: [
        tr("tutorOnboarding.tutorApplicationSummary.activeDaysPerWeek", { length: weeklyAvailability.filter((d) => d.active).length }),
        dateAvailability.length > 0 ? tr("tutorOnboarding.tutorApplicationSummary.specificDates", { count: dateAvailability.length }) : null,
      ]
        .filter(Boolean)
        .join(" • "),
    },
    {
      id: "documents",
      label: tr("tutorOnboarding.tutorApplicationSummary.supportingDocuments"),
      route: "/tutor-documents" as Href,
      done: documents.some((d) => d.provided),
      summary: tr("tutorOnboarding.tutorApplicationSummary.documentsProvided", { count: documents.filter((d) => d.provided).length }),
    },
  ];

  const isSubmitting = state.status === "loading";

  // Ce que le serveur exige (voir TutorApplicationsService.submit) : on le dit AVANT l'envoi plutôt
  // que de laisser un dossier incomplet partir et revenir en erreur.
  // Chaque façon d'enseigner en présentiel choisie doit avoir son lieu (zone, adresse d'accueil, lieu public).
  const hasAllPlaces = inPersonModes.every((mode) => locations.some((l) => l.kind === mode));
  const needsPlaces = formats.includes("in_person");
  const hasValidOffer =
    offers.length > 0 &&
    offers.every((o) => !!o.skill && !!o.level && !!o.duration && o.hourlyRate > 0 && (trackKindOf(o.level) !== "serie" || !!o.track));
  const missing: string[] = [];
  if (skills.length === 0 || subjectLevels.every((sl) => sl.levels.length === 0)) missing.push(tr("tutorOnboarding.tutorApplicationSummary.atLeastOneSubjectWith"));
  if (!hasValidOffer) missing.push(tr("tutorOnboarding.tutorApplicationSummary.atLeastOneCompleteOffer"));
  if (needsPlaces && (inPersonModes.length === 0 || !hasAllPlaces)) missing.push(tr("tutorOnboarding.tutorApplicationSummary.yourTeachingLocations"));
  if (!introVideo) missing.push(tr("tutorOnboarding.tutorApplicationSummary.yourPresentationVideo"));
  const canSubmit = missing.length === 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const dayIndexes: Record<string, number> = {
      sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
    };
    const format =
      formats.length > 1 ? "both" : formats[0] ?? "both";
    // Une plage en présentiel est proposée pour chaque façon d'enseigner choisie (déplacement, accueil chez soi, lieu
    // public), chacune sur son lieu : le demandeur choisit ensuite où il veut le cours. Le tuteur peut affiner plage par
    // plage depuis « Mes disponibilités ».
    const inPersonPlaceIndexes = [
      ...new Set(inPersonModes.map((mode) => locations.findIndex((l) => l.kind === mode)).filter((i) => i >= 0)),
    ];
    const placeVariants = (slotFormat: LocationFormatId): { format: LocationFormatId; placeIndex: number | null }[] => [
      ...(slotFormat !== "in_person" ? [{ format: "online" as const, placeIndex: null }] : []),
      ...(slotFormat !== "online"
        ? inPersonPlaceIndexes.map((placeIndex) => ({ format: "in_person" as const, placeIndex }))
        : []),
    ];
    const submission: TutorApplicationSubmission = {
      firstName: identity.firstName.trim(),
      lastName: identity.lastName.trim(),
      email: identity.email.trim(),
      phone: identity.phone.trim(),
      bio,
      experience: background.experience.trim() || undefined,
      educationBackground:
        [background.degree?.label, background.field, background.institution].filter(Boolean).join(" — ") ||
        undefined,
      highestDegree: background.degree?.id,
      gender: identity.gender ?? undefined,
      birthDate: toIsoDate(identity.birthDate),
      experiences: background.experiences.map((entry) => ({
        type: EXPERIENCE_TYPES.find((t) => t.id === entry.type)?.backend ?? "PROFESSIONAL",
        title: entry.title,
        organization: entry.organization,
        period: entry.period,
        audience: entry.audience.map((id) => EXPERIENCE_AUDIENCES.find((a) => a.id === id)!.backend),
        subjectsTaught: entry.subjects,
        description: entry.description,
      })),
      subjects: subjectLevels.map((sl) => ({
        skillId: sl.skill.id,
        levelIds: sl.levels.map((l) => l.id),
        competenceDescription: sl.skill.scope?.trim() || undefined,
      })),
      offers: offers.flatMap((offer) => {
        if (!offer.skill || !offer.level || !offer.duration) return [];
        return [{
          subjectId: offer.skill.id,
          educationLevelId: offer.level.id,
          trackId: offer.track?.id,
          title: offer.title.trim() || offerTitle(offer.skill, offer.level, offer.track),
          description: offer.description.trim() || offerDescription(offer.skill, offer.level, offer.track),
          format,
          durationMinutes: Math.round(offer.duration.hours * 60),
          price: offer.priceCalculated || Math.round(offer.hourlyRate * offer.duration.hours),
          currency: "MGA",
        }];
      }),
      locations: locations.map(({ label, kind, radiusKm, isPrimary, latitude, longitude }) => ({ label, kind, radiusKm, isPrimary, latitude, longitude })),
      weeklyAvailability: weeklyAvailability.flatMap((day) =>
        day.active
          ? [{
              dayOfWeek: dayIndexes[day.dayId],
              slots: day.slots.flatMap(({ startTime, endTime, format }) =>
                placeVariants(format).map((variant) => ({ startTime, endTime, ...variant })),
              ),
            }]
          : [],
      ),
      dateAvailability: dateAvailability.flatMap(({ date, startTime, endTime, format }) =>
        placeVariants(format).map((variant) => ({ date, startTime, endTime, ...variant })),
      ),
      documents: documents
        .filter((d) => d.provided && d.file)
        .map((d) => ({ kind: d.kind, file: d.file! })),
      introVideo: introVideo
        ? {
            file: {
              uri: introVideo.uri,
              mimeType: introVideo.mimeType,
              sizeBytes: introVideo.fileSize ?? 0,
              fileName: introVideo.fileName,
            },
            durationMs: introVideo.duration,
          }
        : undefined,
    };
    const application = await submit(submission);
    if (application) {
      setApplication(application);
      setIsPendingValidation(true);
      setActiveMode("tutor");
      router.replace(TUTOR_PENDING_ROUTE);
    }
  };

  const handleEditSection = (targetRoute: Href) => {
    setIsEditDrawerOpen(false);
    router.push(targetRoute);
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <Text className="mb-1 text-[24px] font-bold text-ink">{tr("tutorOnboarding.tutorApplicationSummary.summaryOfYourFile")}</Text>
          <Text className="mb-4 text-[13.5px] text-ink-soft">
            {tr("tutorOnboarding.tutorApplicationSummary.carefullyCheckTheInformationBefore")}</Text>
        </FadeIn>

        <FadeIn delay={90}>
          {state.status === "error" && state.code !== "unauthorized" ? <FormError message={state.message} /> : null}

          <View className="rounded-xl border border-line bg-surface p-4">
            <View className="mb-2 flex-row items-center justify-between border-b border-line-soft pb-2.5">
              <Text className="text-[14px] font-bold text-ink">{tr("tutorOnboarding.tutorApplicationSummary.fileItems")}</Text>
              <PressableScale onPress={() => setIsEditDrawerOpen(true)} accessibilityLabel={tr("tutorOnboarding.tutorApplicationSummary.editTheFile")}>
                <View className="flex-row items-center gap-1">
                  <EditIcon size={14} color="#332E86" />
                  <Text className="text-[13px] font-bold text-primary">{tr("common.edit")}</Text>
                </View>
              </PressableScale>
            </View>

            {sections.map((sec) => (
              <PressableScale
                key={sec.id}
                onPress={() => handleEditSection(sec.route)}
                accessibilityLabel={tr("tutorOnboarding.tutorApplicationSummary.edit2", { label: sec.label })}
              >
                <View className="flex-row items-center gap-3 border-b border-line-soft/60 py-3">
                  <View
                    className={[
                      "h-[22px] w-[22px] items-center justify-center rounded-full",
                      sec.done ? "bg-accent-tint" : "border border-line bg-paper",
                    ].join(" ")}
                  >
                    {sec.done ? <CheckIcon size={14} color="#0E9C82" /> : null}
                  </View>
                  <View className="flex-1">
                    <Text className="text-[14.5px] font-bold text-ink">{sec.label}</Text>
                    <Text className="text-[12px] text-ink-soft" numberOfLines={1}>
                      {sec.summary}
                    </Text>
                  </View>
                  <ChevronRightIcon size={16} color="#9799AF" />
                </View>
              </PressableScale>
            ))}
          </View>
        </FadeIn>

        <FadeIn delay={140}>
          <PressableScale onPress={() => setIsEditDrawerOpen(true)} accessibilityLabel={tr("tutorOnboarding.tutorApplicationSummary.editSpecificSections")}>
            <View className="mt-4 flex-row items-center justify-center gap-2 py-2">
              <EditIcon size={15} color="#332E86" />
              <Text className="text-[14px] font-bold text-primary">
                {tr("tutorOnboarding.tutorApplicationSummary.openTheTargetedEditDialog")}</Text>
            </View>
          </PressableScale>
        </FadeIn>
      </ScrollView>

      {/* Drawer / Modale d'édition ciblée sans réinitialiser au début */}
      <Modal visible={isEditDrawerOpen} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/50">
          <View
            className="max-h-[85%] rounded-t-2xl bg-surface p-5"
            style={{ paddingBottom: Math.max(insets.bottom, 24) }}
          >
            <View className="mb-4 flex-row items-center justify-between border-b border-line-soft pb-3">
              <View>
                <Text className="text-[18px] font-bold text-ink">{tr("tutorOnboarding.tutorApplicationSummary.editASpecificStep")}</Text>
                <Text className="text-[12px] text-ink-soft">
                  {tr("tutorOnboarding.tutorApplicationSummary.goStraightToTheForm")}</Text>
              </View>
              <PressableScale onPress={() => setIsEditDrawerOpen(false)} accessibilityLabel={tr("common.close")}>
                <View className="h-8 w-8 items-center justify-center rounded-full bg-paper">
                  <XIcon size={16} color="#585B78" />
                </View>
              </PressableScale>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} className="gap-2">
              {sections.map((sec) => (
                <PressableScale
                  key={sec.id}
                  onPress={() => handleEditSection(sec.route)}
                  accessibilityLabel={tr("tutorOnboarding.tutorApplicationSummary.edit3", { label: sec.label })}
                >
                  <View className="mb-2 flex-row items-center justify-between rounded-xl border border-line bg-paper p-3.5">
                    <View className="flex-1 pr-2">
                      <Text className="text-[14px] font-bold text-ink">{sec.label}</Text>
                      <Text className="mt-0.5 text-[12px] text-ink-soft">{sec.summary}</Text>
                    </View>
                    <View className="flex-row items-center gap-1 rounded-md bg-surface px-2.5 py-1.5 border border-line">
                      <Text className="text-[11.5px] font-bold text-primary">{tr("tutorOnboarding.tutorApplicationSummary.edit")}</Text>
                      <ChevronRightIcon size={12} color="#332E86" />
                    </View>
                  </View>
                </PressableScale>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        {missing.length > 0 ? (
          <Text className="mb-3 text-center text-[12.5px] text-error">{tr("tutorOnboarding.tutorApplicationSummary.missing", { join: missing.join(", ") })}</Text>
        ) : null}
        <Button
          label={tr("tutorOnboarding.tutorApplicationSummary.submitMyFile")}
          loading={isSubmitting}
          loadingLabel={tr("tutorOnboarding.tutorApplicationSummary.submitting")}
          disabled={!canSubmit}
          onPress={handleSubmit}
        />
      </View>
    </View>
  );
}
