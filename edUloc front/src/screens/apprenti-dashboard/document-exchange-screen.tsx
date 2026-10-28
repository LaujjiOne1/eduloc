import { useLocalSearchParams } from "expo-router";

import { DocumentExchangeView } from "@/components/chat/document-exchange-view";

/** 27_DocumentExchange (espace demandeur) — liste et envoi dans DocumentExchangeView. */
export function DocumentExchangeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DocumentExchangeView bookingId={id} />;
}
