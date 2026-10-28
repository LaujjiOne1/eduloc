import { Injectable } from '@nestjs/common';
import type { Room, RoomPhoto, RoomAvailability } from '../../generated/prisma/client';
import { AppConfig } from '../../core/config/app.config';
import { PrismaService } from '../../core/prisma/prisma.service';
import { NotFoundError, UnprocessableError } from '../../common/errors/domain-errors';
import { roomWithinTutorZone } from '../bookings/domain/travel';
import { bookableRoomWhere } from '../partners/domain/room-bookability';
import { PartnerUploadsService } from '../partners/partner-support';

type PublicRoomRecord = Room & {
  photos: RoomPhoto[];
  availabilities: RoomAvailability[];
  venue: { type: string };
};

const publicInclude = {
  photos: { orderBy: { position: 'asc' as const } },
  availabilities: { where: { isActive: true }, orderBy: [{ dayOfWeek: 'asc' as const }, { startTime: 'asc' as const }] },
  venue: { select: { type: true } },
};

// Même règle d'arrondi que pour les domiciles de tuteurs (recherche) : une seule définition.
import { approximateDistance } from '../search/domain/public-location';
export { approximateDistance };

/**
 * FICHE PUBLIQUE d'une salle (spec 9) : zone approximative, distance estimée, équipements, capacité, prix, conditions et
 * ouverture. Ce mapper est la SEULE sortie publique d'une salle : il ne lit ni addressLine, ni city, ni latitude /
 * longitude, ni accessInstructions, ni le nom de la structure. Un test d'intégration verrouille cette propriété.
 */
