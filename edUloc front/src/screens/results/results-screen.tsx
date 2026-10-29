import { type Href, usePathname, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, type LayoutChangeEvent, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArrowLeftIcon, ChevronRightIcon, ListIcon, MapIcon, SearchIcon } from "@/components/icons";
import { MapLibreResultsMap } from "@/components/map/maplibre-results-map";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { DraggableSheet, type SheetSnap } from "@/components/ui/draggable-sheet";
import { ResultsLoginGate } from "@/components/ui/results-login-gate";
import { TutorAvatar } from "@/components/ui/tutor-avatar";
import { TutorCard } from "@/components/ui/tutor-card";
import { type TutorsState, useTutorSearch } from "@/hooks/use-tutor-search";
import { useAuthStore } from "@/store/auth.store";
import { useSearchWizardStore } from "@/store/search-wizard.store";
import type { Tutor } from "@/types/tutor";
import { useTranslation } from "react-i18next";

function tutorRoute(id: string): Href {
  return `/results/tutor/${id}` as Href;
}

/** Hauteur de la barre flottante du haut (retour + résumé de la recherche), sous la zone sûre. */
const TOP_BAR_HEIGHT = 64;
/** Partie de la feuille visible quand elle est réduite : poignée, titre et bouton « Liste ». */
const PEEK_VISIBLE = 132;

const FLOATING_SHADOW = {
  shadowColor: "#14162B",
  shadowOpacity: 0.14,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 4,
} as const;

/**
 * Résultats façon Airbnb : la carte occupe l'écran et la liste des tuteurs se glisse par-dessus (réduite, à moitié,
 * plein écran). Le bouton flottant bascule entre « Liste » et « Carte ». Sans position (cours en ligne seulement), il
 * n'y a rien à placer sur la carte : la liste s'ouvre d'emblée à plein écran.
 */
