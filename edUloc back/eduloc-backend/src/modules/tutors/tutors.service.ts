import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { assertOfferTrack } from '../catalog/domain/offer-track';
import { enqueueTutorReindex } from '../matching/indexing/reindex-events';

const offerResponseInclude = {
  subject: true,
  educationLevel: true,
  track: true,
  tutorProfile: {
    include: {
      user: { select: { firstName: true, lastName: true } },
      places: { where: { isActive: true } },
    },
  },
} satisfies Prisma.OfferInclude;

type OfferResponseRecord = Prisma.OfferGetPayload<{ include: typeof offerResponseInclude }>;

const tutorProfileResponseInclude = {
  user: { select: { firstName: true, lastName: true } },
  applications: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  subjects: { include: { subject: true, educationLevel: true } },
  offers: {
    where: { isActive: true, disabledByAdminAt: null },
    include: { subject: true, educationLevel: true, track: true },
  },
  places: { where: { isActive: true } },
  academicLevel: { select: { id: true, name: true, category: true } },
} satisfies Prisma.TutorProfileInclude;

type TutorProfileResponseRecord = Prisma.TutorProfileGetPayload<{ include: typeof tutorProfileResponseInclude }>;

const availabilityResponseInclude = {
  place: true,
} satisfies Prisma.AvailabilityInclude;

type AvailabilityResponseRecord = Prisma.AvailabilityGetPayload<{ include: typeof availabilityResponseInclude }>;

@Injectable()
export class TutorsService {
  constructor(private readonly prisma: PrismaService) {}

  async myProfile(userId: string) {
    return this.profileResponse(userId);
  }

  private async profileResponse(userId: string) {
    const p = await this.prisma.tutorProfile.findUnique({
      where: { userId },
      include: tutorProfileResponseInclude,
    });
    if (!p) throw new NotFoundException('TUTOR_PROFILE_NOT_FOUND');
    return this.toProfileResponse(p);
  }

  private toProfileResponse(p: TutorProfileResponseRecord) {
    return {
      id: p.id,
      firstName: p.user.firstName,
      lastName: p.user.lastName,
      displayName: p.displayName,
      profilePhoto: p.profilePhoto,
      gender: p.gender,
      rating: p.rating,
      reviewsCount: p.reviewsCount,
      isVerified: p.isVisible,
      bio: p.bio,
      experience: p.experience,
      educationBackground: p.educationBackground,
      highestDegree: p.highestDegree,
      degreeTitle: p.degreeTitle,
      fieldOfStudy: p.fieldOfStudy,
      specialization: p.specialization,
      degreeInstitution: p.degreeInstitution,
      degreeCountry: p.degreeCountry,
      // Niveau validé par EduLoc (lecture seule) ; le motif de la décision reste interne.
      academicLevel: p.academicLevel
        ? { ...p.academicLevel, validatedAt: p.academicLevelValidatedAt }
        : null,
      subjects: p.subjects.map((item) => ({
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
      places: p.places.map((place) => ({
        id: place.id,
        label: place.label,
        type: place.type,
        latitude: place.latitude,
        longitude: place.longitude,
        radiusMeters: place.radius,
        isPrimary: place.isPrimary,
      })),
      offers: p.offers.map((offer) => ({
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
        track: offer.track
          ? { id: offer.track.id, kind: offer.track.kind, code: offer.track.code, name: offer.track.name, domain: offer.track.domain }
          : null,
        format: offer.format,
        durationMinutes: offer.durationMinutes,
        price: { amount: offer.price.toString(), currency: offer.currency },
        isActive: offer.isActive,
      })),
      birthDate: p.birthDate?.toISOString().slice(0, 10) ?? null,
      isVisible: p.isVisible,
      suspendedAt: p.suspendedAt,
      applicationStatus: p.applications[0]?.status ?? 'DRAFT',
      nextSlotAt: null,
    };
  }

  async createProfile(userId: string, data: {
    displayName?: string; bio?: string; birthDate?: Date;
    profilePhoto?: string; gender?: 'MALE' | 'FEMALE'; experience?: string; educationBackground?: string;
    degreeTitle?: string; fieldOfStudy?: string; specialization?: string; degreeInstitution?: string; degreeCountry?: string;
  }) {
    await this.prisma.tutorProfile.create({ data: { userId, ...data } as never });
    return this.profileResponse(userId);
  }

  async updateProfile(userId: string, data: {
    displayName?: string; bio?: string; birthDate?: string;
    profilePhoto?: string; gender?: 'MALE' | 'FEMALE'; experience?: string; educationBackground?: string;
    degreeTitle?: string; fieldOfStudy?: string; specialization?: string; degreeInstitution?: string; degreeCountry?: string;
  }) {
    const { birthDate, ...profileData } = data;
    await this.prisma.$transaction(async (tx) => {
      const profile = await tx.tutorProfile.update({
        where: { userId },
        data: { ...profileData, ...(birthDate ? { birthDate: new Date(birthDate) } : {}) } as never,
        select: { id: true },
      });
      await enqueueTutorReindex(tx, profile.id);
    });
    return this.profileResponse(userId);
  }

  async addSubject(userId: string, data: {
    subjectId: string; educationLevelId: string; competenceDescription?: string;
  }) {
    const p = await this.prisma.tutorProfile.findUniqueOrThrow({ where: { userId } });
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.tutorSubject.create({ data: { tutorProfileId: p.id, ...data } as never });
      await enqueueTutorReindex(tx, p.id);
      return created;
    });
  }

  async removeSubject(userId: string, id: string) {
    const p = await this.prisma.tutorProfile.findUniqueOrThrow({ where: { userId } });
    return this.prisma.$transaction(async (tx) => {
      const removed = await tx.tutorSubject.deleteMany({ where: { id, tutorProfileId: p.id } });
      await enqueueTutorReindex(tx, p.id);
      return removed;
    });
  }
}

@Injectable()
export class OffersService {
  constructor(private readonly prisma: PrismaService) {}

