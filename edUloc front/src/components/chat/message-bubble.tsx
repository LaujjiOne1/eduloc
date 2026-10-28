import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { isApiError } from "@/api/errors";
import { FileIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { VoiceMessagePlayer } from "@/components/chat/voice-message-player";
import { openAttachment } from "@/lib/attachments";
import type { ConversationMessage, DocumentMessage } from "@/types/message";
import { useTranslation } from "react-i18next";

/** Bulle d'un message : vocal (lecteur réel), document (ouverture par URL signée) ou événement système / appel. */
export function MessageBubble({ message }: { message: ConversationMessage }) {
  const isMine = message.isMine;

  // Messages système et événements d'appel : une ligne centrée, pas une bulle (ils ne sont de personne).
  if (message.type !== "voice" && message.type !== "document") {
    return (
      <View className="mb-[14px] items-center">
        <Text className="rounded-full bg-line-soft px-3 py-1 text-center text-[11.5px] italic text-ink-soft">{message.text}</Text>
      </View>
    );
  }

  return (
    <View className={["mb-[14px]", isMine ? "items-end" : "items-start"].join(" ")}>
      <Text className="mb-1 px-1 text-[11px] text-ink-faint">{message.authorLabel}</Text>
      <View
        className={["max-w-[270px] rounded-2xl p-[12px]", isMine ? "bg-primary" : "border border-line bg-surface"].join(" ")}
      >
        {message.type === "voice" ? (
          <VoiceMessagePlayer message={message} mine={isMine} />
        ) : (
          <DocumentRow message={message} mine={isMine} />
        )}
      </View>
    </View>
  );
}

function DocumentRow({ message, mine }: { message: DocumentMessage; mine: boolean }) {
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    if (opening) return;
    setError(null);
    setOpening(true);
    try {
      await openAttachment(message.attachmentId);
    } catch (e) {
      setError(isApiError(e) ? e.message : t("common.unableToOpenTheDocument"));
    } finally {
      setOpening(false);
    }
  };

  return (
    <PressableScale onPress={open} disabled={opening} accessibilityLabel={t("common.open", { fileName: message.fileName })}>
      <View className="flex-row items-center gap-[10px]">
        {opening ? <ActivityIndicator size="small" color={mine ? "#fff" : "#14162B"} /> : <FileIcon size={18} color={mine ? "#fff" : "#14162B"} />}
        <View className="shrink">
          <Text className={["text-[13.5px] font-semibold", mine ? "text-white" : "text-ink"].join(" ")} numberOfLines={2}>
            {message.fileName}
          </Text>
          <Text className={["text-[11px]", mine ? "text-white/80" : "text-ink-soft"].join(" ")}>{message.fileSizeLabel}</Text>
          {error ? <Text className={["mt-0.5 text-[11px]", mine ? "text-white" : "text-error"].join(" ")}>{error}</Text> : null}
        </View>
      </View>
    </PressableScale>
  );
}
