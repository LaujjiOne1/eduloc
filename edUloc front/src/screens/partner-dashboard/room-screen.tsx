import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RoomBlocksEditor } from "@/components/partner/room-blocks-editor";
import { RoomOpeningsEditor } from "@/components/partner/room-openings-editor";
import { RoomPhotosEditor } from "@/components/partner/room-photos-editor";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormError } from "@/components/ui/form-error";
import { PlaceSearchField } from "@/components/ui/place-search-field";
import { TextAreaField } from "@/components/ui/text-area-field";
import { TextField } from "@/components/ui/text-field";
import { ToneBadge } from "@/components/ui/tone-badge";
import { usePartnerAction } from "@/hooks/use-partner-action";
import { usePartnerRoom } from "@/hooks/use-partner-room";
import { MISSING_FIELD_LABELS, PUBLICATION_LABELS, REVIEW_STATUS } from "@/lib/partner-labels";
import { PartnerService } from "@/services/partner.service";
import type { PartnerRoomDetail, PartnerRoomInput, RoomBlock } from "@/types/partner";
import { useTranslation } from "react-i18next";

const DASHBOARD_ROUTE = "/partner-dashboard" as Href;
const SUBSCRIPTION_ROUTE = "/partner-dashboard/subscription" as Href;
const roomRoute = (id: string) => `/partner-dashboard/rooms/${id}` as Href;
const reservationsRoute = (id: string) => `/partner-dashboard/reservations?roomId=${id}` as Href;

const splitList = (value: string): string[] =>
  Array.from(new Set(value.split(",").map((v) => v.trim()).filter(Boolean)));

/** Fiche d'une salle : création, informations, soumission INDIVIDUELLE, publication, horaires, fermetures, photos. */
export function PartnerRoomScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, reload, refresh, apply } = usePartnerRoom(id);

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => (router.canGoBack() ? router.back() : router.replace(DASHBOARD_ROUTE))} />
      {!id ? (
        <RoomForm room={null} onCreated={(created) => router.replace(roomRoute(created.id))} onUpdated={() => undefined} />
      ) : state.status === "loading" ? (
        <View className="gap-3 px-5">
          {[0, 1, 2].map((i) => (
            <View key={i} className="h-[64px] rounded-lg bg-line-soft" />
          ))}
        </View>
      ) : state.status === "error" ? (
        <View className="flex-row items-center gap-3 px-5">
          <Text className="flex-1 text-[13.5px] text-error">{state.message}</Text>
          <PressableScale onPress={reload} accessibilityLabel={t("common.tryAgain")}>
            <Text className="text-[13.5px] font-semibold text-primary">{t("common.tryAgain")}</Text>
          </PressableScale>
        </View>
      ) : (
        <RoomForm
          key={state.room.id}
          room={state.room}
          blocks={state.blocks}
          onCreated={() => undefined}
          onUpdated={apply}
          onRefresh={refresh}
          onDeleted={() => router.replace(DASHBOARD_ROUTE)}
          onOpenSubscription={() => router.push(SUBSCRIPTION_ROUTE)}
          onOpenReservations={() => router.push(reservationsRoute(state.room.id))}
          bottomInset={insets.bottom}
        />
      )}
    </View>
  );
}

type RoomFormProps = {
  room: PartnerRoomDetail | null;
  blocks?: RoomBlock[];
  onCreated: (room: PartnerRoomDetail) => void;
  onUpdated: (room: PartnerRoomDetail) => void;
  onRefresh?: () => Promise<void>;
  onDeleted?: () => void;
  onOpenSubscription?: () => void;
  onOpenReservations?: () => void;
  bottomInset?: number;
};

