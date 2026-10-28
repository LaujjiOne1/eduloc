import { api } from "@/api/http";
import { toAuthenticatedUser } from "@/api/mappers";
import { Session } from "@/api/session";
import type { MeDto } from "@/api/contracts/dto";
import type { AuthenticatedUser, LessonAlarm } from "@/types/auth";

/**
 * Paramètres du compte. Route : PATCH /users/me { lessonAlarmEnabled?, lessonAlarmLeadMinutes? } → profil à jour.
 * Erreur : 400 si le délai n'est pas 10, 15, 30 ou 60 minutes.
 */
export const UserService = {
  /** Alarme de cours : le serveur envoie le rappel (notification, temps réel, push) selon ce paramètre. */
  async updateLessonAlarm(patch: Partial<LessonAlarm>): Promise<AuthenticatedUser> {
    const me = await api.patch<MeDto>("/users/me", {
      ...(patch.enabled !== undefined ? { lessonAlarmEnabled: patch.enabled } : {}),
      ...(patch.leadMinutes !== undefined ? { lessonAlarmLeadMinutes: patch.leadMinutes } : {}),
    });
    Session.setUser(me);
    return toAuthenticatedUser(me);
  },
};
