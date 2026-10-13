import {
  Inject, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Prisma } from '../../generated/prisma/client';
import { AppConfig } from '../../core/config/app.config';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { CacheKeys } from '../../infrastructure/cache/cache.service';
import { canTeachLevel, subjectCoversCategory } from '../catalog/domain/degree-policy';
import { OutboxWriter } from '../../infrastructure/outbox/outbox-writer';
import {
  STORAGE_PROVIDER, StorageProvider, extFromMime, tutorDocumentPath, tutorIntroVideoPath,
} from '../../infrastructure/storage/storage-provider.port';
import {
  TutorApplicationInputDto, TutorDocumentRegistrationDto, TutorUploadRequestDto,
} from './tutor-applications.dto';

const applicationInclude = {
  documents: { orderBy: { uploadedAt: 'asc' as const } },
  tutorProfile: {
    include: {
      subjects: { include: { subject: true, educationLevel: true } },
      experiences: { orderBy: { createdAt: 'asc' as const } },
      introVideo: true,
    },
  },
} satisfies Prisma.TutorApplicationInclude;

type ApplicationRecord = Prisma.TutorApplicationGetPayload<{ include: typeof applicationInclude }>;

interface TutorUploadMetadata {
  applicationId: string;
  userId: string;
  tutorProfileId: string;
  kind: 'DOCUMENT' | 'VIDEO';
  bucket: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  fileName?: string;
  durationMs?: number;
}

const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
const DOCUMENT_LIMIT_BYTES = 10 * 1024 * 1024;
const VIDEO_LIMIT_BYTES = 100 * 1024 * 1024;
const DAY_MINUTES = 24 * 60;

