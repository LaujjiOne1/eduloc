import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AppConfig } from '../../core/config/app.config';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CacheKeys, CacheService } from '../../infrastructure/cache/cache.service';
import { SlotPolicy, AvailabilityRule, TeachingMode } from '../bookings/domain/slot-policy';
import { publicDistance, toPublicPlace } from './domain/public-location';

type SearchFormat = 'ONLINE' | 'IN_PERSON' | 'BOTH';

const SLOT_STEP_MS = 30 * 60_000;
/** Premier multiple de 30 min >= `date` : les créneaux proposés tombent toujours sur :00 ou :30. */
const ceilToStep = (date: Date): Date => new Date(Math.ceil(date.getTime() / SLOT_STEP_MS) * SLOT_STEP_MS);

interface SearchRow {
  offerId: string;
  tutorProfileId: string;
  distanceM: number | null;
  title: string;
  price: string;
  durationMinutes: number;
  format: string;
  displayName: string | null;
  rating: number;
  reviewsCount: number;
  placeId: string | null;
  placeLabel: string | null;
  latitude: number | null;
  longitude: number | null;
}

const modesForFormat = (format: string): TeachingMode[] => {
  if (format === 'ONLINE') return ['ONLINE'];
  if (format === 'IN_PERSON') return ['AT_HOME_BENEFICIARY', 'AT_HOME_TUTOR', 'PUBLIC_PLACE'];
  return ['ONLINE', 'AT_HOME_BENEFICIARY', 'AT_HOME_TUTOR', 'PUBLIC_PLACE'];
};

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly cfg: AppConfig,
  ) {}

  /**
   * UC-B03 : recherche géo PostGIS (ADR-11 — pas d'OSRM). Coordonnées arrondies ~500 m pour le cache.
   * - ONLINE   : offres à distance, sans coordonnées requises ;
   * - IN_PERSON: lieux physiques dans le rayon de recherche (ou dans la zone de déplacement du tuteur) ;
   * - BOTH     : les deux.
   */
  async searchOffers(params: {
    subjectId: string;
    levelId?: string;
    /** Série ou mention : exclut les offres d'une autre filière (les offres sans filière restent). */
    trackId?: string;
    lat: number | null;
    lng: number | null;
    format: SearchFormat;
    radiusM: number;
    limit: number;
  }) {
    const hasCoordinates = params.lat !== null && params.lng !== null;
    const wantOnline = params.format !== 'IN_PERSON';
    const wantInPerson = params.format !== 'ONLINE' && hasCoordinates;
    const latR = hasCoordinates ? Math.round(params.lat! * 2000) / 2000 : null;
    const lngR = hasCoordinates ? Math.round(params.lng! * 2000) / 2000 : null;
    const hash = createHash('sha1')
      .update(JSON.stringify({ ...params, lat: latR, lng: lngR }))
      .digest('hex');
    return this.cache.wrap(await this.cache.searchKey(hash), 90, async () => {
      const lat = params.lat;
      const lng = params.lng;
      const rows = await this.prisma.$queryRaw<SearchRow[]>`
        SELECT o.id AS "offerId", tp.id AS "tutorProfileId",
               CASE WHEN ${hasCoordinates}::boolean AND p.location IS NOT NULL
                    THEN ST_Distance(p.location, ST_MakePoint(${lng}::float8, ${lat}::float8)::geography)
               END AS "distanceM",
               o.title, o.price, o."durationMinutes", o.format,
               tp."displayName", tp.rating, tp."reviewsCount",
               p.id AS "placeId", p.label AS "placeLabel", p.latitude, p.longitude
        FROM offers o
        JOIN tutor_profiles tp ON tp.id = o."tutorProfileId" AND tp."isVisible" = true AND tp."suspendedAt" IS NULL
        JOIN places p ON p."tutorProfileId" = tp.id AND p."isActive" = true
        WHERE o."isActive" = true AND o."disabledByAdminAt" IS NULL
          AND o."subjectId" = ${params.subjectId}
          AND (${params.levelId ?? null}::text IS NULL OR o."educationLevelId" = ${params.levelId ?? null})
          AND (${params.trackId ?? null}::text IS NULL OR o."trackId" IS NULL OR o."trackId" = ${params.trackId ?? null})
          AND (
            (${wantOnline}::boolean AND p.type = 'ONLINE' AND o.format IN ('ONLINE', 'BOTH'))
            OR (${wantInPerson}::boolean AND p.type NOT IN ('ONLINE', 'PARTNER_ROOM') AND o.format IN ('IN_PERSON', 'BOTH')
                AND ST_DWithin(p.location, ST_MakePoint(${lng}::float8, ${lat}::float8)::geography,
                               GREATEST(${params.radiusM}::float8, COALESCE(p.radius, 0)::float8)))
          )
        ORDER BY "distanceM" NULLS LAST, tp.rating DESC
        LIMIT ${Math.min(params.limit * 5, 100)}`;
      const rowsWithSlots = await this.withSlots(rows);
      const tutorIds = [...new Set(rowsWithSlots.map((row) => row.tutorProfileId))].slice(0, params.limit);
      if (!tutorIds.length) return [];

      const profiles = await this.prisma.tutorProfile.findMany({
        where: { id: { in: tutorIds }, isVisible: true, suspendedAt: null },
        include: {
          user: { select: { firstName: true, lastName: true } },
          subjects: { include: { subject: true, educationLevel: true } },
          offers: {
            where: { isActive: true, disabledByAdminAt: null },
            include: { subject: true, educationLevel: true },
          },
          places: { where: { isActive: true } },
        },
      });
      const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

      return tutorIds.flatMap((tutorProfileId) => {
        const profile = profilesById.get(tutorProfileId);
        if (!profile) return [];
        const tutorRows = rowsWithSlots.filter((row) => row.tutorProfileId === tutorProfileId);
        const offerIds = new Set(tutorRows.map((row) => row.offerId));
        const matchingOffers = profile.offers.filter((offer) => offerIds.has(offer.id));
        const nearestRow = tutorRows[0];
        const nearestPlace = profile.places.find((place) => place.id === nearestRow.placeId);
        const nextSlotAt = tutorRows
          .flatMap((row) => row.nextSlots)
          .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0]?.startAt ?? null;

        return [{
          tutor: {
            id: profile.id,
            firstName: profile.user.firstName,
            lastName: profile.user.lastName,
            displayName: profile.displayName,
            profilePhoto: profile.profilePhoto,
            gender: profile.gender,
            rating: profile.rating,
            reviewsCount: profile.reviewsCount,
            isVerified: profile.isVisible,
          },
          subjects: profile.subjects.map((item) => item.subject.name),
          levels: [...new Set(profile.subjects.map((item) => item.educationLevel.name))],
          offers: matchingOffers.map((offer) => ({
            id: offer.id,
            title: offer.title,
            subject: {
              id: offer.subject.id,
              name: offer.subject.name,
              category: offer.subject.category,
              description: offer.subject.description,
            },
            educationLevel: offer.educationLevel
              ? {
                  id: offer.educationLevel.id,
                  name: offer.educationLevel.name,
                  category: offer.educationLevel.category,
                  displayOrder: offer.educationLevel.displayOrder,
                }
              : null,
            format: offer.format,
            durationMinutes: offer.durationMinutes,
            price: { amount: offer.price.toString(), currency: offer.currency },
            isActive: offer.isActive,
          })),
          nearestPlace: nearestPlace ? toPublicPlace(nearestPlace) : null,
          distanceMeters: publicDistance(nearestRow.distanceM, nearestPlace?.type ?? null),
          nextSlotAt,
          bioExcerpt: profile.bio?.slice(0, 180) ?? null,
        }];
      });
    });
  }

  /** Anti-N+1 (TDD 2.6) : 2 requêtes pour 20 tuteurs, créneaux calculés en mémoire. */
  private async withSlots(rows: SearchRow[]) {
    if (!rows.length) return [];
    const tutorIds = rows.map((r) => r.tutorProfileId);
    const from = ceilToStep(new Date(Date.now() + this.cfg.bookingMinNoticeHours * 3_600_000));
    const to = new Date(Date.now() + 14 * 86_400_000);
    const [rawRules, rawBusy, rawBlocked] = await Promise.all([
      this.prisma.availability.findMany({
        where: { tutorProfileId: { in: tutorIds }, isActive: true },
        include: { place: true },
      }),
      this.prisma.booking.findMany({
        where: {
          tutorProfileId: { in: tutorIds },
          status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
          startAt: { lt: to },
          endAt: { gt: from },
        },
        select: { tutorProfileId: true, startAt: true, endAt: true },
      }),
      this.prisma.blockedPeriod.findMany({
        where: { tutorProfileId: { in: tutorIds }, startAt: { lt: to }, endAt: { gt: from } },
        select: { tutorProfileId: true, startAt: true, endAt: true },
      }),
    ]);
    const rulesByTutor = new Map<string, AvailabilityRule[]>();
    for (const r of rawRules) {
      const list = rulesByTutor.get(r.tutorProfileId) ?? [];
      list.push({
        id: r.id, dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime,
        timezone: r.timezone, validFrom: r.validFrom, validUntil: r.validUntil,
        isActive: r.isActive, offerId: r.offerId, placeId: r.placeId,
        placeType: r.place?.type ?? null,
      });
      rulesByTutor.set(r.tutorProfileId, list);
    }
    const busyByTutor = new Map<string, { startAt: Date; endAt: Date }[]>();
    for (const b of rawBusy) {
      const list = busyByTutor.get(b.tutorProfileId) ?? [];
      list.push({ startAt: b.startAt, endAt: b.endAt });
      busyByTutor.set(b.tutorProfileId, list);
    }
    const blockedByTutor = new Map<string, { startAt: Date; endAt: Date }[]>();
    for (const b of rawBlocked) {
      const list = blockedByTutor.get(b.tutorProfileId) ?? [];
      list.push({ startAt: b.startAt, endAt: b.endAt });
      blockedByTutor.set(b.tutorProfileId, list);
    }
    return rows.map((r) => {
      const slots = SlotPolicy.computeSlots(
        (rulesByTutor.get(r.tutorProfileId) ?? []).filter((x) => !x.offerId || x.offerId === r.offerId),
        blockedByTutor.get(r.tutorProfileId) ?? [],
        busyByTutor.get(r.tutorProfileId) ?? [],
        from, 14, r.durationMinutes, modesForFormat(r.format), r.offerId,
      ).slice(0, 5);
      return { ...r, price: Number(r.price), nextSlots: slots };
    });
  }

  /** UC-B05 : profil public complet (cache 10 min). */
  async tutorPublic(tutorProfileId: string) {
    return this.cache.wrap(CacheKeys.tutorPublic(tutorProfileId), 600, async () => {
      const profile = await this.prisma.tutorProfile.findFirst({
        where: { id: tutorProfileId, isVisible: true, suspendedAt: null },
        select: {
          id: true, displayName: true, bio: true, profilePhoto: true, gender: true, experience: true,
          educationBackground: true, rating: true, reviewsCount: true, isVisible: true,
          user: { select: { firstName: true, lastName: true } },
          subjects: { include: { subject: true, educationLevel: true } },
          offers: {
            where: { isActive: true, disabledByAdminAt: null },
            include: { subject: true, educationLevel: true },
          },
          places: { where: { isActive: true } },
        },
      });
      if (!profile) throw new NotFoundException('TUTOR_PROFILE_NOT_FOUND');

      return {
        id: profile.id,
        firstName: profile.user.firstName,
        lastName: profile.user.lastName,
        displayName: profile.displayName,
        profilePhoto: profile.profilePhoto,
        gender: profile.gender,
        rating: profile.rating,
        reviewsCount: profile.reviewsCount,
        isVerified: profile.isVisible,
        bio: profile.bio,
        experience: profile.experience,
        educationBackground: profile.educationBackground,
        subjects: profile.subjects.map((item) => ({
          id: item.id,
          subject: {
            id: item.subject.id,
            name: item.subject.name,
            category: item.subject.category,
            description: item.subject.description,
          },
          educationLevel: {
            id: item.educationLevel.id,
            name: item.educationLevel.name,
            category: item.educationLevel.category,
            displayOrder: item.educationLevel.displayOrder,
          },
          competenceDescription: item.competenceDescription,
        })),
        places: profile.places.map(toPublicPlace),
        offers: profile.offers.map((offer) => ({
          id: offer.id,
          title: offer.title,
          subject: {
            id: offer.subject.id,
            name: offer.subject.name,
            category: offer.subject.category,
            description: offer.subject.description,
          },
          educationLevel: offer.educationLevel
            ? {
                id: offer.educationLevel.id,
                name: offer.educationLevel.name,
                category: offer.educationLevel.category,
                displayOrder: offer.educationLevel.displayOrder,
              }
            : null,
          format: offer.format,
          durationMinutes: offer.durationMinutes,
          price: { amount: offer.price.toString(), currency: offer.currency },
          isActive: offer.isActive,
        })),
        nextSlotAt: null,
      };
    });
  }

  /** Détail public d'une offre disponible, y compris les relations consommées par le frontend. */
  async offerPublic(offerId: string) {
    const offer = await this.prisma.offer.findFirst({
      where: {
        id: offerId,
        isActive: true,
        disabledByAdminAt: null,
        tutorProfile: { isVisible: true, suspendedAt: null },
      },
      include: {
        subject: true,
        educationLevel: true,
        tutorProfile: {
          include: {
            user: { select: { firstName: true, lastName: true } },
            places: { where: { isActive: true } },
          },
        },
      },
    });
    if (!offer) throw new NotFoundException('OFFER_NOT_FOUND');

    return {
      id: offer.id,
      title: offer.title,
      subject: {
        id: offer.subject.id,
        name: offer.subject.name,
        category: offer.subject.category,
        description: offer.subject.description,
      },
      educationLevel: offer.educationLevel
        ? {
            id: offer.educationLevel.id,
            name: offer.educationLevel.name,
            category: offer.educationLevel.category,
            displayOrder: offer.educationLevel.displayOrder,
          }
        : null,
      format: offer.format,
      durationMinutes: offer.durationMinutes,
      price: { amount: offer.price.toString(), currency: offer.currency },
      isActive: offer.isActive,
      description: offer.description,
      tutor: {
        id: offer.tutorProfile.id,
        firstName: offer.tutorProfile.user.firstName,
        lastName: offer.tutorProfile.user.lastName,
        displayName: offer.tutorProfile.displayName,
        profilePhoto: offer.tutorProfile.profilePhoto,
        gender: offer.tutorProfile.gender,
        rating: offer.tutorProfile.rating,
        reviewsCount: offer.tutorProfile.reviewsCount,
        isVerified: offer.tutorProfile.isVisible,
      },
      places: offer.tutorProfile.places.map(toPublicPlace),
      disabledByAdmin: Boolean(offer.disabledByAdminAt),
      createdAt: offer.createdAt,
    };
  }

  /** UC-D01 : créneaux calculés sur une fenêtre maximale de 31 jours (cache journalier 60 s). */
  async daySlots(tutorProfileId: string, offerId: string, from: string, to: string, durationMinutes: number) {
    const offer = await this.prisma.offer.findFirst({
      where: {
        id: offerId,
        tutorProfileId,
        isActive: true,
        disabledByAdminAt: null,
        tutorProfile: { isVisible: true, suspendedAt: null },
      },
      select: { format: true },
    });
    if (!offer) throw new NotFoundException('OFFER_NOT_FOUND');
    const startMs = Date.parse(`${from}T00:00:00.000Z`);
    const endMs = Date.parse(`${to}T00:00:00.000Z`);
    const dayCount = Math.floor((endMs - startMs) / 86_400_000) + 1;
    const dates = Array.from({ length: dayCount }, (_, index) =>
      new Date(startMs + index * 86_400_000).toISOString().slice(0, 10),
    );
    // Aucun créneau antérieur au délai de prévenance : POST /bookings les refuserait (SLOT_TOO_SOON).
    const notBefore = ceilToStep(new Date(Date.now() + this.cfg.bookingMinNoticeHours * 3_600_000));

    return (await Promise.all(dates.map((date) =>
      this.cache.wrap(CacheKeys.slots(tutorProfileId, date, offerId, durationMinutes), 60, async () => {
        const dayStart = new Date(`${date}T00:00:00.000Z`);
        const dayEnd = new Date(dayStart.getTime() + 86_400_000);
        if (dayEnd <= notBefore) return [];
        const [rules, blocked, busy] = await Promise.all([
          this.prisma.availability.findMany({
            where: {
              tutorProfileId,
              isActive: true,
              OR: [{ offerId }, { offerId: null }],
            },
            include: { place: true },
          }),
          this.prisma.blockedPeriod.findMany({
            where: {
              tutorProfileId,
              startAt: { lt: dayEnd },
              endAt: { gt: dayStart },
            },
          }),
          this.prisma.booking.findMany({
            where: {
              tutorProfileId,
              status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
              startAt: { lt: dayEnd },
              endAt: { gt: dayStart },
            },
            select: { startAt: true, endAt: true },
          }),
        ]);
        const mapped: AvailabilityRule[] = rules.map((r) => ({
          id: r.id, dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime,
          timezone: r.timezone, validFrom: r.validFrom, validUntil: r.validUntil,
          isActive: r.isActive, offerId: r.offerId, placeId: r.placeId,
          placeType: r.place?.type ?? null,
        }));
        return SlotPolicy.computeSlots(
          mapped,
          blocked,
          busy,
          dayStart,
          1,
          durationMinutes,
          modesForFormat(offer.format),
          offerId,
          notBefore,
        );
      }),
    ))).flat();
  }
}