export function toPublicRoom(
  room: PublicRoomRecord,
  photos: { id: string; url: string }[],
  distanceMeters?: number | null,
) {
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    zoneLabel: room.zoneLabel,
    venueType: room.venue.type,
    capacity: room.capacity,
    equipment: room.equipment,
    accessibility: room.accessibility,
    welcomesMinors: room.welcomesMinors,
    pricePerHour: room.pricePerHour ? { amount: room.pricePerHour.toString(), currency: room.currency } : null,
    rating: Math.round(room.rating * 10) / 10,
    reviewsCount: room.reviewsCount,
    rules: room.rules,
    cancellationPolicy: room.cancellationPolicy,
    openingHours: room.availabilities.map((a) => ({
      dayOfWeek: a.dayOfWeek, startTime: a.startTime, endTime: a.endTime,
      validFrom: a.validFrom?.toISOString().slice(0, 10) ?? null, validUntil: a.validUntil?.toISOString().slice(0, 10) ?? null,
    })),
    photos,
    distanceMeters: distanceMeters === null || distanceMeters === undefined ? null : approximateDistance(distanceMeters),
  };
}

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AppConfig,
    private readonly uploads: PartnerUploadsService,
  ) {}

  async photosOf(room: { photos: RoomPhoto[] }) {
    return Promise.all(room.photos.map(async (p) => ({
      id: p.id, url: await this.uploads.readUrl(this.cfg.roomPhotosBucket, p.storagePath, 3600),
    })));
  }

  /** Salles réservables (validées, publiées, actives, souscription en cours), éventuellement autour d'un point. */
  async list(q: { lat?: number; lng?: number; radiusM: number; limit: number }) {
    const now = new Date();
    let distances: Map<string, number> | null = null;
    let ids: string[] | null = null;
    if (q.lat !== undefined && q.lng !== undefined) {
      const rows = await this.prisma.$queryRaw<{ id: string; d: number }[]>`
        SELECT id, ST_Distance(location, ST_MakePoint(${q.lng}::float8, ${q.lat}::float8)::geography) AS d
        FROM rooms
        WHERE location IS NOT NULL
          AND ST_DWithin(location, ST_MakePoint(${q.lng}::float8, ${q.lat}::float8)::geography, ${q.radiusM}::float8)
        ORDER BY d
        LIMIT 200`;
      distances = new Map(rows.map((r) => [r.id, Number(r.d)]));
      ids = rows.map((r) => r.id);
    }
    const rooms = await this.prisma.room.findMany({
      where: { ...(ids ? { id: { in: ids } } : {}), ...bookableRoomWhere(now) },
      include: publicInclude,
      orderBy: { name: 'asc' },
      take: 200,
    });
    const ordered = distances
      ? rooms.sort((a, b) => (distances!.get(a.id) ?? 0) - (distances!.get(b.id) ?? 0))
      : rooms;
    return Promise.all(ordered.slice(0, q.limit).map(async (r) =>
      toPublicRoom(r, await this.photosOf(r), distances?.get(r.id) ?? null)));
  }

  async detail(roomId: string, near?: { lat: number; lng: number }) {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, ...bookableRoomWhere() },
      include: publicInclude,
    });
    if (!room) throw new NotFoundError('ROOM_NOT_BOOKABLE');
    let distance: number | null = null;
    if (near) {
      const rows = await this.prisma.$queryRaw<{ d: number | null }[]>`
        SELECT ST_Distance(location, ST_MakePoint(${near.lng}::float8, ${near.lat}::float8)::geography) AS d
        FROM rooms WHERE id = ${roomId}`;
      distance = rows[0]?.d === null || rows[0]?.d === undefined ? null : Number(rows[0].d);
    }
    return toPublicRoom(room, await this.photosOf(room), distance);
  }

  // ------------------------------------------------------------------ salles acceptées par le Tuteur

  private async tutorOf(userId: string) {
    return this.prisma.tutorProfile.findUniqueOrThrow({ where: { userId }, select: { id: true } });
  }

  /**
   * Liste des salles où le Tuteur accepte d'intervenir. Déclarer une salle n'en bloque AUCUN horaire (spec 3.1) : c'est un
   * simple accord, vérifié à nouveau à chaque demande et à chaque acceptation.
   */
  async listAccepted(userId: string) {
    const tutor = await this.tutorOf(userId);
    const links = await this.prisma.tutorRoom.findMany({
      where: { tutorProfileId: tutor.id, isActive: true },
      include: { room: { include: publicInclude } },
      orderBy: { createdAt: 'asc' },
    });
    const bookable = new Set(
      (await this.prisma.room.findMany({
        where: { id: { in: links.map((l) => l.roomId) }, ...bookableRoomWhere() }, select: { id: true },
      })).map((r) => r.id),
    );
    return Promise.all(links.map(async (l) => ({
      ...toPublicRoom(l.room, await this.photosOf(l.room)),
      bookable: bookable.has(l.roomId),
      acceptedSince: l.createdAt,
    })));
  }

  async accept(userId: string, roomId: string) {
    const tutor = await this.tutorOf(userId);
    const room = await this.prisma.room.findFirst({ where: { id: roomId, ...bookableRoomWhere() }, select: { id: true, latitude: true, longitude: true } });
    if (!room) throw new NotFoundError('ROOM_NOT_BOOKABLE');
    await this.assertInTutorZone(tutor.id, room);
    await this.prisma.tutorRoom.upsert({
      where: { tutorProfileId_roomId: { tutorProfileId: tutor.id, roomId } },
      create: { tutorProfileId: tutor.id, roomId },
      update: { isActive: true },
    });
    return this.listAccepted(userId);
  }

  /** Filtre dur : une salle hors du rayon d'intervention du Tuteur (s'il en a défini un) ne peut pas être acceptée. */
  private async assertInTutorZone(tutorProfileId: string, room: { latitude: number | null; longitude: number | null }) {
    const profile = await this.prisma.tutorProfile.findUniqueOrThrow({
      where: { id: tutorProfileId },
      select: { partnerRoomRadiusM: true, places: { where: { isActive: true }, select: { type: true, latitude: true, longitude: true } } },
    });
    if (!roomWithinTutorZone(profile.places, room, profile.partnerRoomRadiusM)) throw new UnprocessableError('ROOM_OUT_OF_TUTOR_ZONE');
  }

  /** Le Tuteur retire son accord : les séances déjà confirmées restent, les demandes en attente ne pourront plus être acceptées. */
  async withdraw(userId: string, roomId: string) {
    const tutor = await this.tutorOf(userId);
    await this.prisma.tutorRoom.updateMany({ where: { tutorProfileId: tutor.id, roomId }, data: { isActive: false } });
    return this.listAccepted(userId);
  }
}