  private profile(userId: string) {
    return this.prisma.tutorProfile.findUniqueOrThrow({ where: { userId } });
  }

  async listMine(userId: string) {
    const p = await this.profile(userId);
    const offers = await this.prisma.offer.findMany({
      where: { tutorProfileId: p.id },
      include: offerResponseInclude,
    });
    return offers.map((offer) => this.toResponse(offer));
  }

  /** UC-E04 : cohérence offre / matières déclarées. */
  async create(userId: string, data: {
    subjectId: string; educationLevelId?: string; trackId?: string | null; title: string; description: string;
    format?: string; durationMinutes?: number; price: number; currency?: string;
  }) {
    const p = await this.profile(userId);
    const declared = await this.prisma.tutorSubject.findFirst({
      where: { tutorProfileId: p.id, subjectId: data.subjectId },
    });
    if (!declared) throw new UnprocessableEntityException('SUBJECT_NOT_DECLARED');
    if (data.educationLevelId && declared.educationLevelId !== data.educationLevelId) {
      throw new UnprocessableEntityException('LEVEL_NOT_DECLARED');
    }
    await assertOfferTrack(this.prisma, data.educationLevelId, data.trackId);
    const offer = await this.prisma.$transaction(async (tx) => {
      const created = await tx.offer.create({ data: { tutorProfileId: p.id, ...data } as never });
      await enqueueTutorReindex(tx, p.id);
      return created;
    });
    return this.response(offer.id);
  }

  async update(userId: string, id: string, data: {
    subjectId?: string; educationLevelId?: string; trackId?: string | null; title?: string; description?: string;
    format?: string; durationMinutes?: number; price?: number; currency?: string;
  }) {
    const p = await this.profile(userId);
    const offer = await this.prisma.offer.findFirst({ where: { id, tutorProfileId: p.id } });
    if (!offer) throw new NotFoundException('OFFER_NOT_FOUND');
    if (offer.disabledByAdminAt) throw new UnprocessableEntityException('OFFER_DISABLED_BY_ADMIN');
    if (data.subjectId || data.educationLevelId) {
      // Même cohérence qu'à la création : on n'enseigne que ce qu'on a déclaré.
      const declared = await this.prisma.tutorSubject.findFirst({
        where: {
          tutorProfileId: p.id,
          subjectId: data.subjectId ?? offer.subjectId,
          ...(data.educationLevelId ? { educationLevelId: data.educationLevelId } : {}),
        },
      });
      if (!declared) throw new UnprocessableEntityException('SUBJECT_NOT_DECLARED');
    }
    // Une modification de prix ou de texte ne revalide pas la filière d'une offre existante ; changer le niveau ou la filière, si.
    if (data.educationLevelId !== undefined || data.trackId !== undefined) {
      await assertOfferTrack(
        this.prisma,
        data.educationLevelId ?? offer.educationLevelId,
        data.trackId !== undefined ? data.trackId : offer.trackId,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.offer.update({ where: { id }, data: data as never });
      await enqueueTutorReindex(tx, p.id);
    });
    return this.response(id);
  }

