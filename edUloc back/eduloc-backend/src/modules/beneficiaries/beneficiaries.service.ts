import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateBeneficiaryDto, UpdateBeneficiaryDto } from './dto';

@Injectable()
export class BeneficiariesService {
  constructor(private readonly prisma: PrismaService) {}

  list(requesterId: string) {
    return this.prisma.beneficiary.findMany({ where: { requesterId, archivedAt: null } });
  }

  async get(requesterId: string, id: string) {
    const b = await this.prisma.beneficiary.findFirst({ where: { id, requesterId, archivedAt: null } });
    if (!b) throw new NotFoundException('BENEFICIARY_NOT_FOUND');
    return b;
  }

  create(requesterId: string, dto: CreateBeneficiaryDto) {
    // Un seul « moi-même » par compte : on réutilise celui qui existe.
    if (dto.relationship === 'SELF') return this.ensureSelf(requesterId, dto.educationLevelId);
    return this.prisma.beneficiary.create({
      data: {
        requesterId,
        ...dto,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      } as never,
    });
  }

  /**
   * « Pour moi » : le demandeur EST le bénéficiaire, on ne lui redemande donc rien. Le bénéficiaire « moi-même »
   * est créé à partir du compte (nom, prénom) la première fois, puis réutilisé. Idempotent, et sans doublon
   * même si deux requêtes arrivent en même temps (verrou par compte).
   * Le niveau, s'il est fourni, est celui que le demandeur vient d'indiquer pour ce cours.
   */
  async ensureSelf(requesterId: string, educationLevelId?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`self-beneficiary:${requesterId}`}))`;
      const existing = await tx.beneficiary.findFirst({
        where: { requesterId, relationship: 'SELF', archivedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (existing) {
        if (educationLevelId && existing.educationLevelId !== educationLevelId) {
          return tx.beneficiary.update({ where: { id: existing.id }, data: { educationLevelId } });
        }
        return existing;
      }
      const user = await tx.user.findUniqueOrThrow({
        where: { id: requesterId },
        select: { firstName: true, lastName: true },
      });
      return tx.beneficiary.create({
        data: {
          requesterId,
          firstName: user.firstName,
          lastName: user.lastName || null,
          relationship: 'SELF',
          educationLevelId: educationLevelId ?? null,
        } as never,
      });
    });
  }

  async update(requesterId: string, id: string, dto: UpdateBeneficiaryDto) {
    await this.get(requesterId, id);
    return this.prisma.beneficiary.update({
      where: { id },
      data: { ...dto, birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined } as never,
    });
  }

  async archive(requesterId: string, id: string) {
    const b = await this.get(requesterId, id);
    const future = await this.prisma.booking.count({
      where: {
        beneficiaryId: b.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startAt: { gt: new Date() },
      },
    });
    if (future > 0) throw new ForbiddenException('BENEFICIARY_HAS_FUTURE_BOOKINGS');
    return this.prisma.beneficiary.update({ where: { id }, data: { archivedAt: new Date() } });
  }
}
