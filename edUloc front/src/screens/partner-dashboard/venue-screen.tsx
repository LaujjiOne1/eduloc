import { type Href, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AttachIcon, FileIcon, TrashIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { type SelectOption, SelectField } from "@/components/ui/select-field";
import { TextAreaField } from "@/components/ui/text-area-field";
import { TextField } from "@/components/ui/text-field";
import { ToneBadge } from "@/components/ui/tone-badge";
import { usePartnerAction } from "@/hooks/use-partner-action";
import { usePartnerVenue } from "@/hooks/use-partner-venue";
import { REVIEW_STATUS, VENUE_DOCUMENT_LABELS, VENUE_TYPE_LABELS } from "@/lib/partner-labels";
import { PartnerService } from "@/services/partner.service";
import type { PartnerVenue, PartnerVenueInput, VenueDocumentKind, VenueTypeId } from "@/types/partner";
import { useTranslation } from "react-i18next";

const DASHBOARD_ROUTE = "/partner-dashboard" as Href;
const DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const DOCUMENT_LIMIT_BYTES = 10 * 1024 * 1024;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TYPE_OPTIONS: SelectOption[] = (Object.keys(VENUE_TYPE_LABELS) as VenueTypeId[]).map((id) => ({ id, label: VENUE_TYPE_LABELS[id] }));
const DOCUMENT_KINDS = Object.keys(VENUE_DOCUMENT_LABELS) as VenueDocumentKind[];

/** Informations de la structure partenaire, justificatifs, et soumission du dossier à l'examen d'EduLoc. */
export function PartnerVenueScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, reload, refresh } = usePartnerVenue();

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      {state.status === "loading" ? (
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
        <VenueForm key={state.venue?.id ?? "new"} venue={state.venue} onChanged={refresh} onDone={() => router.replace(DASHBOARD_ROUTE)} bottomInset={insets.bottom} />
      )}
    </View>
  );
}

