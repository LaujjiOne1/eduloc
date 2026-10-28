import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isApiError } from "@/api/errors";
import { AttachIcon, FileIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { useConversationMessages } from "@/hooks/use-conversation-messages";
import { useSendMessage } from "@/hooks/use-send-message";
import { openAttachment, pickChatDocument } from "@/lib/attachments";
import type { DocumentMessage } from "@/types/message";
import { useTranslation } from "react-i18next";

/** 27_DocumentExchange — liste des documents de la conversation + envoi d'un vrai fichier (PDF / image). */
export function DocumentExchangeView({ bookingId }: { bookingId: string | undefined }) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: messagesState, reload } = useConversationMessages(bookingId);
  const { state: sendState, sendDocument, reset } = useSendMessage();
  const [pickError, setPickError] = useState<string | null>(null);

  const isSending = sendState.status === "sending";
  const canSend = messagesState.status === "success" ? messagesState.conversation.canSend : true;
  const documents: DocumentMessage[] =
    messagesState.status === "success"
      ? messagesState.messages.filter((m): m is DocumentMessage => m.type === "document")
      : [];

  const handleAddDocument = async () => {
    if (!bookingId || isSending) return;
    setPickError(null);
    reset();
    let file;
    try {
      file = await pickChatDocument();
    } catch (error) {
      setPickError(isApiError(error) ? error.message : t("common.unableToSelectTheFile"));
      return;
    }
    if (!file) return; // sélection annulée
    const message = await sendDocument(bookingId, file);
    if (message) reload();
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <Text className="px-5 pb-4 text-[22px] font-bold text-ink">{t("chat.documentExchangeView.sharedDocuments")}</Text>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {messagesState.status === "loading" ? (
          <View className="items-center py-10">
            <ActivityIndicator color="#332E86" />
          </View>
        ) : messagesState.status === "error" ? (
          <Text className="text-center text-[13.5px] text-error">{messagesState.message}</Text>
        ) : documents.length === 0 ? (
          <View className="items-center py-10">
            <Text className="text-center text-[13.5px] text-ink-soft">{t("chat.documentExchangeView.noSharedDocumentsYet")}</Text>
          </View>
        ) : (
          documents.map((document, index) => (
            <FadeIn key={document.id} delay={40 + index * 40}>
              <DocumentRow document={document} />
            </FadeIn>
          ))
        )}
      </ScrollView>

      <View className="flex-shrink-0 border-t border-line-soft bg-surface px-5 pt-4" style={{ paddingBottom: Math.max(insets.bottom, 22) }}>
        {sendState.status === "error" ? <FormError message={sendState.message} /> : null}
        {pickError ? <FormError message={pickError} /> : null}
        {!canSend ? (
          <Text className="mb-3 text-center text-[12.5px] text-ink-soft">{t("chat.documentExchangeView.thisConversationIsReadOnly")}</Text>
        ) : null}
        <Text className="mb-3 text-center text-[11.5px] text-ink-faint">{t("chat.documentExchangeView.pdfJpegPngOrWebp")}</Text>
        <Button
          label={t("common.addADocument")}
          fullWidth
          disabled={isSending || !canSend || messagesState.status !== "success"}
          loading={isSending}
          loadingLabel={t("common.sending")}
          icon={<AttachIcon size={17} color="#fff" />}
          onPress={handleAddDocument}
        />
      </View>
    </View>
  );
}

function DocumentRow({ document }: { document: DocumentMessage }) {
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    if (opening) return;
    setError(null);
    setOpening(true);
    try {
      await openAttachment(document.attachmentId);
    } catch (e) {
      setError(isApiError(e) ? e.message : t("common.unableToOpenTheDocument"));
    } finally {
      setOpening(false);
    }
  };

  return (
    <PressableScale onPress={open} disabled={opening} accessibilityLabel={t("common.open", { fileName: document.fileName })}>
      <View className="mb-[10px] flex-row items-center gap-3 rounded-lg border border-line bg-surface p-4">
        <View className="h-10 w-10 items-center justify-center rounded-md bg-primary-tint">
          {opening ? <ActivityIndicator size="small" color="#332E86" /> : <FileIcon size={18} color="#332E86" />}
        </View>
        <View className="flex-1">
          <Text className="text-[14px] font-bold text-ink">{document.fileName}</Text>
          <Text className="mt-[2px] text-[12px] text-ink-soft">
            {document.authorLabel} • {document.fileSizeLabel}
          </Text>
          {error ? <Text className="mt-1 text-[12px] text-error">{error}</Text> : null}
        </View>
      </View>
    </PressableScale>
  );
}