export function ResultsScreen() {
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

  // Position choisie par l'utilisateur ; tant qu'il n'a pas touché à la feuille, elle s'ouvre à moitié, ou à plein
  // écran quand les résultats sont arrivés sans position (rien à voir sur la carte, cours en ligne seulement).
  const [pickedSnap, setSnap] = useState<SheetSnap | null>(null);
  const snap: SheetSnap = pickedSnap ?? (state.status !== "loading" && !origin ? "full" : "half");
  const [selectedMapTutorId, setSelectedMapTutorId] = useState<string | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  const tutors = state.status === "success" ? state.tutors : [];
  const selectedMapTutor = tutors.find((t) => t.id === selectedMapTutorId) ?? null;

  const breadcrumb = [criteria.subject?.label, criteria.level?.label, originLabel ?? tr("common.online")]
    .filter(Boolean)
    .join(" • ");
  const count = state.status === "success" ? tr("common.resultCount", { count: state.tutors.length }) : null;

  if (showGate && state.status === "success") {
    return (
      <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
        <AuthHeader onBack={() => router.back()} />
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) }} showsVerticalScrollIndicator={false}>
          <ResultsLoginGate
            count={state.tutors.length}
            genders={state.tutors.map((t) => t.gender)}
            onLogin={() => goAuth("/login")}
            onSignup={() => goAuth("/signup")}
          />
        </ScrollView>
      </View>
    );
  }

  const topOffset = insets.top + TOP_BAR_HEIGHT;
  const peekVisible = PEEK_VISIBLE + insets.bottom;
  const onLayout = (event: LayoutChangeEvent) => setContainerHeight(event.nativeEvent.layout.height);

  return (
    <View className="flex-1 bg-paper-alt" onLayout={onLayout}>
      {/* Carte plein écran, sous la barre du haut et la feuille. */}
      <View className="absolute inset-0 overflow-hidden bg-paper-alt">
        {state.status === "loading" ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="small" color="#332E86" />
            <Text className="mt-2 text-[13.5px] text-ink-soft">{tr("results.results.searching")}</Text>
          </View>
        ) : tutors.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-center text-[14px] text-ink-soft">
              {state.status === "error" ? state.message : tr("results.results.noTutorToShowOn")}
            </Text>
          </View>
        ) : (
          <MapLibreResultsMap
            tutors={tutors}
            selectedTutorId={selectedMapTutor?.id ?? null}
            onSelectTutor={(tutor) => {
              setSelectedMapTutorId(tutor.id);
              setSnap("peek");
            }}
            searchLocationQuery={originLabel ?? ""}
            origin={origin}
          />
        )}
      </View>

      {/* Barre flottante : retour + résumé de la recherche (toucher le résumé rouvre les critères). */}
      <View className="absolute left-0 right-0 flex-row items-center gap-3 px-4" style={{ top: insets.top + 8 }}>
        <PressableScale onPress={() => router.back()} accessibilityLabel={tr("common.back")}>
          <View className="h-12 w-12 items-center justify-center rounded-full border border-line bg-surface" style={FLOATING_SHADOW}>
            <ArrowLeftIcon color="#14162B" />
          </View>
        </PressableScale>
        <View className="flex-1">
          <PressableScale onPress={() => router.back()} accessibilityLabel={tr("search.summary.editACriterion")}>
            <View className="h-12 flex-row items-center gap-[10px] rounded-full border border-line bg-surface px-4" style={FLOATING_SHADOW}>
              <SearchIcon size={16} color="#14162B" />
              <Text className="flex-1 text-[13.5px] font-semibold text-ink" numberOfLines={1}>
                {breadcrumb}
              </Text>
            </View>
          </PressableScale>
        </View>
      </View>

      {/* Aperçu du tuteur touché sur la carte, juste au-dessus de la feuille réduite. */}
      {selectedMapTutor && snap === "peek" ? (
        <FadeIn delay={0} style={{ position: "absolute", left: 16, right: 16, bottom: peekVisible + 12 }}>
          <MapTutorPreview tutor={selectedMapTutor} onPress={() => router.push(tutorRoute(selectedMapTutor.id))} />
        </FadeIn>
      ) : null}

      <DraggableSheet
        snap={snap}
        onSnapChange={setSnap}
        fullHeight={Math.max(containerHeight - topOffset, 0)}
        peekVisible={peekVisible}
        bottomInset={insets.bottom}
        header={
          <View className="items-center px-5 pb-3 pt-2">
            <View className="mb-3 h-[5px] w-11 rounded-full bg-line" />
            <Text className="text-[14.5px] font-bold text-ink">{count ?? tr("results.results.searching")}</Text>
          </View>
        }
      >
        {locationNotice && state.status !== "loading" ? (
          <View className="mb-3 flex-row items-center gap-3 rounded-lg bg-paper-alt px-3 py-2.5">
            <Text className="flex-1 text-[12.5px] text-ink-soft">{locationNotice}</Text>
            <PressableScale onPress={retry} accessibilityLabel={tr("results.results.retryWithMyPosition")}>
              <Text className="text-[12.5px] font-bold text-primary">{tr("common.tryAgain")}</Text>
            </PressableScale>
          </View>
        ) : null}
        <TutorList state={state} onRetry={retry} onSelect={(tutor) => router.push(tutorRoute(tutor.id))} />
      </DraggableSheet>

      {/* Bouton flottant : « Liste » ouvre la feuille à fond, « Carte » la réduit pour libérer la carte. */}
      <View pointerEvents="box-none" className="absolute left-0 right-0 items-center" style={{ bottom: Math.max(insets.bottom, 12) + 16 }}>
        <PressableScale
          onPress={() => setSnap(snap === "full" ? "peek" : "full")}
          accessibilityLabel={snap === "full" ? tr("results.results.map") : tr("results.results.list")}
        >
          <View
            className="flex-row items-center gap-2 rounded-full bg-ink px-5 py-3"
            style={{ shadowColor: "#14162B", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}
          >
            {snap === "full" ? <MapIcon size={16} color="#FFFFFF" /> : <ListIcon size={16} color="#FFFFFF" />}
            <Text className="text-[14px] font-bold text-white">
              {snap === "full" ? tr("results.results.map") : tr("results.results.list")}
            </Text>
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

function MapTutorPreview({ tutor, onPress }: { tutor: Tutor; onPress: () => void }) {
  const { t: tr } = useTranslation();
  return (
    <PressableScale onPress={onPress} accessibilityLabel={`${tutor.firstName} ${tutor.lastName}`}>
      <View
        className="flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-4"
        style={{ shadowColor: "#14162B", shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}
      >
        <TutorAvatar gender={tutor.gender} photoUrl={tutor.photoUrl} size={52} radius={14} />
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
              {tutor.firstName} {tutor.lastName}
            </Text>
            {tutor.isVerified ? (
              <View className="rounded-full bg-accent-tint px-2 py-0.5">
                <Text className="text-[11px] font-semibold text-accent">{tr("results.results.verified")}</Text>
              </View>
            ) : null}
          </View>
          <Text className="text-[12.5px] text-ink-soft" numberOfLines={1}>
            {tutor.subjects[0]}
            {" • "}
            {tutor.location.distanceKm != null
              ? tr("results.results.km", { label: tutor.location.label, distanceKm: tutor.location.distanceKm })
              : tutor.location.label}
          </Text>
          {tutor.nextSlotLabel ? (
            <Text className="mt-0.5 text-[11.5px] font-medium text-primary" numberOfLines={1}>
              {tutor.nextSlotLabel}
            </Text>
          ) : null}
        </View>
        <View className="h-8 w-8 items-center justify-center rounded-full bg-paper-alt">
          <ChevronRightIcon size={16} color="#332E86" />
        </View>
      </View>
    </PressableScale>
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
