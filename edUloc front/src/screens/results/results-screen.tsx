import { type Href, usePathname, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronRightIcon, ListIcon, MapIcon } from "@/components/icons";
import { MapLibreResultsMap } from "@/components/map/maplibre-results-map";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { TutorAvatar } from "@/components/ui/tutor-avatar";
import { ResultsLoginGate } from "@/components/ui/results-login-gate";
import { SegmentedTabSwitch } from "@/components/ui/segmented-tab-switch";
import { TutorCard } from "@/components/ui/tutor-card";
import { type TutorsState, useTutorSearch } from "@/hooks/use-tutor-search";
import { useAuthStore } from "@/store/auth.store";
import { useSearchWizardStore } from "@/store/search-wizard.store";
import type { Tutor } from "@/types/tutor";
import { useTranslation } from "react-i18next";

function tutorRoute(id: string): Href {
  return `/results/tutor/${id}` as Href;
}

export type ResultsScreenProps = {
  initialTab?: "list" | "map";
};

export function ResultsScreen({ initialTab = "list" }: ResultsScreenProps) {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const criteria = useSearchWizardStore((s) => s.criteria);
  const { state, retry, origin, originLabel, locationNotice } = useTutorSearch(criteria);

  // Visiteur non connecté : on annonce « N tuteurs disponibles près de vous », les résultats viennent après connexion.
  const pathname = usePathname();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const isSignedIn = useAuthStore((s) => s.user !== null);
  const setReturnTo = useAuthStore((s) => s.setReturnTo);
  const isGuest = hasHydrated && !isSignedIn;
  const showGate = isGuest && state.status === "success";
  const goAuth = (route: string) => {
    setReturnTo(pathname as Href); // on revient sur les résultats après la connexion
    router.push(route as Href);
  };

  // Tab state: "list" or "map" — switching tabs is in-screen with an animated pill,
  // without unmounting or triggering a disruptive router page reload.
  const [activeTab, setActiveTab] = useState<"list" | "map">(initialTab);
  const [selectedMapTutorId, setSelectedMapTutorId] = useState<string | null>(null);

  const tutors = state.status === "success" ? state.tutors : [];
  const selectedMapTutor =
    tutors.find((t) => t.id === selectedMapTutorId) ?? tutors[0] ?? null;

  const breadcrumb = [criteria.subject?.label, criteria.level?.label, originLabel ?? tr("common.online")]
    .filter(Boolean)
    .join(" • ");

  const handleTabChange = (newTab: "list" | "map") => {
    setActiveTab(newTab);
    // Keep browser address bar in sync without triggering full screen unmount/navigation
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const targetUrl = newTab === "map" ? "/results/map" : "/results";
      window.history.replaceState(null, "", targetUrl);
    }
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />

      <View className="px-5 pb-[14px]">
        <FadeIn delay={30}>
          <Text className="mb-3 text-[13px] text-ink-soft">
            {breadcrumb}
            {state.status === "success" && !showGate ? (
              <Text className="font-bold text-ink">
                {" "}
                — {tr("common.resultCount", { count: state.tutors.length })}
              </Text>
            ) : null}
          </Text>
        </FadeIn>

        {locationNotice && state.status !== "loading" ? (
          <FadeIn delay={50}>
            <View className="mb-3 flex-row items-center gap-3 rounded-lg bg-surface-tint px-3 py-2.5">
              <Text className="flex-1 text-[12.5px] text-ink-soft">{locationNotice}</Text>
              <PressableScale onPress={retry} accessibilityLabel={tr("results.results.retryWithMyPosition")}>
                <Text className="text-[12.5px] font-bold text-primary">{tr("common.tryAgain")}</Text>
              </PressableScale>
            </View>
          </FadeIn>
        ) : null}

        {/* Animated Segmented Tab Switch: gliding pill between "Liste" and "Carte" */}
        {showGate ? null : <FadeIn delay={70}>
          <SegmentedTabSwitch<"list" | "map">
            options={[
              {
                id: "list",
                label: tr("results.results.list"),
                icon: ({ size, color }) => <ListIcon size={size} color={color} />,
              },
              {
                id: "map",
                label: tr("results.results.map"),
                icon: ({ size, color }) => <MapIcon size={size} color={color} />,
              },
            ]}
            value={activeTab}
            onChange={handleTabChange}
          />
        </FadeIn>}
      </View>

      {showGate && state.status === "success" ? (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) }} showsVerticalScrollIndicator={false}>
          <ResultsLoginGate
            count={state.tutors.length}
            genders={state.tutors.map((t) => t.gender)}
            onLogin={() => goAuth("/login")}
            onSignup={() => goAuth("/signup")}
          />
        </ScrollView>
      ) : null}

      {/* Tab 1: Scrollable List of Tutors */}
      {showGate ? null : activeTab === "list" ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: Math.max(insets.bottom, 20),
          }}
          showsVerticalScrollIndicator={false}
        >
          <TutorList
            state={state}
            onRetry={retry}
            onSelect={(tutor) => router.push(tutorRoute(tutor.id))}
          />
        </ScrollView>
      ) : (
        /* Tab 2: Interactive Results Map with Floating Tutor Preview */
        <View className="relative flex-1 overflow-hidden bg-paper-alt">
          {state.status === "loading" ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="small" color="#332E86" />
              <Text className="mt-2 text-[13.5px] text-ink-soft">
                {tr("common.loadingTheMap")}</Text>
            </View>
          ) : tutors.length === 0 ? (
            <View className="flex-1 items-center justify-center px-8">
              <Text className="text-center text-[14px] text-ink-soft">
                {state.status === "error"
                  ? state.message
                  : tr("results.results.noTutorToShowOn")}
              </Text>
            </View>
          ) : (
            <MapLibreResultsMap
              tutors={tutors}
              selectedTutorId={selectedMapTutor?.id ?? null}
              onSelectTutor={(tutor) => setSelectedMapTutorId(tutor.id)}
              searchLocationQuery={originLabel ?? ""}
              origin={origin}
            />
          )}

          {selectedMapTutor ? (
            <FadeIn
              delay={0}
              style={{ position: "absolute", left: 20, right: 20, bottom: 20 }}
            >
              <PressableScale
                onPress={() => router.push(tutorRoute(selectedMapTutor.id))}
                accessibilityLabel={`${selectedMapTutor.firstName} ${selectedMapTutor.lastName}`}
              >
                <View
                  className="flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-4"
                  style={{
                    shadowColor: "#14162B",
                    shadowOpacity: 0.16,
                    shadowRadius: 18,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 6,
                  }}
                >
                  <TutorAvatar gender={selectedMapTutor.gender} photoUrl={selectedMapTutor.photoUrl} size={52} radius={14} />
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
                        {selectedMapTutor.firstName} {selectedMapTutor.lastName}
                      </Text>
                      {selectedMapTutor.isVerified ? (
                        <View className="rounded-full bg-accent-tint px-2 py-0.5">
                          <Text className="text-[11px] font-semibold text-accent">
                            {tr("results.results.verified")}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="text-[12.5px] text-ink-soft" numberOfLines={1}>
                      {selectedMapTutor.subjects[0]}
                      {" • "}
                      {selectedMapTutor.location.distanceKm != null
                        ? tr("results.results.km", { label: selectedMapTutor.location.label, distanceKm: selectedMapTutor.location.distanceKm })
                        : selectedMapTutor.location.label}
                    </Text>
                    {selectedMapTutor.nextSlotLabel ? (
                      <Text
                        className="mt-0.5 text-[11.5px] font-medium text-primary"
                        numberOfLines={1}
                      >
                        {selectedMapTutor.nextSlotLabel}
                      </Text>
                    ) : null}
                  </View>
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-paper-alt">
                    <ChevronRightIcon size={16} color="#332E86" />
                  </View>
                </View>
              </PressableScale>
            </FadeIn>
          ) : null}
        </View>
      )}
    </View>
  );
}

