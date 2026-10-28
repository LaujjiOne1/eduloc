import { type Href, useFocusEffect, useRouter } from "expo-router";
import { TutorAvatar } from "@/components/ui/tutor-avatar";
import { type ReactNode, useCallback } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { relativeTimeLabel } from "@/api/format/datetime";
import { ChevronRightIcon, MessageSquareIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { useConversations } from "@/hooks/use-conversations";
import type { ConversationSummary } from "@/types/message";
import { useTranslation } from "react-i18next";

type Props = {
  subtitle: string;
  emptyTitle: string;
  emptyBody: string;
  /** Bouton de l'état vide (ex. « Trouver un tuteur »). */
  emptyAction?: { label: string; route: Href };
  /** Route de la conversation d'une réservation. */
  routeFor: (bookingId: string) => Href;
  /** Menu bas de l'espace (demandeur ou tuteur). */
  nav: ReactNode;
  tone: "primary" | "violet";
};

/** 28 / 63 — liste des conversations (une par interlocuteur), partagée par les deux espaces. */
export function ConversationsListView({ subtitle, emptyTitle, emptyBody, emptyAction, routeFor, nav, tone }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, retry, reload } = useConversations();

  // Retour depuis une conversation : les compteurs de non-lus sont à jour.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />

      <View className="px-5 pb-3">
        <FadeIn delay={30}>
          <Text className="text-[25px] font-bold text-ink">{t("chat.conversationsListView.conversations")}</Text>
          <Text className="mt-1 text-[13.5px] text-ink-soft">{subtitle}</Text>
        </FadeIn>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom + 20, 30) }}
        showsVerticalScrollIndicator={false}
      >
        {state.status === "loading" ? (
          <View className="gap-3 pt-2">
            {[0, 1, 2].map((i) => (
              <View key={i} className="h-[84px] rounded-xl bg-line-soft" />
            ))}
          </View>
        ) : state.status === "error" ? (
          <FadeIn delay={40}>
            <View className="my-6 items-center rounded-2xl border border-line bg-surface p-8">
              <Text className="mb-4 text-center text-[14px] text-error">{state.message}</Text>
              <Button label={t("common.tryAgain")} variant="ghost" onPress={retry} />
            </View>
          </FadeIn>
        ) : state.status === "empty" ? (
          <FadeIn delay={60}>
            <View className="my-6 items-center rounded-2xl border border-line bg-surface p-8">
              <View className="mb-3.5 h-12 w-12 items-center justify-center rounded-full bg-primary-soft">
                <MessageSquareIcon size={24} color="#332E86" />
              </View>
              <Text className="text-[16px] font-bold text-ink">{emptyTitle}</Text>
              <Text className="mt-1.5 max-w-[280px] text-center text-[13.5px] text-ink-soft">{emptyBody}</Text>
              {emptyAction ? (
                <View className="mt-5 w-full">
                  <Button label={emptyAction.label} onPress={() => router.push(emptyAction.route)} />
                </View>
              ) : null}
            </View>
          </FadeIn>
        ) : (
          <View className="gap-2.5 pt-2">
            {state.conversations.map((conversation, index) => (
              <FadeIn key={conversation.id} delay={60 + index * 40}>
                <ConversationItem
                  conversation={conversation}
                  tone={tone}
                  onPress={() => conversation.bookingId && router.push(routeFor(conversation.bookingId))}
                />
              </FadeIn>
            ))}
          </View>
        )}
      </ScrollView>

      {nav}
    </View>
  );
}

function ConversationItem({
  conversation,
  tone,
  onPress,
}: {
  conversation: ConversationSummary;
  tone: "primary" | "violet";
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const unread = conversation.unreadCount;
  return (
    <PressableScale
      onPress={onPress}
      disabled={!conversation.bookingId}
      accessibilityLabel={unread ? t("chat.conversationsListView.conversationWithUnread", { name: conversation.counterpartName, count: unread }) : t("chat.conversationsListView.conversationWith", { name: conversation.counterpartName })}
    >
      <View className="flex-row items-center gap-3.5 rounded-xl border border-line bg-surface p-4">
        {conversation.counterpartGender !== undefined ? (
          // Vue demandeur : le correspondant est un tuteur → sa silhouette / sa photo
          <TutorAvatar gender={conversation.counterpartGender} photoUrl={conversation.counterpartPhotoUrl} size={46} />
        ) : (
          <View
            className={["h-[46px] w-[46px] items-center justify-center rounded-full", tone === "violet" ? "bg-violet-tint" : "bg-primary-tint"].join(" ")}
          >
            <Text className={["text-[16px] font-bold", tone === "violet" ? "text-violet" : "text-primary"].join(" ")}>
              {conversation.counterpartInitial}
            </Text>
          </View>
        )}

        <View className="min-w-0 flex-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text className={["flex-1 text-[15px] text-ink", unread ? "font-extrabold" : "font-bold"].join(" ")} numberOfLines={1}>
              {conversation.counterpartName}
            </Text>
            {conversation.lastMessageAt ? (
              <Text className="text-[11.5px] text-ink-faint">{relativeTimeLabel(conversation.lastMessageAt)}</Text>
            ) : null}
          </View>

          <View className="mt-1 flex-row items-center gap-2">
            <Text
              className={["flex-1 text-[12.5px]", unread ? "font-semibold text-ink" : "text-ink-soft"].join(" ")}
              numberOfLines={1}
            >
              {conversation.lastMessagePreview ?? t("chat.conversationsListView.noMessages")}
            </Text>
            {unread > 0 ? (
              <View className="min-w-[20px] items-center rounded-full bg-primary px-1.5 py-[2px]">
                <Text className="text-[11px] font-bold text-white">{unread > 9 ? "9+" : unread}</Text>
              </View>
            ) : null}
          </View>
          {conversation.status === "read_only" ? (
            <Text className="mt-1 text-[11px] text-ink-faint">{t("chat.conversationsListView.readOnly")}</Text>
          ) : null}
        </View>

        <ChevronRightIcon size={16} color="#9799AF" />
      </View>
    </PressableScale>
  );
}