@Injectable()
export class TutorApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly cfg: AppConfig,
    private readonly outbox: OutboxWriter,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async getMine(userId: string) {
    const profile = await this.prisma.tutorProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException('TUTOR_APPLICATION_NOT_FOUND');
    const application = await this.prisma.tutorApplication.findFirst({
      where: { tutorProfileId: profile.id },
      orderBy: { createdAt: 'desc' },
      include: applicationInclude,
    });
    if (!application) throw new NotFoundException('TUTOR_APPLICATION_NOT_FOUND');
    return this.toResponse(application);
  }

  async createDraft(userId: string, input: TutorApplicationInputDto) {
    return this.saveDraft(userId, input);
  }

  async updateDraft(userId: string, applicationId: string, input: TutorApplicationInputDto) {
    return this.saveDraft(userId, input, applicationId);
  }

  private async saveDraft(userId: string, input: TutorApplicationInputDto, applicationId?: string) {
    const email = input.email.trim().toLowerCase();
    if (input.places.length && input.places.filter((place) => place.isPrimary).length !== 1) {
      throw new UnprocessableEntityException('PRIMARY_PLACE_INVALID');
    }
    const profileId = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('USER_NOT_FOUND');
      if (user.email.toLowerCase() !== email) {
        throw new UnprocessableEntityException('ACCOUNT_EMAIL_MISMATCH');
      }

      const previousProfile = await tx.tutorProfile.findUnique({
        where: { userId },
        include: { applications: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });
      const latest = previousProfile?.applications[0];
      if (previousProfile?.isVisible || latest?.status === 'APPROVED') {
        throw new UnprocessableEntityException('TUTOR_ALREADY_APPROVED');
      }
      if (latest?.status === 'PENDING') {
        throw new UnprocessableEntityException('APPLICATION_ALREADY_PENDING');
      }
      if (applicationId && (!latest || latest.id !== applicationId || !['DRAFT', 'REJECTED'].includes(latest.status))) {
        throw new UnprocessableEntityException('APPLICATION_NOT_EDITABLE');
      }
      const editableApplicationId = applicationId ??
        (latest && ['DRAFT', 'REJECTED'].includes(latest.status) ? latest.id : undefined);

      const subjectIds = [...new Set(input.subjects.map((subject) => subject.subjectId))];
      const levelIds = [...new Set(input.subjects.map((subject) => subject.educationLevelId))];
      const [subjects, levels] = await Promise.all([
        tx.subject.findMany({
          where: { id: { in: subjectIds }, isActive: true },
          select: { id: true, levelCategories: true, isVerified: true, createdById: true },
        }),
        tx.educationLevel.findMany({
          where: { id: { in: levelIds } },
          select: { id: true, category: true, requiredDegree: true },
        }),
      ]);
      if (subjects.length !== subjectIds.length) throw new UnprocessableEntityException('UNKNOWN_SUBJECT');
      if (levels.length !== levelIds.length) throw new UnprocessableEntityException('UNKNOWN_EDUCATION_LEVEL');
      // Une compétence ajoutée librement n'appartient qu'à son auteur tant que son dossier n'est pas approuvé.
      if (subjects.some((subject) => !subject.isVerified && subject.createdById !== userId)) {
        throw new UnprocessableEntityException('UNKNOWN_SUBJECT');
      }
      // Qualification : le diplôme fixe les niveaux enseignables ; la compétence fixe ceux où elle a un sens.
      const levelById = new Map(levels.map((level) => [level.id, level]));
      const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
      for (const declared of input.subjects) {
        const level = levelById.get(declared.educationLevelId)!;
        const subject = subjectById.get(declared.subjectId)!;
        if (!canTeachLevel(input.highestDegree, level.requiredDegree)) {
          throw new UnprocessableEntityException('LEVEL_NOT_QUALIFIED');
        }
        if (subject.isVerified && !subjectCoversCategory(subject.levelCategories, level.category)) {
          throw new UnprocessableEntityException('SUBJECT_LEVEL_MISMATCH');
        }
      }
      for (const offer of input.offers) {
        if (!input.subjects.some((subject) =>
          subject.subjectId === offer.subjectId &&
          (!offer.educationLevelId || subject.educationLevelId === offer.educationLevelId),
        )) {
          throw new UnprocessableEntityException('OFFER_SUBJECT_NOT_DECLARED');
        }
      }
      for (const slot of input.availabilities) {
        if (slot.format !== 'ONLINE' && slot.placeIndex != null && slot.placeIndex >= input.places.length) {
          throw new UnprocessableEntityException('AVAILABILITY_PLACE_INVALID');
        }
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          phone: input.phone.trim(),
        },
      });

      const profile = await tx.tutorProfile.upsert({
        where: { userId },
        create: {
          userId,
          displayName: input.displayName?.trim() || `${input.firstName.trim()} ${input.lastName.trim()}`,
          bio: input.bio ?? null,
          birthDate: input.birthDate ? new Date(`${input.birthDate}T00:00:00.000Z`) : null,
          experience: input.experience ?? null,
          educationBackground: input.educationBackground ?? null,
          highestDegree: input.highestDegree ?? null,
          gender: input.gender ?? null,
        },
        update: {
          displayName: input.displayName?.trim() || `${input.firstName.trim()} ${input.lastName.trim()}`,
          bio: input.bio ?? null,
          birthDate: input.birthDate ? new Date(`${input.birthDate}T00:00:00.000Z`) : null,
          experience: input.experience ?? null,
          educationBackground: input.educationBackground ?? null,
          highestDegree: input.highestDegree ?? null,
          gender: input.gender ?? null,
        },
      });

      await tx.tutorExperience.deleteMany({ where: { tutorProfileId: profile.id } });
      await tx.tutorSubject.deleteMany({ where: { tutorProfileId: profile.id } });
      await tx.availability.updateMany({
        where: { tutorProfileId: profile.id, isActive: true },
        data: { isActive: false },
      });
      // Chaque enregistrement reconstruit les offres : les anciennes (sans réservation) sont supprimées
      // plutôt que laissées en doublons inactifs ; celles déjà réservées sont seulement désactivées.
      await tx.offer.deleteMany({ where: { tutorProfileId: profile.id, bookings: { none: {} } } });
      await tx.offer.updateMany({
        where: { tutorProfileId: profile.id, isActive: true },
        data: { isActive: false },
      });
      await tx.place.updateMany({
        where: { tutorProfileId: profile.id, isActive: true },
        data: { isActive: false, isPrimary: false },
      });

      for (const experience of input.experiences) {
        await tx.tutorExperience.create({
          data: { tutorProfileId: profile.id, ...experience },
        });
      }
      for (const subject of input.subjects) {
        await tx.tutorSubject.create({
          data: {
            tutorProfileId: profile.id,
            subjectId: subject.subjectId,
            educationLevelId: subject.educationLevelId,
            competenceDescription: subject.competenceDescription ?? null,
          },
        });
      }
      // Compétence ajoutée librement : ses niveaux d'enseignement sont ceux que son auteur a déclarés,
      // ce qui la réserve ensuite aux tuteurs qualifiés pour ces niveaux.
      for (const own of subjects.filter((subject) => !subject.isVerified && subject.createdById === userId)) {
        const categories = new Set(
          input.subjects.filter((d) => d.subjectId === own.id).map((d) => levelById.get(d.educationLevelId)!.category),
        );
        await tx.subject.update({ where: { id: own.id }, data: { levelCategories: [...categories] } });
      }

      const placeIds: string[] = [];
      for (const place of input.places) {
        const created = await tx.place.create({
          data: {
            tutorProfileId: profile.id,
            label: place.label,
            address: place.address ?? null,
            latitude: place.latitude ?? null,
            longitude: place.longitude ?? null,
            radius: place.radiusMeters ?? null,
            type: place.type,
            isPrimary: place.isPrimary ?? false,
          },
          select: { id: true },
        });
        placeIds.push(created.id);
      }

      let onlinePlaceId: string | null = null;
      if (input.availabilities.some((slot) => slot.format === 'ONLINE' || slot.format === 'BOTH')) {
        const onlinePlace = await tx.place.create({
          data: { tutorProfileId: profile.id, label: 'En ligne', type: 'ONLINE' },
          select: { id: true },
        });
        onlinePlaceId = onlinePlace.id;
      }

      for (const offer of input.offers) {
        await tx.offer.create({
          data: {
            tutorProfileId: profile.id,
            subjectId: offer.subjectId,
            educationLevelId: offer.educationLevelId ?? null,
            title: offer.title,
            description: offer.description,
            format: offer.format,
            durationMinutes: offer.durationMinutes,
            price: offer.price,
            currency: offer.currency ?? 'MGA',
          },
        });
      }

      for (const slot of input.availabilities) {
        const start = this.timeToMinutes(slot.startTime);
        const end = this.timeToMinutes(slot.endTime);
        if (end <= start || end - start > DAY_MINUTES) {
          throw new UnprocessableEntityException('AVAILABILITY_TIME_INVALID');
        }
        const placeId = slot.placeIndex == null ? null : placeIds[slot.placeIndex];
        // Ponctuelle : validFrom = validUntil = le jour (jours inclus, même convention que le calendrier du tuteur).
        const validity = this.oneOffValidity(slot);
        if (slot.format === 'ONLINE' || slot.format === 'BOTH') {
          await tx.availability.create({
            data: {
              tutorProfileId: profile.id,
              placeId: onlinePlaceId,
              dayOfWeek: slot.dayOfWeek,
              startTime: slot.startTime,
              endTime: slot.endTime,
              ...validity,
            },
          });
        }
        if (slot.format === 'IN_PERSON' || slot.format === 'BOTH') {
          await tx.availability.create({
            data: {
              tutorProfileId: profile.id,
              placeId,
              dayOfWeek: slot.dayOfWeek,
              startTime: slot.startTime,
              endTime: slot.endTime,
              ...validity,
            },
          });
        }
      }

      const application = editableApplicationId
        ? await tx.tutorApplication.update({
            where: { id: editableApplicationId },
            data: { status: 'DRAFT', rejectionReason: null, submittedAt: null },
          })
        : await tx.tutorApplication.create({
            data: { tutorProfileId: profile.id, status: 'DRAFT' },
          });
      return application.id;
    });

    return this.getResponse(profileId);
  }

  async requestDocumentUpload(userId: string, applicationId: string, input: TutorUploadRequestDto) {
    if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
      throw new UnprocessableEntityException('MIME_TYPE_NOT_ALLOWED');
    }
    if (input.sizeBytes > DOCUMENT_LIMIT_BYTES) throw new UnprocessableEntityException('FILE_TOO_LARGE');
    return this.createUploadTicket(userId, applicationId, 'DOCUMENT', input);
  }

  async requestVideoUpload(userId: string, applicationId: string, input: TutorUploadRequestDto) {
    if (!(VIDEO_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
      throw new UnprocessableEntityException('MIME_TYPE_NOT_ALLOWED');
    }
    if (input.sizeBytes > VIDEO_LIMIT_BYTES) throw new UnprocessableEntityException('FILE_TOO_LARGE');
    return this.createUploadTicket(userId, applicationId, 'VIDEO', input);
  }

  private async createUploadTicket(
    userId: string,
    applicationId: string,
    kind: TutorUploadMetadata['kind'],
    input: TutorUploadRequestDto,
  ) {
    const application = await this.requireEditableApplication(userId, applicationId);
    const fileId = randomUUID();
    const storagePath = kind === 'DOCUMENT'
      ? tutorDocumentPath(application.id, fileId, extFromMime(input.mimeType))
      : tutorIntroVideoPath(application.tutorProfileId, fileId, extFromMime(input.mimeType));
    const { signedUrl, token } = await this.storage.createSignedUploadUrl(this.cfg.tutorDocsBucket, storagePath);
    const uploadId = randomUUID();
    const metadata: TutorUploadMetadata = {
      applicationId: application.id,
      userId,
      tutorProfileId: application.tutorProfileId,
      kind,
      bucket: this.cfg.tutorDocsBucket,
      storagePath,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      fileName: input.fileName,
      durationMs: input.durationMs,
    };
    await this.redis.set(CacheKeys.upload(uploadId), JSON.stringify(metadata), 900);
    return { uploadId, signedUrl, token, expiresAt: new Date(Date.now() + 900_000) };
  }

  async registerDocument(userId: string, applicationId: string, input: TutorDocumentRegistrationDto) {
    const metadata = await this.consumeUpload(userId, applicationId, input.uploadId, 'DOCUMENT');
    const file = await this.verifyStoredFile(metadata, DOCUMENT_LIMIT_BYTES);
    const previousDocuments = await this.prisma.tutorDocument.findMany({
      where: { tutorApplicationId: applicationId, type: input.type },
      select: { id: true, storagePath: true },
    });
    const document = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tutorDocument.create({
        data: {
          tutorApplicationId: applicationId,
          type: input.type,
          storagePath: metadata.storagePath,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          fileName: metadata.fileName ?? null,
        },
      });
      if (previousDocuments.length) {
        await tx.tutorDocument.deleteMany({
          where: { id: { in: previousDocuments.map((previous) => previous.id) } },
        });
      }
      return created;
    });
    await Promise.all(previousDocuments.map((previous) =>
      this.storage.deleteObject(this.cfg.tutorDocsBucket, previous.storagePath),
    ));
    return document;
  }

  async registerVideo(userId: string, applicationId: string, uploadId: string) {
    const metadata = await this.consumeUpload(userId, applicationId, uploadId, 'VIDEO');
    const file = await this.verifyStoredFile(metadata, VIDEO_LIMIT_BYTES);
    const existing = await this.prisma.tutorIntroVideo.findUnique({
      where: { tutorProfileId: metadata.tutorProfileId },
    });
    const video = await this.prisma.tutorIntroVideo.upsert({
      where: { tutorProfileId: metadata.tutorProfileId },
      create: {
        tutorProfileId: metadata.tutorProfileId,
        storagePath: metadata.storagePath,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        fileName: metadata.fileName ?? null,
        durationMs: metadata.durationMs ?? null,
      },
      update: {
        storagePath: metadata.storagePath,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        fileName: metadata.fileName ?? null,
        durationMs: metadata.durationMs ?? null,
      },
    });
    if (existing && existing.storagePath !== metadata.storagePath) {
      await this.storage.deleteObject(this.cfg.tutorDocsBucket, existing.storagePath);
    }
    return { fileName: video.fileName, mimeType: video.mimeType, sizeBytes: video.sizeBytes };
  }

  async submit(userId: string, applicationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.tutorApplication.findFirst({
        where: { id: applicationId, tutorProfile: { userId } },
        include: { tutorProfile: { include: { subjects: true, offers: true, introVideo: true } } },
      });
      if (!application) throw new NotFoundException('TUTOR_APPLICATION_NOT_FOUND');
      if (application.status !== 'DRAFT') throw new UnprocessableEntityException('APPLICATION_NOT_EDITABLE');
      if (!application.tutorProfile.subjects.length) throw new UnprocessableEntityException('SUBJECT_REQUIRED');
      if (!application.tutorProfile.highestDegree) throw new UnprocessableEntityException('DEGREE_REQUIRED');
      if (!application.tutorProfile.gender) throw new UnprocessableEntityException('GENDER_REQUIRED');
      if (!application.tutorProfile.offers.some((offer) => offer.isActive)) {
        throw new UnprocessableEntityException('OFFER_REQUIRED');
      }
      if (!application.tutorProfile.introVideo) throw new UnprocessableEntityException('INTRO_VIDEO_REQUIRED');

      const submittedAt = new Date();
      const updated = await tx.tutorApplication.update({
        where: { id: application.id },
        data: { status: 'PENDING', submittedAt },
      });
      const admins = await tx.user.findMany({
        where: { isAdmin: true, status: 'ACTIVE' },
        select: { id: true },
      });
      await this.outbox.write(tx, {
        aggregateType: 'tutorApplication',
        aggregateId: application.id,
        eventType: 'tutor.application.submitted',
        recipientIds: admins.map((admin) => admin.id),
        payload: { applicationId: application.id, tutorProfileId: application.tutorProfileId },
        pushTitle: 'Nouvelle candidature',
        pushBody: 'Un tuteur a soumis son dossier.',
      });
      return this.toResponse(await tx.tutorApplication.findUniqueOrThrow({
        where: { id: updated.id },
        include: applicationInclude,
      }));
    });
  }

  private async getResponse(applicationId: string) {
    const application = await this.prisma.tutorApplication.findUnique({
      where: { id: applicationId },
      include: applicationInclude,
    });
    if (!application) throw new NotFoundException('TUTOR_APPLICATION_NOT_FOUND');
    return this.toResponse(application);
  }

  private async requireEditableApplication(userId: string, applicationId: string) {
    const application = await this.prisma.tutorApplication.findFirst({
      where: { id: applicationId, tutorProfile: { userId } },
      select: { id: true, tutorProfileId: true, status: true },
    });
    if (!application) throw new NotFoundException('TUTOR_APPLICATION_NOT_FOUND');
    if (application.status !== 'DRAFT') throw new UnprocessableEntityException('APPLICATION_NOT_EDITABLE');
    return application;
  }

  private async consumeUpload(
    userId: string,
    applicationId: string,
    uploadId: string,
    kind: TutorUploadMetadata['kind'],
  ) {
    const raw = await this.redis.getDel(CacheKeys.upload(uploadId));
    if (!raw) throw new UnprocessableEntityException('UPLOAD_EXPIRED');
    const metadata = JSON.parse(raw) as TutorUploadMetadata;
    if (
      metadata.userId !== userId ||
      metadata.applicationId !== applicationId ||
      metadata.kind !== kind
    ) {
      throw new UnprocessableEntityException('UPLOAD_MISMATCH');
    }
    await this.requireEditableApplication(userId, applicationId);
    return metadata;
  }

  private async verifyStoredFile(metadata: TutorUploadMetadata, maxBytes: number) {
    const stored = await this.storage.getObjectInfo(metadata.bucket, metadata.storagePath);
    if (!stored.exists) throw new UnprocessableEntityException('UPLOAD_NOT_FOUND');
    if (stored.sizeBytes <= 0 || stored.sizeBytes > maxBytes) {
      throw new UnprocessableEntityException('FILE_TOO_LARGE');
    }
    if (stored.mimeType && stored.mimeType !== metadata.mimeType) {
      throw new UnprocessableEntityException('MIME_TYPE_MISMATCH');
    }
    return { sizeBytes: stored.sizeBytes, mimeType: stored.mimeType || metadata.mimeType };
  }

  /**
   * Disponibilité ponctuelle (date précise) : le jour doit correspondre au jour de la semaine annoncé, ne pas être
   * passé (heure de Madagascar, UTC+3) ni lointain de plus d'un an. Sans date : règle récurrente (aucune validité).
   */
  private oneOffValidity(slot: { date?: string; dayOfWeek: number }): { validFrom?: Date; validUntil?: Date } {
    if (!slot.date) return {};
    const day = new Date(`${slot.date}T00:00:00.000Z`);
    const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    const limit = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
    const valid =
      !Number.isNaN(day.getTime()) &&
      day.toISOString().slice(0, 10) === slot.date &&
      day.getUTCDay() === slot.dayOfWeek &&
      slot.date >= today &&
      slot.date <= limit;
    if (!valid) throw new UnprocessableEntityException('AVAILABILITY_DATE_INVALID');
    return { validFrom: day, validUntil: day };
  }

  private toResponse(application: ApplicationRecord) {
    return {
      id: application.id,
      tutorProfileId: application.tutorProfileId,
      highestDegree: application.tutorProfile.highestDegree,
      gender: application.tutorProfile.gender,
      status: application.status,
      submittedAt: application.submittedAt,
      reviewedAt: application.reviewedAt,
      rejectionReason: application.rejectionReason,
      subjects: application.tutorProfile.subjects.map((item) => ({
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
      documents: application.documents.map((document) => ({
        id: document.id,
        type: document.type,
        status: document.status,
        fileName: document.fileName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        rejectionReason: document.rejectionReason,
        uploadedAt: document.uploadedAt,
      })),
      experiences: application.tutorProfile.experiences,
      introVideo: application.tutorProfile.introVideo
        ? {
            fileName: application.tutorProfile.introVideo.fileName,
            mimeType: application.tutorProfile.introVideo.mimeType,
            sizeBytes: application.tutorProfile.introVideo.sizeBytes,
            durationMs: application.tutorProfile.introVideo.durationMs,
            uploadedAt: application.tutorProfile.introVideo.uploadedAt,
          }
        : null,
      createdAt: application.createdAt,
    };
  }

  private timeToMinutes(value: string) {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }
}