  async setActive(userId: string, id: string, isActive: boolean) {
    const p = await this.profile(userId);
    const offer = await this.prisma.offer.findFirst({ where: { id, tutorProfileId: p.id } });
    if (!offer) throw new NotFoundException('OFFER_NOT_FOUND');
    if (isActive && offer.disabledByAdminAt) throw new UnprocessableEntityException('OFFER_DISABLED_BY_ADMIN');
    await this.prisma.$transaction(async (tx) => {
      await tx.offer.update({ where: { id }, data: { isActive } });
      await enqueueTutorReindex(tx, p.id);
    });
    return this.response(id);
  }

  private async response(id: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: offerResponseInclude,
    });
    if (!offer) throw new NotFoundException('OFFER_NOT_FOUND');
    return this.toResponse(offer);
  }

  private toResponse(offer: OfferResponseRecord) {
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
      track: offer.track
        ? { id: offer.track.id, kind: offer.track.kind, code: offer.track.code, name: offer.track.name, domain: offer.track.domain }
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
      places: offer.tutorProfile.places.map((place) => ({
        id: place.id,
        label: place.label,
        type: place.type,
        latitude: place.latitude,
        longitude: place.longitude,
        radiusMeters: place.radius,
      })),
      disabledByAdmin: Boolean(offer.disabledByAdminAt),
      createdAt: offer.createdAt,
    };
  }
}

@Injectable()
export class PlacesService {
  constructor(private readonly prisma: PrismaService) {}

  private profile(userId: string) {
    return this.prisma.tutorProfile.findUniqueOrThrow({ where: { userId } });
  }

  async listMine(userId: string) {
    const p = await this.profile(userId);
    const places = await this.prisma.place.findMany({
      where: { tutorProfileId: p.id, isActive: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    return places.map((place) => placeResponse(place));
  }

  async create(userId: string, data: {
    label: string; address?: string; latitude?: number;
    longitude?: number; radiusMeters?: number; type: string; isPrimary?: boolean;
  }) {
    const p = await this.profile(userId);
    if (data.type === 'ONLINE' && (data.latitude !== undefined || data.longitude !== undefined)) {
      throw new UnprocessableEntityException('ONLINE_PLACE_NO_GEO');
    }
    const { radiusMeters, ...rest } = data;
    return this.prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        await tx.place.updateMany({ where: { tutorProfileId: p.id }, data: { isPrimary: false } });
      }
      const created = await tx.place.create({
        data: { tutorProfileId: p.id, ...rest, radius: radiusMeters ?? null } as never,
      });
      return placeResponse(created);
    });
  }

  async update(userId: string, id: string, data: {
    label?: string; address?: string; latitude?: number; longitude?: number;
    radiusMeters?: number; type?: string; isPrimary?: boolean;
  }) {
    const p = await this.profile(userId);
    const { radiusMeters, ...rest } = data;
    return this.prisma.$transaction(async (tx) => {
      if (data.isPrimary === true) {
        await tx.place.updateMany({
          where: { tutorProfileId: p.id, id: { not: id } },
          data: { isPrimary: false },
        });
      }
      const res = await tx.place.updateMany({
        where: { id, tutorProfileId: p.id, isActive: true },
        data: { ...rest, ...(radiusMeters !== undefined ? { radius: radiusMeters } : {}) } as never,
      });
      if (!res.count) throw new NotFoundException('PLACE_NOT_FOUND');
      return placeResponse(await tx.place.findUniqueOrThrow({ where: { id } }));
    });
  }