type TutorListProps = {
  state: TutorsState;
  onRetry: () => void;
  onSelect: (tutor: Tutor) => void;
};

function TutorList({ state, onRetry, onSelect }: TutorListProps) {
  const { t: tr } = useTranslation();
  if (state.status === "loading") {
    return (
      <View className="gap-3">
        {[0, 1, 2].map((i) => (
          <View key={i} className="h-[112px] rounded-lg bg-line-soft" />
        ))}
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View className="flex-row items-center gap-3">
        <Text className="flex-1 text-[13.5px] text-error">{state.message}</Text>
        <PressableScale
          onPress={onRetry}
          accessibilityLabel={tr("results.results.tryLoadingTheTutorsAgain")}
        >
          <Text className="text-[13.5px] font-semibold text-primary">{tr("common.tryAgain")}</Text>
        </PressableScale>
      </View>
    );
  }

  if (state.status === "empty") {
    return (
      <View className="items-center py-10">
        <Text className="text-center text-[14px] text-ink-soft">
          {tr("results.results.noTutorMatchesYourSearch")}</Text>
      </View>
    );
  }

  return (
    <View>
      {state.tutors.map((tutor, index) => (
        <FadeIn key={tutor.id} delay={90 + index * 50}>
          <TutorCard tutor={tutor} onPress={() => onSelect(tutor)} />
        </FadeIn>
      ))}
    </View>
  );
}