function RoomForm({ room, blocks = [], onCreated, onUpdated, onRefresh, onDeleted, onOpenSubscription, onOpenReservations, bottomInset = 0 }: RoomFormProps) {
  const { t } = useTranslation();
  const { busy, error, run } = usePartnerAction();
  const [name, setName] = useState(room?.name ?? "");
  const [description, setDescription] = useState(room?.description ?? "");
  const [zoneLabel, setZoneLabel] = useState(room?.zoneLabel ?? "");
  const [addressLine, setAddressLine] = useState(room?.addressLine ?? "");
  const [city, setCity] = useState(room?.city ?? "");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(
    room && room.latitude !== null && room.longitude !== null ? { latitude: room.latitude, longitude: room.longitude } : null,
  );
  const [accessInstructions, setAccessInstructions] = useState(room?.accessInstructions ?? "");
  const [capacity, setCapacity] = useState(String(room?.capacity ?? 1));
  const [equipment, setEquipment] = useState(room?.equipment.join(", ") ?? "");
  const [accessibility, setAccessibility] = useState(room?.accessibility.join(", ") ?? "");
  const [welcomesMinors, setWelcomesMinors] = useState(room?.welcomesMinors ?? false);
  const [pricePerHour, setPricePerHour] = useState(room?.pricePerHour ?? "");
  const [rules, setRules] = useState(room?.rules ?? "");
  const [cancellationPolicy, setCancellationPolicy] = useState(room?.cancellationPolicy ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);

  const status = room ? REVIEW_STATUS[room.status] : null;
  const fullyEditable = !room || room.editable;
  // Salle validée : identité figée ; le reste (équipements, tarif, règles, accès…) reste modifiable.
  const detailsEditable = fullyEditable || room?.status === "approved";
  const identityEditable = fullyEditable;

  const capacityValue = Number.parseInt(capacity, 10);
  const priceValue = pricePerHour.trim() === "" ? null : Number(pricePerHour.replace(/\s/g, ""));
  const nameError = name.trim().length < 2 ? t("partnerDashboard.room.enterTheRoomName") : undefined;
  const capacityError = !Number.isInteger(capacityValue) || capacityValue < 1 ? t("partnerDashboard.room.theCapacityMustBeAt") : undefined;
  const priceError = priceValue !== null && (!Number.isFinite(priceValue) || priceValue < 0) ? t("partnerDashboard.room.invalidRate") : undefined;

  const input: PartnerRoomInput = {
    name, description, addressLine, city,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    accessInstructions, zoneLabel,
    capacity: Number.isInteger(capacityValue) ? capacityValue : 1,
    equipment: splitList(equipment),
    accessibility: splitList(accessibility),
    welcomesMinors,
    pricePerHour: priceValue,
    rules, cancellationPolicy,
  };

  /** Champs modifiés : on n'envoie que ce qui change (une salle validée refuse toute modification d'identité). */
  const changes = (): Partial<PartnerRoomInput> => {
    if (!room) return input;
    const diff: Partial<PartnerRoomInput> = {};
    const keys = Object.keys(input) as (keyof PartnerRoomInput)[];
    for (const key of keys) {
      const before: unknown =
        key === "pricePerHour" ? (room.pricePerHour === "" ? null : Number(room.pricePerHour))
          : key === "equipment" ? room.equipment
            : key === "accessibility" ? room.accessibility
              : room[key as keyof PartnerRoomDetail];
      if (JSON.stringify(before) !== JSON.stringify(input[key])) (diff as Record<string, unknown>)[key] = input[key];
    }
    return diff;
  };
  const dirty = !room || Object.keys(changes()).length > 0;
  const canSave = !nameError && !capacityError && !priceError && detailsEditable && dirty && busy === null;

  const save = async () => {
    if (!canSave) return;
    setSaved(false);
    const result = await run(
      "save",
      () => (room ? PartnerService.updateRoom(room.id, changes()) : PartnerService.createRoom(input)),
      t("partnerDashboard.room.unableToSaveTheRoom"),
    );
    if (!result) return;
    setSaved(true);
    if (room) onUpdated(result);
    else onCreated(result);
  };

  const act = async (key: string, action: () => Promise<PartnerRoomDetail>, fallback: string) => {
    const result = await run(key, action, fallback);
    if (result) {
      setSaved(false);
      onUpdated(result);
    }
  };

  const remove = async () => {
    if (!room) return;
    const ok = await run("delete", () => PartnerService.deleteRoom(room.id).then(() => true), t("partnerDashboard.room.unableToDeleteTheRoom"));
    if (ok) onDeleted?.();
  };

  const canSubmit = !!room && room.editable && room.missingFields.length === 0 && !dirty && busy === null;

  return (
    <>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View className="mb-1 flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-[24px] font-bold text-ink">{room ? room.name : t("partnerDashboard.room.newRoom")}</Text>
          {status ? <ToneBadge label={status.label} tone={status.tone} /> : null}
        </View>

        {room ? (
          <FadeIn delay={20}>
            <View className="mb-4 mt-2 rounded-lg border border-line bg-surface p-4">
              <Text className="text-[13px] text-ink-soft">
                {PUBLICATION_LABELS[room.publication]} · {room.bookable ? t("common.bookable") : t("common.notBookable")}
                {!room.isActive ? t("partnerDashboard.room.temporarilyClosed") : ""}
              </Text>
              {room.reviewNote && ["needs_correction", "suspended", "rejected"].includes(room.status) ? (
                <View className="mt-3 rounded-md bg-warning-tint p-3">
                  <Text className="text-[12.5px] font-bold text-warning">{t("common.messageFromEduloc")}</Text>
                  <Text className="mt-1 text-[13px] leading-[19px] text-ink">{room.reviewNote}</Text>
                </View>
              ) : null}
              {room.editable && room.missingFields.length > 0 ? (
                <View className="mt-3">
                  <Text className="mb-1 text-[12.5px] font-bold text-ink">{t("partnerDashboard.room.toCompleteBeforeSubmitting")}</Text>
                  {room.missingFields.map((f) => (
                    <Text key={f} className="text-[12.5px] leading-[18px] text-ink-soft">
                      • {MISSING_FIELD_LABELS[f] ?? f}
                    </Text>
                  ))}
                </View>
              ) : null}
              {room.status === "approved" ? (
                <Text className="mt-3 text-[12.5px] leading-[18px] text-ink-faint">
                  {t("partnerDashboard.room.roomValidatedItsNameAddress")}</Text>
              ) : null}
              {room.status === "submitted" || room.status === "under_review" ? (
                <Text className="mt-3 text-[12.5px] leading-[18px] text-ink-faint">{t("partnerDashboard.room.theRoomIsUnderReview")}</Text>
              ) : null}
            </View>
          </FadeIn>
        ) : (
          <Text className="mb-4 mt-1 text-[13.5px] leading-[20px] text-ink-soft">
            {t("partnerDashboard.room.fillInTheRoomAs")}</Text>
        )}

        <FadeIn delay={40}>
          <TextField label={t("partnerDashboard.room.roomName")} value={name} onChangeText={setName} editable={identityEditable} error={name.length > 0 ? nameError : undefined} />
          <TextAreaField label={t("common.description")} value={description} onChangeText={setDescription} editable={detailsEditable} placeholder={t("partnerDashboard.room.atmosphereUsesWhatToKnow")} />

          <Text className="mb-1 mt-2 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("partnerDashboard.room.exactAddressPrivate")}</Text>
          <Text className="mb-2 text-[12px] leading-[17px] text-ink-faint">
            {t("partnerDashboard.room.neverShownBeforeASession")}</Text>
          {identityEditable ? (
            <View className="mb-3">
              <PlaceSearchField
                placeholder={t("partnerDashboard.room.searchForTheRoomAddress")}
                initialQuery={addressLine}
                onSelect={(place) => {
                  setAddressLine(place.label);
                  setCoords({ latitude: place.latitude, longitude: place.longitude });
                }}
              />
            </View>
          ) : null}
          <TextField label={t("partnerDashboard.room.address")} value={addressLine} onChangeText={setAddressLine} editable={identityEditable} />
          <TextField label={t("partnerDashboard.room.city")} value={city} onChangeText={setCity} editable={identityEditable} />
          <Text className={["mb-3 text-[12.5px]", coords ? "text-accent" : "text-ink-faint"].join(" ")}>
            {coords ? t("partnerDashboard.room.geographicPositionSaved") : t("partnerDashboard.room.chooseASearchSuggestionTo")}
          </Text>
          <TextField
            label={t("partnerDashboard.room.areaShownPublicly")}
            value={zoneLabel}
            onChangeText={setZoneLabel}
            editable={identityEditable}
            placeholder={t("partnerDashboard.room.eGAnalakelyAntananarivo")}
          />
          <Text className="-mt-2 mb-3 text-[12px] leading-[17px] text-ink-faint">
            {t("partnerDashboard.room.neighbourhoodOrCityOnlyThis")}</Text>
          <TextAreaField
            label={t("partnerDashboard.room.accessInstructionsPrivate")}
            value={accessInstructions}
            onChangeText={setAccessInstructions}
            editable={detailsEditable}
            placeholder={t("partnerDashboard.room.codeFloorReception")}
            minHeight={70}
            hint={t("partnerDashboard.room.sharedOnlyAfterTheSession")}
          />

          <TextField label={t("partnerDashboard.room.capacityNumberOfSeats")} value={capacity} onChangeText={setCapacity} editable={detailsEditable} keyboardType="number-pad" error={capacityError} />
          <TextField label={t("partnerDashboard.room.equipment")} value={equipment} onChangeText={setEquipment} editable={detailsEditable} placeholder={t("partnerDashboard.room.whiteboardWiFiProjector")} />
          <TextField label={t("partnerDashboard.room.accessibility")} value={accessibility} onChangeText={setAccessibility} editable={detailsEditable} placeholder={t("partnerDashboard.room.wheelchairAccessLift")} />
          <Text className="-mt-2 mb-3 text-[12px] text-ink-faint">{t("partnerDashboard.room.separateTheItemsWithCommas")}</Text>
          <TextField label={t("partnerDashboard.room.hourlyRateAr")} value={pricePerHour} onChangeText={setPricePerHour} editable={detailsEditable} keyboardType="numeric" error={priceError} placeholder="5000" />
          <TextAreaField label={t("partnerDashboard.room.rulesOfUse")} value={rules} onChangeText={setRules} editable={detailsEditable} placeholder={t("partnerDashboard.room.quietMealsEquipment")} />
          <TextAreaField label={t("partnerDashboard.room.cancellationPolicyOptional")} value={cancellationPolicy} onChangeText={setCancellationPolicy} editable={detailsEditable} minHeight={70} />

          <View className="mb-4">
            <Checkbox
              checked={welcomesMinors}
              onCheckedChange={setWelcomesMinors}
              disabled={!identityEditable}
              label={t("partnerDashboard.room.thisRoomWelcomesMinors")}
              description={t("partnerDashboard.room.noByDefaultRequestsFor")}
            />
          </View>
        </FadeIn>

        {error ? (
          <View className="mb-3">
            <FormError message={error} />
          </View>
        ) : null}
        {saved && !dirty ? <Text className="mb-3 text-[13px] font-semibold text-accent">{t("partnerDashboard.room.roomSaved")}</Text> : null}
        <Button label={room ? t("common.saveChanges") : t("partnerDashboard.room.createTheRoomDraft")} loading={busy === "save"} loadingLabel={t("common.saving")} disabled={!canSave} onPress={save} />

        {room ? (
          <>
            <FadeIn delay={60}>
              <SectionTitle label={t("partnerDashboard.room.openingHours")} />
              <RoomOpeningsEditor roomId={room.id} initial={room.openings} disabled={room.status === "rejected"} onSaved={() => void onRefresh?.()} />
            </FadeIn>
            <FadeIn delay={80}>
              <SectionTitle label={t("partnerDashboard.room.oneOffClosures")} />
              <RoomBlocksEditor roomId={room.id} blocks={blocks} onChanged={() => void onRefresh?.()} />
            </FadeIn>
            <FadeIn delay={100}>
              <SectionTitle label={t("partnerDashboard.room.photos")} />
              <RoomPhotosEditor roomId={room.id} photos={room.photos} disabled={room.status === "rejected"} onChanged={() => void onRefresh?.()} />
            </FadeIn>

            <FadeIn delay={120}>
              <SectionTitle label={t("common.publication")} />
              <PublicationActions
                room={room}
                busy={busy}
                dirty={dirty}
                canSubmit={canSubmit}
                onSubmit={() => act("submit", () => PartnerService.submitRoom(room.id), t("partnerDashboard.room.unableToSubmitTheRoom"))}
                onPublish={() => act("publish", () => PartnerService.publishRoom(room.id), t("partnerDashboard.room.unableToPublishTheRoom"))}
                onUnpublish={() => act("unpublish", () => PartnerService.unpublishRoom(room.id), t("partnerDashboard.room.unableToUnpublishTheRoom"))}
                onToggleActive={() => act("active", () => PartnerService.setRoomActive(room.id, !room.isActive), t("partnerDashboard.room.unableToChangeTheRoom"))}
                onOpenSubscription={() => onOpenSubscription?.()}
              />
            </FadeIn>

            <FadeIn delay={140}>
              <View className="mt-6">
                <Button label={t("partnerDashboard.room.viewThisRoomSReservations")} variant="ghost" onPress={() => onOpenReservations?.()} />
              </View>
              {room.editable || room.status === "rejected" ? (
                confirmDelete ? (
                  <View className="mt-4 rounded-lg bg-error-tint p-4">
                    <Text className="mb-3 text-[13px] leading-[19px] text-ink">{t("partnerDashboard.room.permanentlyDeleteThisRoom")}</Text>
                    <View className="flex-row gap-[10px]">
                      <Button label={t("common.cancel")} variant="ghost" size="sm" disabled={busy !== null} onPress={() => setConfirmDelete(false)} />
                      <Button label={t("common.delete")} size="sm" loading={busy === "delete"} loadingLabel={t("common.deleting")} disabled={busy !== null} onPress={remove} />
                    </View>
                  </View>
                ) : (
                  <PressableScale onPress={() => setConfirmDelete(true)} accessibilityLabel={t("partnerDashboard.room.deleteTheRoom")}>
                    <Text className="mt-5 text-center text-[13.5px] font-bold text-error">{t("partnerDashboard.room.deleteThisRoom")}</Text>
                  </PressableScale>
                )
              ) : null}
            </FadeIn>
          </>
        ) : null}
      </ScrollView>
      <View style={{ height: Math.max(bottomInset, 0) }} />
    </>
  );
}

