import { api } from "@/api/http";
import { rebaseLocalhost } from "@/api/config";
import type { CallJoinDto, CallType } from "@/api/contracts/dto";

export interface CallJoin {
  callId: string;
  roomName: string;
  livekitUrl: string;
  token: string;
  type: CallType;
}

function toJoin(dto: CallJoinDto): CallJoin {
  return {
    callId: dto.callId,
    roomName: dto.roomName,
    livekitUrl: rebaseLocalhost(dto.livekitUrl),
    token: dto.token,
    type: dto.type,
  };
}

/**
 * Appels (LiveKit). Réservés aux séances CONFIRMED / IN_PROGRESS (CALL_NOT_ALLOWED sinon).
 * Routes : POST /calls { conversationId, type } · POST /calls/:id/token
 * L'appelé est prévenu par l'événement temps réel `call.incoming` ; il rejoint avec POST /calls/:id/token.
 */
export const CallService = {
  async start(conversationId: string, type: CallType): Promise<CallJoin> {
    return toJoin(await api.post<CallJoinDto>("/calls", { conversationId, type }));
  },
  async join(callId: string): Promise<CallJoin> {
    return toJoin(await api.post<CallJoinDto>(`/calls/${callId}/token`));
  },
};
