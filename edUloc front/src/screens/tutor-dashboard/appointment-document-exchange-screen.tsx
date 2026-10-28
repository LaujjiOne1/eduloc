import { useLocalSearchParams } from "expo-router";

import { DocumentExchangeView } from "@/components/chat/document-exchange-view";

/** 27_DocumentExchange (espace tuteur) — liste et envoi dans DocumentExchangeView. */
export function TutorDocumentExchangeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DocumentExchangeView bookingId={id} />;
}
