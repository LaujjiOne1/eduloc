import type { Href } from "expo-router";

import { ConversationsListView } from "@/components/chat/conversations-list-view";
import { ApprentiBottomNav } from "@/components/ui/apprenti-bottom-nav";
import { useTranslation } from "react-i18next";

function conversationRoute(bookingId: string): Href {
  return `/apprenti-dashboard/bookings/${bookingId}/conversation` as Href;
}

/** Conversations du demandeur : une par tuteur, avec aperçu du dernier message et non-lus. */
export function ConversationsListScreen() {
  const { t } = useTranslation();
  return (
    <ConversationsListView
      tone="primary"
      subtitle={t("apprentiDashboard.conversationsList.exchangeVoiceMessagesAndDocuments")}
      emptyTitle={t("apprentiDashboard.conversationsList.noActiveConversations")}
      emptyBody={t("apprentiDashboard.conversationsList.bookATutorOrSend")}
      emptyAction={{ label: t("common.findATutor"), route: "/search" as Href }}
      routeFor={conversationRoute}
      nav={<ApprentiBottomNav active="conversations" />}
    />
  );
}
