import { api } from "@/api/http";
import { ApiError } from "@/api/errors";
import { toSkill, toTutorApplication, upper } from "@/api/mappers";
import type { CreateSubjectResultDto, DegreeDto, TutorGenderDto, SubjectDto, TutorApplicationDto, TutorApplicationInputDto, TutorDocumentType, UploadTicketDto } from "@/api/contracts/dto";
import { uploadToSignedUrl } from "@/api/upload";
import type { DegreeId, InPersonModeId } from "@/types/common";
import type { TutorApplication, TutorApplicationSubmission, TutorSkill } from "@/types/tutor-application";
import { t } from "@/i18n";

export { ApiError as TutorApplicationServiceError };

const PLACE_TYPE_BY_KIND: Record<InPersonModeId, "BENEFICIARY_HOME" | "TUTOR_HOME" | "PUBLIC_PLACE"> = {
  beneficiary_home: "BENEFICIARY_HOME",
  tutor_home: "TUTOR_HOME",
  public_place: "PUBLIC_PLACE",
};

/**
 * Routes : GET /catalog/subjects (catalogue), GET /catalog/subjects/suggest (autocomplétion selon le diplôme),
 *          POST /catalog/subjects (création libre d'une compétence), POST|PATCH /tutor-applications, GET /tutor-applications/me,
 *          POST /tutor-applications/:id/documents/uploads + /documents, POST /tutor-applications/:id/submit
 * [v1~] La soumission est orchestrée : brouillon → pièces → envoi (PENDING).
 */
export const TutorApplicationService = {
  async getSkillCatalog(): Promise<TutorSkill[]> {
    return (await api.get<SubjectDto[]>("/catalog/subjects", undefined, { auth: false })).map(toSkill);
  },

  /**
   * Autocomplétion de l'étape « Qu'enseignez-vous ? » : le serveur ne propose que les compétences
   * enseignables avec ce diplôme (une matière universitaire n'apparaît pas à un bachelier).
   */
  async suggestSkills(query: string, degree: DegreeId | null): Promise<TutorSkill[]> {
    const rows = await api.get<SubjectDto[]>("/catalog/subjects/suggest", {
      q: query.trim() || undefined,
      degree: degree ? upper(degree) : undefined,
    });
    return rows.map(toSkill);
  },

  /** « Ajouter "X" comme nouvelle compétence » : idempotent (une compétence équivalente existante est renvoyée). */
  async createSkill(name: string): Promise<{ skill: TutorSkill; created: boolean }> {
    const result = await api.post<CreateSubjectResultDto>("/catalog/subjects", { name: name.trim() });
    return { skill: toSkill(result.subject), created: result.created };
  },

  async getMyApplication(): Promise<TutorApplication | null> {
    try {
      return toTutorApplication(await api.get<TutorApplicationDto>("/tutor-applications/me"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },

  async submitApplication(s: TutorApplicationSubmission): Promise<TutorApplication> {
    if (!s.subjects.length) throw ApiError.local("validation_error", t("services.tutorApplicationservice.chooseAtLeastOneSkill"));
    const input: TutorApplicationInputDto = {
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      phone: s.phone,
      bio: s.bio,
      experience: s.experience ?? null,
      educationBackground: s.educationBackground ?? null,
      highestDegree: s.highestDegree ? (upper(s.highestDegree) as DegreeDto) : undefined,
      gender: s.gender ? (upper(s.gender) as TutorGenderDto) : undefined,
      birthDate: s.birthDate ?? null,
      experiences: s.experiences,
      subjects: s.subjects.flatMap((x) =>
        x.levelIds.map((levelId) => ({ subjectId: x.skillId, educationLevelId: levelId, competenceDescription: x.competenceDescription ?? null })),
      ),
      offers: s.offers.map((offer) => ({
        subjectId: offer.subjectId,
        educationLevelId: offer.educationLevelId,
        ...(offer.trackId ? { trackId: offer.trackId } : {}),
        title: offer.title,
        description: offer.description,
        format: upper(offer.format) as "ONLINE" | "IN_PERSON" | "BOTH",
        durationMinutes: offer.durationMinutes,
        price: offer.price,
        currency: offer.currency,
      })),
      // Zone de déplacement (BENEFICIARY_HOME), adresse d'accueil (TUTOR_HOME) ou point de rencontre (PUBLIC_PLACE).
      places: s.locations.map((location) => ({
        label: location.label,
        address: location.label,
        type: PLACE_TYPE_BY_KIND[location.kind],
        latitude: location.latitude,
        longitude: location.longitude,
        radiusMeters: Math.round(location.radiusKm * 1000),
        isPrimary: location.isPrimary,
      })),
      availabilities: [
        ...s.weeklyAvailability.flatMap((day) =>
          day.slots.map(({ startTime, endTime, format, placeIndex }) => ({
            dayOfWeek: day.dayOfWeek,
            startTime,
            endTime,
            format: upper(format) as "ONLINE" | "IN_PERSON" | "BOTH",
            placeIndex,
          })),
        ),
        // Ponctuelles : le jour de la semaine est celui de la date (le serveur le revérifie).
        ...(s.dateAvailability ?? []).map(({ date, startTime, endTime, format, placeIndex }) => ({
          dayOfWeek: new Date(`${date}T00:00:00Z`).getUTCDay(),
          date,
          startTime,
          endTime,
          format: upper(format) as "ONLINE" | "IN_PERSON" | "BOTH",
          placeIndex,
        })),
      ],
    };
    const existing = await TutorApplicationService.getMyApplication();
    const draft =
      existing && (existing.status === "draft" || existing.status === "rejected")
        ? await api.patch<TutorApplicationDto>(`/tutor-applications/${existing.id}`, input)
        : await api.post<TutorApplicationDto>("/tutor-applications", input);

    for (const doc of s.documents) {
      if (!doc.file) throw ApiError.local("validation_error", t("services.tutorApplicationservice.theFileMustBeSelected", { kind: doc.kind }));
      const ticket = await api.post<UploadTicketDto>(`/tutor-applications/${draft.id}/documents/uploads`, {
        mimeType: doc.file.mimeType,
        sizeBytes: doc.file.sizeBytes,
        fileName: doc.file.fileName,
      });
      await uploadToSignedUrl(ticket, doc.file);
      await api.post(`/tutor-applications/${draft.id}/documents`, { uploadId: ticket.uploadId, type: upper(doc.kind) as TutorDocumentType });
    }
    if (!s.introVideo) throw ApiError.local("validation_error", t("services.tutorApplicationservice.addAPresentationVideoBefore"));
    const videoTicket = await api.post<UploadTicketDto>(`/tutor-applications/${draft.id}/video/uploads`, {
      mimeType: s.introVideo.file.mimeType,
      sizeBytes: Math.round(s.introVideo.file.sizeBytes),
      fileName: s.introVideo.file.fileName,
      // Le sélecteur renvoie une durée décimale (ms) selon la plateforme ; le serveur exige un entier.
      durationMs: s.introVideo.durationMs == null ? undefined : Math.max(0, Math.round(s.introVideo.durationMs)),
    });
    await uploadToSignedUrl(videoTicket, s.introVideo.file);
    await api.post(`/tutor-applications/${draft.id}/video`, { uploadId: videoTicket.uploadId });
    return toTutorApplication(await api.post<TutorApplicationDto>(`/tutor-applications/${draft.id}/submit`));
  },
};