function SectionTitle({ label }: { label: string }) {
  return <Text className="mb-2 mt-8 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{label}</Text>;
}

function PublicationActions({
  room,
  busy,
  dirty,
  canSubmit,
  onSubmit,
  onPublish,
  onUnpublish,
  onToggleActive,
  onOpenSubscription,
}: {
  room: PartnerRoomDetail;
  busy: string | null;
  dirty: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onToggleActive: () => void;
  onOpenSubscription: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-3">
      {room.editable ? (
        <>
          <Button label={t("partnerDashboard.room.submitThisRoomToEduloc")} loading={busy === "submit"} loadingLabel={t("common.sending")} disabled={!canSubmit} onPress={onSubmit} />
          <Text className="text-[12px] leading-[17px] text-ink-faint">
            {dirty
              ? t("common.saveYourChangesBeforeSubmitting")
              : room.missingFields.length > 0
                ? t("partnerDashboard.room.completeTheFormSeeThe")
                : t("partnerDashboard.room.eachRoomIsReviewedSeparately")}
          </Text>
        </>
      ) : null}

      {room.status === "approved" ? (
        <>
          {room.publication === "published" ? (
            <Button label={t("partnerDashboard.room.removeFromPublication")} variant="ghost" loading={busy === "unpublish"} loadingLabel={t("common.pleaseWait")} disabled={busy !== null} onPress={onUnpublish} />
          ) : room.publication === "unpublished_by_admin" ? (
            <Text className="text-[13px] leading-[19px] text-warning">{t("partnerDashboard.room.thisRoomWasUnpublishedBy")}</Text>
          ) : (
            <>
              <Button label={t("partnerDashboard.room.publishTheRoom")} loading={busy === "publish"} loadingLabel={t("partnerDashboard.room.publishing")} disabled={busy !== null} onPress={onPublish} />
              <PressableScale onPress={onOpenSubscription} accessibilityLabel={t("common.manageTheCommercialPlan")}>
                <Text className="text-[12.5px] leading-[18px] text-primary">
                  {t("partnerDashboard.room.publishingRequiresAnActiveCommercial")}</Text>
              </PressableScale>
            </>
          )}
          <Button
            label={room.isActive ? t("partnerDashboard.room.temporarilyCloseTheRoom") : t("partnerDashboard.room.reopenTheRoom")}
            variant="ghost"
            loading={busy === "active"}
            loadingLabel={t("common.pleaseWait")}
            disabled={busy !== null}
            onPress={onToggleActive}
          />
          {room.isActive ? (
            <Text className="text-[12px] leading-[17px] text-ink-faint">
              {t("partnerDashboard.room.onceClosedTheRoomIs")}</Text>
          ) : null}
        </>
      ) : null}

      {room.status === "suspended" ? <Text className="text-[13px] leading-[19px] text-error">{t("partnerDashboard.room.roomSuspendedByEdulocIt")}</Text> : null}
      {room.status === "rejected" ? <Text className="text-[13px] leading-[19px] text-error">{t("partnerDashboard.room.roomRejectedSeeTheMessage")}</Text> : null}
    </View>
  );
}