  /** Désactivation douce : les réservations passées gardent leur lieu. */
  async remove(userId: string, id: string) {
    const p = await this.profile(userId);
    const place = await this.prisma.place.findFirst({ where: { id, tutorProfileId: p.id, isActive: true } });
    if (!place) throw new NotFoundException('PLACE_NOT_FOUND');
    const future = await this.prisma.booking.count({
      where: { placeId: id, status: { in: ['PENDING', 'CONFIRMED'] }, startAt: { gt: new Date() } },
    });
    if (future > 0) throw new UnprocessableEntityException('AVAILABILITY_HAS_FUTURE_BOOKINGS');
    await this.prisma.$transaction([
      this.prisma.availability.updateMany({ where: { placeId: id }, data: { isActive: false } }),
      this.prisma.place.update({ where: { id }, data: { isActive: false, isPrimary: false } }),
    ]);
    return { ok: true };
  }
}

/** Lieu « En ligne » du tuteur — créé à la demande, un seul par tuteur. */
async function ensureOnlinePlace(prisma: PrismaService | Prisma.TransactionClient, tutorProfileId: string) {
  const existing = await prisma.place.findFirst({
    where: { tutorProfileId, type: 'ONLINE', isActive: true },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.place.create({
    data: { tutorProfileId, label: 'En ligne', type: 'ONLINE' },
    select: { id: true },
  });
  return created.id;
}

const placeResponse = (place: {
  id: string; label: string; type: string; address: string | null; latitude: number | null;
  longitude: number | null; radius: number | null; isPrimary: boolean; isActive: boolean;
}) => ({
  id: place.id,
  label: place.label,
  type: place.type,
  address: place.address,
  latitude: place.latitude,
  longitude: place.longitude,
  radiusMeters: place.radius,
  isPrimary: place.isPrimary,
  isActive: place.isActive,
});

const HHMM_TO_MIN = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};

@Injectable()
export class AvailabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  private profile(userId: string) {
    return this.prisma.tutorProfile.findUniqueOrThrow({ where: { userId } });
  }

  /** Règles actives uniquement : une disponibilité « supprimée » (désactivée) ne doit plus apparaître. */
  async listMine(userId: string) {
    const p = await this.profile(userId);
    const availabilities = await this.prisma.availability.findMany({
      where: { tutorProfileId: p.id, isActive: true },
      include: availabilityResponseInclude,
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    return availabilities.map((availability) => this.toResponse(availability));
  }

  async create(userId: string, data: {
    dayOfWeek: number; startTime: string; endTime: string; timezone?: string;
    placeId?: string | null; online?: boolean; offerId?: string | null;
    validFrom?: string | null; validUntil?: string | null;
  }) {
    const p = await this.profile(userId);
    this.assertTimeOrder(data.startTime, data.endTime);
    const placeId = await this.resolvePlace(p.id, data.placeId, data.online);
    await this.assertOffer(p.id, data.offerId);
    const availability = await this.prisma.availability.create({
      data: {
        tutorProfileId: p.id,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        ...(data.timezone ? { timezone: data.timezone } : {}),
        placeId,
        offerId: data.offerId ?? null,
        validFrom: data.validFrom ? new Date(data.validFrom) : null,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
      },
      include: availabilityResponseInclude,
    });
    return this.toResponse(availability);
  }

  async update(userId: string, id: string, data: {
    dayOfWeek?: number; startTime?: string; endTime?: string; timezone?: string;
    placeId?: string | null; online?: boolean; offerId?: string | null;
    validFrom?: string | null; validUntil?: string | null;
  }) {
    const p = await this.profile(userId);
    const current = await this.prisma.availability.findFirst({ where: { id, tutorProfileId: p.id, isActive: true } });
    if (!current) throw new NotFoundException('AVAILABILITY_NOT_FOUND');
    this.assertTimeOrder(data.startTime ?? current.startTime, data.endTime ?? current.endTime);
    await this.assertOffer(p.id, data.offerId);

    const patch: Prisma.AvailabilityUncheckedUpdateInput = {};
    if (data.dayOfWeek !== undefined) patch.dayOfWeek = data.dayOfWeek;
    if (data.startTime !== undefined) patch.startTime = data.startTime;
    if (data.endTime !== undefined) patch.endTime = data.endTime;
    if (data.timezone !== undefined) patch.timezone = data.timezone;
    if (data.offerId !== undefined) patch.offerId = data.offerId;
    if (data.validFrom !== undefined) patch.validFrom = data.validFrom ? new Date(data.validFrom) : null;
    if (data.validUntil !== undefined) patch.validUntil = data.validUntil ? new Date(data.validUntil) : null;
    if (data.online !== undefined || data.placeId !== undefined) {
      patch.placeId = await this.resolvePlace(p.id, data.placeId, data.online);
    }
    const availability = await this.prisma.availability.update({
      where: { id },
      data: patch,
      include: availabilityResponseInclude,
    });
    return this.toResponse(availability);
  }

  /** UC-E08 : désactivation douce — ne pas casser silencieusement les rendez-vous. */
  async remove(userId: string, id: string) {
    const p = await this.profile(userId);
    const av = await this.prisma.availability.findFirst({ where: { id, tutorProfileId: p.id } });
    if (!av) throw new NotFoundException('AVAILABILITY_NOT_FOUND');
    const future = await this.prisma.booking.count({
      where: {
        availabilityId: id,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startAt: { gt: new Date() },
      },
    });
    if (future > 0) throw new UnprocessableEntityException('AVAILABILITY_HAS_FUTURE_BOOKINGS');
    const availability = await this.prisma.availability.update({
      where: { id },
      data: { isActive: false },
      include: availabilityResponseInclude,
    });
    return this.toResponse(availability);
  }

  async blockPeriod(userId: string, data: { startAt: Date; endAt: Date; reason?: string }) {
    const p = await this.profile(userId);
    if (data.endAt <= data.startAt) throw new UnprocessableEntityException('AVAILABILITY_TIME_INVALID');
    return this.prisma.blockedPeriod.create({ data: { tutorProfileId: p.id, ...data } });
  }

  async listBlocked(userId: string) {
    const p = await this.profile(userId);
    return this.prisma.blockedPeriod.findMany({
      where: { tutorProfileId: p.id, endAt: { gt: new Date() } },
      orderBy: { startAt: 'asc' },
    });
  }

  async unblock(userId: string, id: string) {
    const p = await this.profile(userId);
    const res = await this.prisma.blockedPeriod.deleteMany({ where: { id, tutorProfileId: p.id } });
    if (!res.count) throw new NotFoundException('AVAILABILITY_NOT_FOUND');
    return { ok: true };
  }

  private assertTimeOrder(startTime: string, endTime: string) {
    if (HHMM_TO_MIN(endTime) <= HHMM_TO_MIN(startTime)) {
      throw new UnprocessableEntityException('AVAILABILITY_TIME_INVALID');
    }
  }

  /** `online` → lieu « En ligne » ; sinon le lieu doit appartenir au tuteur. */
  private async resolvePlace(tutorProfileId: string, placeId?: string | null, online?: boolean) {
    if (online) return ensureOnlinePlace(this.prisma, tutorProfileId);
    if (!placeId) return null;
    const place = await this.prisma.place.findFirst({
      where: { id: placeId, tutorProfileId, isActive: true },
      select: { id: true },
    });
    if (!place) throw new NotFoundException('PLACE_NOT_FOUND');
    return place.id;
  }

  private async assertOffer(tutorProfileId: string, offerId?: string | null) {
    if (!offerId) return;
    const offer = await this.prisma.offer.findFirst({ where: { id: offerId, tutorProfileId }, select: { id: true } });
    if (!offer) throw new NotFoundException('OFFER_NOT_FOUND');
  }

  private toResponse(availability: AvailabilityResponseRecord) {
    return {
      id: availability.id,
      dayOfWeek: availability.dayOfWeek,
      startTime: availability.startTime,
      endTime: availability.endTime,
      timezone: availability.timezone,
      validFrom: availability.validFrom?.toISOString().slice(0, 10) ?? null,
      validUntil: availability.validUntil?.toISOString().slice(0, 10) ?? null,
      place: availability.place
        ? {
            id: availability.place.id,
            label: availability.place.label,
            type: availability.place.type,
            latitude: availability.place.latitude,
            longitude: availability.place.longitude,
            radiusMeters: availability.place.radius,
          }
        : null,
      offerId: availability.offerId,
      isActive: availability.isActive,
    };
  }
}
