import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OutboxWriter } from './outbox-writer';
import { OutboxRelayService } from './outbox-relay.service';
import { ResendEmailService } from './resend-email.service';

@Global()
@Module({
  imports: [HttpModule],
  providers: [OutboxWriter, OutboxRelayService, ResendEmailService],
  exports: [OutboxWriter],
})
export class OutboxInfrastructureModule {}
