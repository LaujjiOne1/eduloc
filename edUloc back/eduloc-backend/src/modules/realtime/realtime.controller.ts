import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { AppConfig } from '../../core/config/app.config';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CentrifugoTokenService } from '../../infrastructure/realtime/centrifugo-token.service';
import { SubscriptionQueryDto } from './dto';

@ApiTags('realtime')
@ApiBearerAuth()
@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly tokens: CentrifugoTokenService,
    private readonly prisma: PrismaService,
    private readonly cfg: AppConfig,
  ) {}

  @Get('connection-token')
  connectionToken(@CurrentUser() u: AuthUser) {
    return {
      token: this.tokens.connectionToken(u.userId),
      expiresIn: 900,
      // Canal personnel de l'utilisateur : tous ses événements métier y transitent (ADR-03).
      url: this.cfg.centrifugoPublicUrl,
      channel: `personal:#${u.userId}`,
    };
  }

  /** Token d'abonnement : contrôle de participation obligatoire pour conv:…. */
  @Get('subscription-token')
  async subscriptionToken(@CurrentUser() u: AuthUser, @Query() q: SubscriptionQueryDto) {
    if (q.channel.startsWith('conv:')) {
      const conversationId = q.channel.slice(5);
      const isParticipant = await this.prisma.conversation.findFirst({
        where: {
          id: conversationId,
          OR: [{ requesterId: u.userId }, { tutorProfile: { userId: u.userId } }],
        },
        select: { id: true },
      });
      if (!isParticipant) throw new UnauthorizedException('CHANNEL_FORBIDDEN');
    }
    return { token: this.tokens.subscriptionToken(u.userId, q.channel), expiresIn: 900 };
  }
}
