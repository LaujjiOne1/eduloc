import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isApiError } from "@/api/errors";
import { CrosshairIcon, HouseIcon, LocationIcon, PlusIcon, TrashIcon, XIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { PlaceSearchField } from "@/components/ui/place-search-field";
import { StepProgress } from "@/components/ui/step-progress";
import { LocationService, type ResolvedLocation } from "@/services/location.service";
import { useTutorApplicationStore } from "@/store/tutor-application.store";
import { useTranslation } from "react-i18next";

const TUTOR_AVAILABILITY_ROUTE = "/tutor-availability" as Href;
const TOTAL_STEPS = 9;

const RADIUS_OPTIONS = [5, 10, 15, 20, 30];

/**
 * Lieux d'intervention du tuteur, selon les façons d'enseigner en présentiel choisies à l'étape précédente.
 * Chaque lieu est une adresse GÉOCODÉE (coordonnées réelles) : la recherche des demandeurs est géographique,
 * un lieu sans coordonnées ne serait jamais trouvé.
 *  - « Je me déplace chez l'élève » : une zone et son rayon d'activité ;
 *  - « J'accueille chez moi » : l'adresse d'accueil ;
 *  - « Lieu public » : un ou plusieurs points de rencontre (bibliothèque, campus…).
 */
export function TutorLocationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inPersonModes = useTutorApplicationStore((s) => s.inPersonModes);
  const locations = useTutorApplicationStore((s) => s.locations);
  const setTravelZone = useTutorApplicationStore((s) => s.setTravelZone);
  const updateTravelRadius = useTutorApplicationStore((s) => s.updateTravelRadius);
  const setTutorHome = useTutorApplicationStore((s) => s.setTutorHome);
  const addPublicPlace = useTutorApplicationStore((s) => s.addPublicPlace);
  const removeLocation = useTutorApplicationStore((s) => s.removeLocation);

  const travel = inPersonModes.includes("beneficiary_home");
  const hosting = inPersonModes.includes("tutor_home");
  const publicPlaces = inPersonModes.includes("public_place");

  const travelZone = locations.find((l) => l.kind === "beneficiary_home");
  const tutorHome = locations.find((l) => l.kind === "tutor_home");
  const meetingPlaces = locations.filter((l) => l.kind === "public_place");

  const [editingTravel, setEditingTravel] = useState(false);
  const [editingHome, setEditingHome] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [pickedPlace, setPickedPlace] = useState<ResolvedLocation | null>(null);
  const [newRadius, setNewRadius] = useState(10);

  const chooseTravelZone = (place: ResolvedLocation) => {
    setTravelZone(place.label, { latitude: place.latitude, longitude: place.longitude });
    setEditingTravel(false);
    setLocateError(null);
  };

  const chooseTutorHome = (place: ResolvedLocation) => {
    setTutorHome(place.label, { latitude: place.latitude, longitude: place.longitude });
    setEditingHome(false);
  };

  const useMyPosition = async () => {
    if (isLocating) return;
    setLocateError(null);
    setIsLocating(true);
    try {
      chooseTravelZone(await LocationService.getCurrentPosition());
    } catch (error) {
      setLocateError(isApiError(error) ? error.message : t("tutorOnboarding.tutorLocations.unableToRetrieveYourPosition"));
    } finally {
      setIsLocating(false);
    }
  };

  const handleAddPublicPlace = () => {
    if (!pickedPlace) return;
    addPublicPlace(pickedPlace.label, newRadius, { latitude: pickedPlace.latitude, longitude: pickedPlace.longitude });
    setPickedPlace(null);
    setNewRadius(10);
    setIsAddModalOpen(false);
  };

  const closeModal = () => {
    setIsAddModalOpen(false);
    setPickedPlace(null);
  };

  const missing: string[] = [];
  if (travel && !travelZone) missing.push(t("tutorOnboarding.tutorLocations.yourTravelArea2"));
  if (hosting && !tutorHome) missing.push(t("tutorOnboarding.tutorLocations.yourHomeAddressForLessons2"));
  if (publicPlaces && meetingPlaces.length === 0) missing.push(t("tutorOnboarding.tutorLocations.atLeastOnePublicPlace"));
  const canContinue = missing.length === 0;

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <StepProgress step={8} total={TOTAL_STEPS} title={t("common.placesAreasOfActivity")} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <Text className="mb-1 text-[24px] font-bold text-ink">{t("tutorOnboarding.tutorLocations.yourTeachingLocations")}</Text>
          <Text className="mb-4 text-[13.5px] text-ink-soft">
            {inPersonModes.length === 0
              ? t("tutorOnboarding.tutorLocations.youOnlyTeachOnlineNo")
              : t("tutorOnboarding.tutorLocations.enterThePlacesThatMatch")}
          </Text>
        </FadeIn>

        {/* Je me déplace chez l'élève */}
        {travel ? (
          <FadeIn delay={80}>
            {travelZone && !editingTravel ? (
              <View className="mb-4 rounded-xl border border-primary/40 bg-surface p-4">
                <View className="flex-row items-center gap-2">
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-primary">
                    <LocationIcon size={16} color="#fff" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[15px] font-bold text-ink">{travelZone.label}</Text>
                    <Text className="text-[12px] font-semibold text-primary">{t("tutorOnboarding.tutorLocations.travelAreaToTheStudent")}</Text>
                  </View>
                  <PressableScale onPress={() => setEditingTravel(true)} accessibilityLabel={t("tutorOnboarding.tutorLocations.editTheTravelArea")}>
                    <Text className="text-[13px] font-bold text-primary">{t("common.edit")}</Text>
                  </PressableScale>
                </View>

                <View className="mt-3.5 border-t border-line-soft pt-3">
                  <Text className="mb-2 text-[12px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
                    {t("tutorOnboarding.tutorLocations.activityRadiusAroundThePlace", { radiusKm: travelZone.radiusKm })}</Text>
                  <View className="flex-row gap-2">
                    {RADIUS_OPTIONS.map((km) => {
                      const isSelected = travelZone.radiusKm === km;
                      return (
                        <PressableScale key={km} onPress={() => updateTravelRadius(km)} accessibilityLabel={t("tutorOnboarding.tutorLocations.km", { km })}>
                          <View
                            className={[
                              "items-center justify-center rounded-lg border px-3 py-1.5",
                              isSelected ? "border-primary bg-primary" : "border-line bg-paper",
                            ].join(" ")}
                          >
                            <Text className={["text-[12.5px] font-bold", isSelected ? "text-white" : "text-ink"].join(" ")}>{t("tutorOnboarding.tutorLocations.km", { km })}</Text>
                          </View>
                        </PressableScale>
                      );
                    })}
                  </View>
                </View>
              </View>
            ) : (
              <View className="mb-4 rounded-xl border border-primary/40 bg-surface p-4">
                <Text className="mb-1 text-[15px] font-bold text-ink">{t("tutorOnboarding.tutorLocations.yourTravelArea")}</Text>
                <Text className="mb-3 text-[12.5px] text-ink-soft">
                  {t("tutorOnboarding.tutorLocations.theNeighbourhoodOrCityAround")}</Text>

                <PressableScale onPress={useMyPosition} disabled={isLocating} accessibilityLabel={t("tutorOnboarding.tutorLocations.useMyPosition")}>
                  <View className="mb-3 flex-row items-center gap-3 rounded-lg border border-line bg-paper p-3">
                    {isLocating ? <ActivityIndicator size="small" color="#332E86" /> : <CrosshairIcon size={18} color="#332E86" />}
                    <Text className="flex-1 text-[14px] font-semibold text-ink">
                      {isLocating ? t("tutorOnboarding.tutorLocations.locating") : t("tutorOnboarding.tutorLocations.useMyPosition")}
                    </Text>
                  </View>
                </PressableScale>
                {locateError ? <Text className="mb-3 text-[12.5px] text-error">{locateError}</Text> : null}

                <PlaceSearchField placeholder={t("tutorOnboarding.tutorLocations.neighbourhoodAddressCity")} onSelect={chooseTravelZone} />

                {travelZone ? (
                  <PressableScale onPress={() => setEditingTravel(false)} accessibilityLabel={t("tutorOnboarding.tutorLocations.cancelTheEdit")}>
                    <Text className="mt-3 text-center text-[13px] font-semibold text-ink-soft">{t("common.cancel")}</Text>
                  </PressableScale>
                ) : null}
              </View>
            )}
          </FadeIn>
        ) : null}

        {/* J'accueille chez moi */}
        {hosting ? (
          <FadeIn delay={100}>
            {tutorHome && !editingHome ? (
              <View className="mb-4 rounded-xl border border-primary/40 bg-surface p-4">
                <View className="flex-row items-center gap-2">
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-primary">
                    <HouseIcon size={16} color="#fff" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[15px] font-bold text-ink">{tutorHome.label}</Text>
                    <Text className="text-[12px] font-semibold text-primary">{t("tutorOnboarding.tutorLocations.homeAddressForLessons")}</Text>
                  </View>
                  <PressableScale onPress={() => setEditingHome(true)} accessibilityLabel={t("tutorOnboarding.tutorLocations.editTheHomeAddress")}>
                    <Text className="text-[13px] font-bold text-primary">{t("common.edit")}</Text>
                  </PressableScale>
                </View>
              </View>
            ) : (
              <View className="mb-4 rounded-xl border border-primary/40 bg-surface p-4">
                <Text className="mb-1 text-[15px] font-bold text-ink">{t("tutorOnboarding.tutorLocations.yourHomeAddressForLessons")}</Text>
                <Text className="mb-3 text-[12.5px] text-ink-soft">
                  {t("tutorOnboarding.tutorLocations.whereYouReceiveYourStudents")}</Text>
                <PlaceSearchField placeholder={t("tutorOnboarding.tutorLocations.yourAddressNeighbourhood")} onSelect={chooseTutorHome} />
                {tutorHome ? (
                  <PressableScale onPress={() => setEditingHome(false)} accessibilityLabel={t("tutorOnboarding.tutorLocations.cancelTheEdit")}>
                    <Text className="mt-3 text-center text-[13px] font-semibold text-ink-soft">{t("common.cancel")}</Text>
                  </PressableScale>
                ) : null}
              </View>
            )}
          </FadeIn>
        ) : null}

        {/* Lieux publics */}
        {publicPlaces ? (
          <FadeIn delay={120}>
            <Text className="mb-2.5 text-[14px] font-bold text-ink">{t("tutorOnboarding.tutorLocations.publicPlaces", { length: meetingPlaces.length })}</Text>

            {meetingPlaces.length === 0 ? (
              <View className="mb-3 rounded-lg border border-dashed border-line bg-surface/60 p-4">
                <Text className="text-center text-[13px] text-ink-soft">
                  {t("tutorOnboarding.tutorLocations.noPublicPlaceAddedFor")}</Text>
              </View>
            ) : (
              <View className="mb-3 gap-2.5">
                {meetingPlaces.map((loc) => (
                  <View key={loc.id} className="flex-row items-center gap-3 rounded-lg border border-line bg-surface p-3.5">
                    <View className="h-9 w-9 items-center justify-center rounded-md bg-paper-alt">
                      <LocationIcon size={16} color="#585B78" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[14.5px] font-bold text-ink">{loc.label}</Text>
                      <Text className="text-[12px] text-ink-soft">{t("tutorOnboarding.tutorLocations.dedicatedRadiusKm", { radiusKm: loc.radiusKm })}</Text>
                    </View>
                    <PressableScale onPress={() => removeLocation(loc.id)} accessibilityLabel={t("tutorOnboarding.tutorLocations.delete", { label: loc.label })}>
                      <View className="p-1">
                        <TrashIcon size={16} color="#E04F5F" />
                      </View>
                    </PressableScale>
                  </View>
                ))}
              </View>
            )}

            <PressableScale onPress={() => setIsAddModalOpen(true)} accessibilityLabel={t("tutorOnboarding.tutorLocations.addAPublicPlace")}>
              <View className="flex-row items-center gap-2 rounded-lg border border-dashed border-primary bg-primary-tint/30 p-3.5">
                <PlusIcon size={17} color="#332E86" />
                <Text className="text-[14px] font-bold text-primary">{t("tutorOnboarding.tutorLocations.addAPublicPlace")}</Text>
              </View>
            </PressableScale>
          </FadeIn>
        ) : null}
      </ScrollView>

      {/* Modal ajout d'un lieu public */}
      <Modal visible={isAddModalOpen} transparent animationType="slide" onRequestClose={closeModal}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="rounded-t-2xl bg-surface p-5" style={{ paddingBottom: Math.max(insets.bottom, 24) }}>
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-[18px] font-bold text-ink">{t("tutorOnboarding.tutorLocations.newPublicPlace")}</Text>
              <PressableScale onPress={closeModal} accessibilityLabel={t("common.close")}>
                <View className="h-8 w-8 items-center justify-center rounded-full bg-paper">
                  <XIcon size={16} color="#585B78" />
                </View>
              </PressableScale>
            </View>

            <Text className="mb-1 text-[12.5px] font-semibold text-ink-soft">{t("tutorOnboarding.tutorLocations.addressOrNameOfThe")}</Text>
            <View className="mb-4">
              <PlaceSearchField placeholder={t("tutorOnboarding.tutorLocations.eGMediatheque67Ha")} onSelect={setPickedPlace} />
            </View>
            {pickedPlace ? (
              <Text className="mb-4 text-[12.5px] font-semibold text-accent" numberOfLines={2}>
                {t("tutorOnboarding.tutorLocations.selectedPlace", { label: pickedPlace.label })}
              </Text>
            ) : null}

            <Text className="mb-2 text-[12.5px] font-semibold text-ink-soft">{t("tutorOnboarding.tutorLocations.dedicatedActivityRadiusKm", { newRadius })}</Text>
            <View className="mb-5 flex-row gap-2">
              {RADIUS_OPTIONS.map((km) => (
                <PressableScale key={km} onPress={() => setNewRadius(km)} accessibilityLabel={t("tutorOnboarding.tutorLocations.km", { km })}>
                  <View className={["rounded-lg border px-3 py-1.5", newRadius === km ? "border-primary bg-primary" : "border-line bg-paper"].join(" ")}>
                    <Text className={["text-[12.5px] font-bold", newRadius === km ? "text-white" : "text-ink"].join(" ")}>{t("tutorOnboarding.tutorLocations.km", { km })}</Text>
                  </View>
                </PressableScale>
              ))}
            </View>

            <Button label={t("tutorOnboarding.tutorLocations.addThisPlace")} disabled={!pickedPlace} onPress={handleAddPublicPlace} />
          </View>
        </View>
      </Modal>

      <View className="border-t border-line-soft bg-surface px-5 pt-4" style={{ paddingBottom: Math.max(insets.bottom, 22) }}>
        {!canContinue ? (
          <Text className="mb-3 text-center text-[12.5px] text-ink-soft">{t("tutorOnboarding.tutorLocations.fillInToContinue", { join: missing.join(", ") })}</Text>
        ) : null}
        <Button label={t("common.continue")} disabled={!canContinue} onPress={() => router.push(TUTOR_AVAILABILITY_ROUTE)} />
      </View>
    </View>
  );
}
