import { type Href, useFocusEffect, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useRef } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArrowLeftIcon, AttachIcon, MicIcon, PhoneIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { MessageBubble } from "@/components/chat/message-bubble";
import { useConversationMessages } from "@/hooks/use-conversation-messages";
import { useTranslation } from "react-i18next";

type ConversationViewProps = {
  bookingId: string | undefined;
  /** Initiales de l'interlocuteur et son nom (tuteur côté demandeur, bénéficiaire côté tuteur). */
  initials: string;
  /** Avatar du correspondant à la place des initiales (silhouette du tuteur côté demandeur). */
  avatar?: ReactNode;
  title: string;
  tone: "primary" | "violet";
  /** « Rendez-vous confirmé » / « En attente de confirmation » (null tant que la réservation charge). */
  statusLabel: string | null;
  statusPositive: boolean;
  callRoute: Href;
  voiceRoute: Href;
  documentsRoute: Href;
};

/**
 * 25_Conversation — fil de vocaux et de documents d'une réservation, partagé par les espaces demandeur
 * et tuteur. Pas de saisie de texte (ADR-04). Les droits d'écriture et d'appel viennent du serveur
 * (conversation.canSend / canCall) : état de la relation, suspension du tuteur, quota de vocaux.
 */
export function ConversationView({
  bookingId,
  initials,
  avatar,
  title,
  tone,
  statusLabel,
  statusPositive,
  callRoute,
  voiceRoute,
  documentsRoute,
}: ConversationViewProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: messagesState, reload } = useConversationMessages(bookingId);
  const scrollRef = useRef<ScrollView>(null);

  // Un vocal / un document s'envoie depuis un autre écran : on relit le fil au retour.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const conversation = messagesState.status === "success" ? messagesState.conversation : null;
  const canSend = conversation ? conversation.canSend : true;
  const canCall = conversation?.canCall ?? false;

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-3 border-b border-line-soft px-5 pb-[14px] pt-[18px]">
        <PressableScale onPress={() => router.back()} accessibilityLabel={t("common.back")}>
          <View className="h-9 w-9 items-center justify-center rounded-full border border-line">
            <ArrowLeftIcon color="#14162B" />
          </View>
        </PressableScale>
        {avatar ?? (
          <View
            className={["h-[38px] w-[38px] items-center justify-center rounded-full", tone === "violet" ? "bg-violet-tint" : "bg-primary-tint"].join(" ")}
          >
            <Text className={["text-[13px] font-bold", tone === "violet" ? "text-violet" : "text-primary"].join(" ")}>{initials}</Text>
          </View>
        )}
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-ink">{title}</Text>
          {statusLabel ? (
            <Text className={["text-[11.5px] font-semibold", statusPositive ? "text-accent" : "text-warning"].join(" ")}>{statusLabel}</Text>
          ) : null}
        </View>
        {canCall ? (
          <PressableScale onPress={() => router.push(callRoute)} accessibilityLabel={t("common.call")}>
            <View className="h-9 w-9 items-center justify-center rounded-full bg-primary-tint">
              <PhoneIcon size={16} color="#332E86" />
            </View>
          </PressableScale>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messagesState.status === "loading" ? (
          <View className="items-center py-10">
            <ActivityIndicator color="#332E86" />
          </View>
        ) : messagesState.status === "error" ? (
          <Text className="text-center text-[13.5px] text-error">{messagesState.message}</Text>
        ) : messagesState.messages.length === 0 ? (
          <View className="items-center py-10">
            <Text className="text-center text-[13.5px] text-ink-soft">
              {t("chat.conversationView.noMessagesYetSendA")}</Text>
          </View>
        ) : (
          messagesState.messages.map((message, index) => (
            <FadeIn key={message.id} delay={Math.min(index * 40, 240)}>
              <MessageBubble message={message} />
            </FadeIn>
          ))
        )}
      </ScrollView>

      {canSend ? (
        <View className="flex-shrink-0 flex-row items-center gap-3 border-t border-line-soft px-5 pb-[22px] pt-[14px]">
          <PressableScale
            onPress={() => (bookingId ? router.push(documentsRoute) : undefined)}
            disabled={!bookingId}
            accessibilityLabel={t("common.addADocument")}
          >
            <View className="h-11 w-11 items-center justify-center rounded-full border border-line">
              <AttachIcon size={18} color="#585B78" />
            </View>
          </PressableScale>
          <PressableScale
            onPress={() => (bookingId ? router.push(voiceRoute) : undefined)}
            disabled={!bookingId}
            accessibilityLabel={t("chat.conversationView.recordAVoiceMessage")}
            style={{ flex: 1 }}
          >
            <View className="w-full flex-row items-center justify-center gap-[10px] rounded-md bg-primary px-[22px] py-[14px]">
              <MicIcon size={17} color="#fff" />
              <Text className="text-[15px] font-semibold text-white">{t("chat.conversationView.recordAVoiceNote")}</Text>
            </View>
          </PressableScale>
        </View>
      ) : (
        <View className="flex-shrink-0 border-t border-line-soft px-5 pb-[22px] pt-[16px]">
          <Text className="text-center text-[13px] text-ink-soft">
            {t("chat.conversationView.thisConversationIsReadOnly")}</Text>
        </View>
      )}
      <Text className="pb-[14px] text-center text-[11px] text-ink-faint">{t("chat.conversationView.noTextMessagesVoiceNotes")}</Text>
    </View>
  );
}