function VenueForm({ venue, onChanged, onDone, bottomInset }: { venue: PartnerVenue | null; onChanged: () => Promise<void>; onDone: () => void; bottomInset: number }) {
  const { t } = useTranslation();
  const { busy, error, run, clearError } = usePartnerAction();
  const [name, setName] = useState(venue?.name ?? "");
  const [type, setType] = useState<VenueTypeId>(venue?.type ?? "other");
  const [description, setDescription] = useState(venue?.description ?? "");
  const [legalName, setLegalName] = useState(venue?.legalName ?? "");
  const [registrationNumber, setRegistrationNumber] = useState(venue?.registrationNumber ?? "");
  const [nif, setNif] = useState(venue?.nif ?? "");
  const [stat, setStat] = useState(venue?.stat ?? "");
  const [contactPhone, setContactPhone] = useState(venue?.contactPhone ?? "");
  const [contactEmail, setContactEmail] = useState(venue?.contactEmail ?? "");
  const [fileError, setFileError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Dossier modifiable : brouillon ou corrections demandées. Validé : seuls description et contacts évoluent.
  const fullyEditable = !venue || venue.editable;
  const contactEditable = fullyEditable || venue?.status === "approved";
  const status = venue ? REVIEW_STATUS[venue.status] : null;

  const input: PartnerVenueInput = { name, type, description, legalName, registrationNumber, nif, stat, contactPhone, contactEmail };
  const dirty = useMemo(
    () =>
      !venue ||
      venue.name !== name ||
      venue.type !== type ||
      venue.description !== description ||
      venue.legalName !== legalName ||
      venue.registrationNumber !== registrationNumber ||
      venue.nif !== nif ||
      venue.stat !== stat ||
      venue.contactPhone !== contactPhone ||
      venue.contactEmail !== contactEmail,
    [venue, name, type, description, legalName, registrationNumber, nif, stat, contactPhone, contactEmail],
  );

  const nameError = name.trim().length < 2 ? t("partnerDashboard.venue.enterTheOrganisationName") : undefined;
  const emailError = contactEmail.trim() && !EMAIL.test(contactEmail.trim()) ? t("partnerDashboard.venue.invalidEmailAddress") : undefined;
  const hasContact = contactPhone.trim().length > 0 || (contactEmail.trim().length > 0 && !emailError);
  const canSave = !nameError && !emailError && contactEditable && dirty && busy === null;
  const hasDocument = (venue?.documents.length ?? 0) > 0;
  const canSubmit = !!venue && venue.editable && !dirty && hasContact && hasDocument && busy === null;

  const save = async () => {
    if (!canSave) return;
    setSaved(false);
    const result = await run("save", () => (venue ? PartnerService.updateVenue(input) : PartnerService.createVenue(input)), t("partnerDashboard.venue.unableToSaveTheOrganisation"));
    if (result) {
      setSaved(true);
      await onChanged();
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    const result = await run("submit", () => PartnerService.submitVenue(), t("partnerDashboard.venue.unableToSubmitTheFile"));
    if (result) onDone();
  };

  const pickDocument = async (kind: VenueDocumentKind) => {
    setFileError(null);
    clearError();
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: DOCUMENT_MIME_TYPES, copyToCacheDirectory: true, multiple: false });
      if (picked.canceled || !picked.assets[0]) return;
      const asset = picked.assets[0];
      if (!asset.mimeType || !DOCUMENT_MIME_TYPES.includes(asset.mimeType)) return setFileError(t("common.chooseAPdfJpgOr"));
      if (!asset.size || asset.size > DOCUMENT_LIMIT_BYTES) return setFileError(t("common.eachDocumentMustBe10"));
      const ok = await run(
        `doc-${kind}`,
        () => PartnerService.uploadVenueDocument(kind, { uri: asset.uri, mimeType: asset.mimeType!, sizeBytes: asset.size!, fileName: asset.name }).then(() => true),
        t("partnerDashboard.venue.theSupportingDocumentUploadFailed"),
      );
      if (ok) await onChanged();
    } catch (e) {
      setFileError(e instanceof Error ? t("common.unableToSelectTheFile2", { message: e.message }) : t("common.unableToSelectTheFile"));
    }
  };

  const removeDocument = async (documentId: string) => {
    const ok = await run(`rm-${documentId}`, () => PartnerService.removeVenueDocument(documentId).then(() => true), t("partnerDashboard.venue.unableToDeleteThisSupporting"));
    if (ok) await onChanged();
  };

  return (
    <>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View className="mb-1 flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-[24px] font-bold text-ink">{venue ? t("partnerDashboard.venue.myOrganisation") : t("partnerDashboard.venue.newOrganisation")}</Text>
          {status ? <ToneBadge label={status.label} tone={status.tone} /> : null}
        </View>
        <Text className="mb-4 text-[13.5px] leading-[20px] text-ink-soft">
          {venue ? t("partnerDashboard.venue.thisInformationIsReviewedBy") : t("partnerDashboard.venue.presentYourOrganisationYouWill")}
        </Text>

        {venue?.reviewNote && (venue.status === "needs_correction" || venue.status === "suspended") ? (
          <View className="mb-4 rounded-lg bg-warning-tint p-4">
            <Text className="text-[12.5px] font-bold text-warning">{t("common.messageFromEduloc")}</Text>
            <Text className="mt-1 text-[13.5px] leading-[20px] text-ink">{venue.reviewNote}</Text>
          </View>
        ) : null}
        {venue && !venue.editable ? (
          <View className="mb-4 rounded-lg border border-line bg-paper-alt p-4">
            <Text className="text-[13px] leading-[19px] text-ink-soft">
              {venue.status === "approved"
                ? t("partnerDashboard.venue.yourOrganisationIsValidatedOnly")
                : t("partnerDashboard.venue.theFileCannotBeEdited")}
            </Text>
          </View>
        ) : null}

        <FadeIn delay={30}>
          <TextField label={t("partnerDashboard.venue.organisationName")} value={name} onChangeText={setName} editable={fullyEditable} error={name.length > 0 ? nameError : undefined} placeholder={t("partnerDashboard.venue.eGMunicipalLibrary")} />
          <SelectField label={t("partnerDashboard.venue.organisationType")} value={{ id: type, label: VENUE_TYPE_LABELS[type] }} options={TYPE_OPTIONS} onSelect={(o) => setType(o.id as VenueTypeId)} disabled={!fullyEditable} />
          <TextAreaField label={t("partnerDashboard.venue.presentation")} value={description} onChangeText={setDescription} editable={contactEditable} placeholder={t("partnerDashboard.venue.brieflyPresentTheOrganisation")} />
          <TextField label={t("partnerDashboard.venue.companyNameOptional")} value={legalName} onChangeText={setLegalName} editable={fullyEditable} />
          <TextField label={t("partnerDashboard.venue.registrationNumberOptional")} value={registrationNumber} onChangeText={setRegistrationNumber} editable={fullyEditable} autoCapitalize="characters" />
          <TextField label={t("partnerDashboard.venue.nifOptional")} value={nif} onChangeText={setNif} editable={fullyEditable} autoCapitalize="characters" />
          <TextField label={t("partnerDashboard.venue.statOptional")} value={stat} onChangeText={setStat} editable={fullyEditable} autoCapitalize="characters" />
          <Text className="mb-3 -mt-1 text-[12px] leading-[18px] text-ink-soft">
            {t("partnerDashboard.venue.withoutANifOrStat")}</Text>
          <TextField label={t("partnerDashboard.venue.contactPhone")} value={contactPhone} onChangeText={setContactPhone} editable={contactEditable} keyboardType="phone-pad" placeholder="034 00 000 00" />
          <TextField label={t("partnerDashboard.venue.contactEmail")} value={contactEmail} onChangeText={setContactEmail} editable={contactEditable} keyboardType="email-address" autoCapitalize="none" error={emailError} />
        </FadeIn>

        {error ? (
          <View className="mb-3">
            <FormError message={error} />
          </View>
        ) : null}
        {saved && !dirty ? <Text className="mb-3 text-[13px] font-semibold text-accent">{t("partnerDashboard.venue.informationSaved")}</Text> : null}
        <Button label={venue ? t("common.saveChanges") : t("common.saveMyOrganisation")} loading={busy === "save"} loadingLabel={t("common.saving")} disabled={!canSave} onPress={save} />

        {venue ? (
          <FadeIn delay={60}>
            <Text className="mb-1 mt-8 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("common.supportingDocuments")}</Text>
            <Text className="mb-3 text-[12.5px] leading-[18px] text-ink-faint">
              {t("partnerDashboard.venue.pdfJpgOrPng10")}</Text>
            {fileError ? (
              <View className="mb-3">
                <FormError message={fileError} />
              </View>
            ) : null}
            <View className="rounded-lg border border-line bg-surface px-4">
              {DOCUMENT_KINDS.map((kind, index) => {
                const doc = venue.documents.find((d) => d.kind === kind);
                return (
                  <View key={kind} className={["py-3", index > 0 ? "border-t border-line-soft" : ""].join(" ")}>
                    <Text className="text-[13.5px] font-semibold text-ink">{VENUE_DOCUMENT_LABELS[kind]}</Text>
                    {doc ? (
                      <View className="mt-2 flex-row items-center gap-2">
                        <FileIcon size={16} color="#585B78" />
                        <Text className="flex-1 text-[13px] text-ink-soft" numberOfLines={1}>
                          {doc.fileName} · {doc.sizeLabel}
                        </Text>
                        {venue.editable ? (
                          <PressableScale onPress={() => removeDocument(doc.id)} disabled={busy !== null} accessibilityLabel={t("partnerDashboard.venue.delete", { fileName: doc.fileName })}>
                            <TrashIcon size={16} color="#AC4A40" />
                          </PressableScale>
                        ) : null}
                      </View>
                    ) : venue.editable ? (
                      <View className="mt-2">
                        <Button
                          label={t("common.add")}
                          variant="secondary"
                          size="sm"
                          icon={<AttachIcon size={14} color="#332E86" />}
                          loading={busy === `doc-${kind}`}
                          loadingLabel={t("common.sending")}
                          disabled={busy !== null}
                          onPress={() => pickDocument(kind)}
                        />
                      </View>
                    ) : (
                      <Text className="mt-1 text-[12.5px] text-ink-faint">{t("common.notProvided")}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </FadeIn>
        ) : null}

        {venue?.history.length ? (
          <FadeIn delay={90}>
            <Text className="mb-2 mt-8 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("partnerDashboard.venue.fileTracking")}</Text>
            <View className="rounded-lg border border-line bg-surface px-4">
              {venue.history
                .filter((h) => h.scope === "venue")
                .slice(0, 6)
                .map((h, index) => (
                  <View key={h.id} className={["py-3", index > 0 ? "border-t border-line-soft" : ""].join(" ")}>
                    <Text className="text-[13px] font-semibold text-ink">
                      {h.fromLabel ? `${h.fromLabel} → ` : ""}
                      {h.toLabel}
                    </Text>
                    <Text className="mt-[2px] text-[12px] text-ink-faint">{h.atLabel}</Text>
                    {h.note ? <Text className="mt-1 text-[12.5px] text-ink-soft">{h.note}</Text> : null}
                  </View>
                ))}
            </View>
          </FadeIn>
        ) : null}
      </ScrollView>

      {venue && venue.editable ? (
        <View className="border-t border-line-soft bg-surface px-5 pt-4" style={{ paddingBottom: Math.max(bottomInset, 22) }}>
          {!canSubmit && busy === null ? (
            <Text className="mb-2 text-[12px] leading-[17px] text-ink-faint">
              {dirty ? t("common.saveYourChangesBeforeSubmitting") : !hasContact ? t("partnerDashboard.venue.addAContactPhoneOr") : !hasDocument ? t("partnerDashboard.venue.addAtLeastOneSupporting") : ""}
            </Text>
          ) : null}
          <Button label={t("partnerDashboard.venue.submitTheFileToEduloc")} loading={busy === "submit"} loadingLabel={t("common.sending")} disabled={!canSubmit} onPress={submit} />
        </View>
      ) : null}
    </>
  );
}
