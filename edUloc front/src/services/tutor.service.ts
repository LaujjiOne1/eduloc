import { api } from "@/api/http";
import { ApiError } from "@/api/errors";
import { formatToDto, nextSlotLabel, toTutorFromPublic, toTutorFromSearch, toTutorProfileSummary } from "@/api/mappers";
import type { ClassicMatchingResponseDto, MatchingSearchResponseDto, SearchResultDto, TutorPrivateDto, TutorPublicDto } from "@/api/contracts/dto";
import { BeneficiaryService } from "@/services/beneficiary.service";
import type { SearchCriteria } from "@/types/search";
import type { Tutor } from "@/types/tutor";
import type { TutorProfileSummary } from "@/types/tutor-profile";
import { t } from "@/i18n";

export { ApiError as TutorServiceError };

/** Rayon de recherche par défaut (le serveur élargit à la zone de déplacement du tuteur si elle est plus grande). */
const DEFAULT_RADIUS_M = 10_000;

/**
 * Routes backend : GET /search/offers, GET /search/tutors/:id, GET /tutors/me/profile
 * (identité du tuteur connecté : useAuthStore().user.tutor.tutorProfileId).
 */
/** Niveaux de la catégorie « Université » : le matching hiérarchique (tuteur de niveau supérieur) s'applique. */
export function usesSemanticMatching(criteria: SearchCriteria): boolean {
  const forMyself = !criteria.beneficiaryType || criteria.beneficiaryType === "self";
  if (!criteria.levelId || !forMyself) return false;
  // Une matière saisie librement n'existe pas dans le catalogue : seul le serveur peut la rapprocher (POST /matching/search).
  return criteria.levelCategory === "Université" || Boolean(criteria.subjectText);
}

/** Seuls ces objectifs existent côté matching (REMEDIAL | ONGOING | EXCELLENCE). */
const MATCHING_OBJECTIVES = { remedial: "REMEDIAL", ongoing: "ONGOING", excellence: "EXCELLENCE" } as const;

export const TutorService = {
  /**
   * Niveau universitaire, utilisateur connecté, recherche « pour moi » : POST /matching/search. Le serveur décide de
   * l'éligibilité (niveau validé du tuteur strictement supérieur à celui de la demande) puis classe par pertinence.
   * Le profil complet de chaque tuteur est ensuite lu (GET /search/tutors/:id) pour garder la même carte de résultat.
   */
  async searchTutorsSemantic(criteria: SearchCriteria): Promise<Tutor[]> {
    const beneficiary = await BeneficiaryService.ensureSelfBeneficiary(criteria.levelId);
    const objective = criteria.objectiveId ? (MATCHING_OBJECTIVES as Record<string, string>)[criteria.objectiveId] : undefined;
    const need =
      criteria.needNote && criteria.needNote.length >= 10
        ? criteria.needNote
        : `Je cherche un tuteur en ${criteria.subjectLabel ?? "cette matière"} niveau ${criteria.levelLabel ?? "universitaire"}.`;
    const response = await api.post<MatchingSearchResponseDto | ClassicMatchingResponseDto>("/matching/search", {
      beneficiaryId: beneficiary.id,
      ...(criteria.subjectText ? { subjectText: criteria.subjectText } : { subjectId: criteria.subjectId }),
      ...(criteria.trackId ? { trackId: criteria.trackId } : {}),
      needDescription: need.slice(0, 1000),
      ...(objective ? { objective } : {}),
      format: formatToDto(criteria.format ?? "both"),
      limit: 10,
    });
    // Niveau non universitaire : le serveur a appliqué la recherche classique (même forme que GET /search/offers).
    if ("mode" in response) return response.results.map(toTutorFromSearch);
    const tutors = await Promise.all(
      response.results.map(async (result) => {
        const tutor = await TutorService.getTutorById(result.tutorProfileId);
        return {
          ...tutor,
          matchReasons: result.matchReasons,
          nextSlotLabel: nextSlotLabel(result.nextSlots[0]?.startAt ?? null),
        };
      }),
    );
    return tutors;
  },

  /**
   * format = "online"   → offres à distance, aucune coordonnée requise ;
   * format = "in_person"/"both" → coordonnées obligatoires pour le présentiel (le serveur répond 400 sinon).
   */
  async searchTutors(criteria: SearchCriteria): Promise<Tutor[]> {
    if (!criteria.subjectId) {
      // Matière saisie librement : le catalogue ne la connaît pas, la recherche publique ne peut pas la traiter.
      throw ApiError.local("validation_error", t("services.tutorservice.signInToSearchFor"));
    }
    const format = criteria.format ?? "both";
    const needsPosition = format !== "online";
    if (needsPosition && !criteria.coordinates) {
      throw ApiError.local("validation_error", t("services.tutorservice.enterAPlaceToFind"));
    }
    const results = await api.get<SearchResultDto[]>(
      "/search/offers",
      {
        subjectId: criteria.subjectId,
        levelId: criteria.levelId,
        trackId: criteria.trackId,
        format: formatToDto(format),
        // Coordonnées décimales telles quelles : le cache serveur les arrondit lui-même à ~500 m.
        lat: needsPosition ? criteria.coordinates?.latitude : undefined,
        lng: needsPosition ? criteria.coordinates?.longitude : undefined,
        radiusM: criteria.radiusKm === undefined ? DEFAULT_RADIUS_M : Math.round(criteria.radiusKm * 1000),
        limit: 20,
      },
      { auth: false },
    );
    return results.map(toTutorFromSearch);
  },

  async getTutorById(id: string): Promise<Tutor> {
    return toTutorFromPublic(await api.get<TutorPublicDto>(`/search/tutors/${id}`, undefined, { auth: false }));
  },

  async getMyProfile(): Promise<TutorProfileSummary> {
    return toTutorProfileSummary(await api.get<TutorPrivateDto>("/tutors/me/profile"));
  },
};
