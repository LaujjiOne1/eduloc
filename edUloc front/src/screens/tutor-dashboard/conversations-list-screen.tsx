import type { Href } from "expo-router";

import { ConversationsListView } from "@/components/chat/conversations-list-view";
import { TutorBottomNav } from "@/components/ui/tutor-bottom-nav";
import { useTranslation } from "react-i18next";

function conversationRoute(bookingId: string): Href {
  return `/tutor-dashboard/appointments/${bookingId}/conversation` as Href;
}

/** Conversations du tuteur : une par demandeur, avec aperçu du dernier message et non-lus. */
export function TutorConversationsListScreen() {
  const { t } = useTranslation();
  return (
    <ConversationsListView
      tone="violet"
      subtitle={t("tutorDashboard.conversationsList.exchangeVoiceMessagesAndDocuments")}
      emptyTitle={t("tutorDashboard.conversationsList.noConversations")}
      emptyBody={t("tutorDashboard.conversationsList.youWillBeAbleTo")}
      routeFor={conversationRoute}
      nav={<TutorBottomNav active="conversations" />}
    />
  );
}
