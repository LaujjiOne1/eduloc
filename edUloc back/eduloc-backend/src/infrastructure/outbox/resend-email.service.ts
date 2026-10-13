import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AppConfig } from '../../core/config/app.config';

interface EmailEventPayload {
  email: string;
  code: string;
}

@Injectable()
export class ResendEmailService {
  private readonly logger = new Logger(ResendEmailService.name);

  constructor(
    private readonly http: HttpService,
    private readonly cfg: AppConfig,
  ) {}

  async sendOutboxEmail(eventType: string, payload: unknown, eventId: string): Promise<void> {
    if (eventType !== 'user.verification_requested' && eventType !== 'user.password_reset_requested') {
      return;
    }
    const { email, code } = this.readPayload(payload);
    const verification = eventType === 'user.verification_requested';

    if (!this.cfg.resendApiKey) {
      if (this.cfg.nodeEnv === 'production') throw new Error('RESEND_API_KEY is not configured');
      // Développement sans fournisseur d'e-mail : le code est lisible dans les logs de l'API.
      this.logger.warn(`[DEV] ${verification ? 'Code de vérification' : 'Code de réinitialisation'} pour ${email} : ${code}`);
      return;
    }

    const subject = verification ? 'Votre code de vérification EduLoc' : 'Votre code de réinitialisation EduLoc';
    const instruction = verification
      ? 'Saisissez ce code dans l’application EduLoc pour vérifier votre adresse e-mail :'
      : 'Saisissez ce code dans l’application EduLoc pour choisir un nouveau mot de passe :';
    const html = [
      '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#242424">',
      '<h1>EduLoc</h1>',
      `<p>${instruction}</p>`,
      `<p style="font-size:32px;font-weight:bold;letter-spacing:8px">${this.escapeHtml(code)}</p>`,
      `<p>Ce code expire dans ${verification ? '1 heure' : '30 minutes'}.</p>`,
      '<p>Si vous n’avez pas demandé cette opération, ignorez cet e-mail.</p>',
      '</div>',
    ].join('');

    try {
      await firstValueFrom(this.http.post(
        'https://api.resend.com/emails',
        {
          from: this.cfg.mailFrom,
          to: [email],
          subject,
          html,
        },
        {
          headers: {
            Authorization: `Bearer ${this.cfg.resendApiKey}`,
            'Idempotency-Key': `eduloc-${eventId}`,
          },
          timeout: 10_000,
        },
      ));
      this.logger.log(`E-mail ${eventType} envoyé`);
    } catch (error) {
      const data = (error as { response?: { data?: { name?: string; message?: string } } }).response?.data;
      this.logger.error(`Échec d’envoi Resend (${eventType})${data ? ` : ${data.name ?? ''} ${data.message ?? ''}` : ''}`);
      throw error;
    }
  }

  private readPayload(payload: unknown): EmailEventPayload {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Invalid email event payload');
    }
    const value = payload as Record<string, unknown>;
    if (typeof value.email !== 'string' || typeof value.code !== 'string') {
      throw new Error('Invalid email event payload');
    }
    return { email: value.email, code: value.code };
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]!);
  }
}
