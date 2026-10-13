import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { DomainError } from '../errors/domain-errors';
import { ERROR_MESSAGES, isErrorCode } from '../errors/error-messages';

interface FieldError {
  field: string;
  message: string;
}

interface Problem {
  status: number;
  code: string;
  title: string;
  detail?: string;
  fields?: string[];
  errors?: FieldError[];
}

/** Extrait le SQLSTATE PostgreSQL d'une erreur Prisma (forme variable selon versions). */
function extractPgCode(e: unknown): string | null {
  const meta = (e as { meta?: { code?: string } })?.meta;
  if (meta?.code) return meta.code;
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/code:\s*["']?(\d{5})["']?/);
  return m ? m[1] : null;
}

/**
 * Les messages class-validator ont la forme « <chemin> <règle> » (ex. « lat must be a number »).
 * On en tire une liste { field, message } exploitable par un formulaire.
 */
function toFieldErrors(messages: string[]): FieldError[] {
  return messages.map((raw) => {
    const [field, ...rest] = raw.split(' ');
    return rest.length ? { field, message: rest.join(' ') } : { field: '', message: raw };
  });
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const traceId = req.id ?? randomUUID();
    const problem = this.toProblem(exception);

    // Réponse déjà (en partie) envoyée : écrire à nouveau ferait tomber le process.
    if (res.headersSent) return;

    if (problem.status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} → ${problem.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(problem.status).type('application/problem+json').json({
      type: `https://api.eduloc.mg/errors/${problem.code.toLowerCase().replace(/_/g, '-')}`,
      title: problem.title,
      status: problem.status,
      code: problem.code,
      detail: problem.status >= 500
        ? ERROR_MESSAGES.INTERNAL_ERROR
        : problem.detail ?? ERROR_MESSAGES[problem.code],
      fields: problem.fields,
      errors: problem.errors,
      instance: req.originalUrl,
      traceId,
    });
  }

  private toProblem(e: unknown): Problem {
    if (e instanceof DomainError) {
      // Un DomainError dont le message est le code lui-même reçoit le message du catalogue.
      const detail = e.message === e.code ? ERROR_MESSAGES[e.code] ?? e.message : e.message;
      return { status: e.status, code: e.code, title: e.code, detail, fields: e.fields };
    }

    if (e instanceof HttpException) {
      const status = e.getStatus();
      const body = e.getResponse();
      const raw = typeof body === 'string' ? body : (body as { message?: unknown }).message;

      // new UnprocessableEntityException('OTP_INVALID') → code = OTP_INVALID (et non « HTTP_ERROR »).
      if (isErrorCode(raw)) {
        return { status, code: raw, title: e.name, detail: ERROR_MESSAGES[raw] };
      }
      if (Array.isArray(raw)) {
        const messages = raw.map(String);
        return {
          status,
          code: status === 400 ? 'VALIDATION_FAILED' : 'HTTP_ERROR',
          title: e.name,
          detail: ERROR_MESSAGES.VALIDATION_FAILED,
          errors: toFieldErrors(messages),
        };
      }
      const detail = typeof raw === 'string' ? raw : e.message;
      const code = status === 400 ? 'VALIDATION_FAILED'
        : status === 401 ? 'UNAUTHORIZED'
        : status === 403 ? 'FORBIDDEN'
        : status === 404 ? 'NOT_FOUND'
        : status === 429 ? 'RATE_LIMITED'
        : 'HTTP_ERROR';
      return { status, code, title: e.name, detail };
    }

    const known = e as { code?: string; meta?: { target?: string[] } };
    if (known?.code) {
      switch (known.code) {
        case 'P2002':
          return {
            status: 409, code: 'UNIQUE_VIOLATION', title: 'Conflit',
            detail: ERROR_MESSAGES.UNIQUE_VIOLATION, fields: known.meta?.target ?? [],
          };
        case 'P2025':
          return { status: 404, code: 'RESOURCE_NOT_FOUND', title: 'Introuvable', detail: ERROR_MESSAGES.RESOURCE_NOT_FOUND };
        case 'P2003':
          return { status: 409, code: 'FOREIGN_KEY_VIOLATION', title: 'Conflit', detail: ERROR_MESSAGES.FOREIGN_KEY_VIOLATION };
        case 'P2000':
          return { status: 400, code: 'VALUE_TOO_LONG', title: 'Donnée invalide', detail: ERROR_MESSAGES.VALUE_TOO_LONG };
        case 'P2034':
          return { status: 409, code: 'TRANSACTION_CONFLICT', title: 'Conflit', detail: ERROR_MESSAGES.TRANSACTION_CONFLICT };
        case 'P2024':
          return { status: 503, code: 'DATABASE_BUSY', title: 'Service indisponible', detail: ERROR_MESSAGES.DATABASE_BUSY };
      }
    }

    const pgCode = extractPgCode(e);
    if (pgCode === '23P01') {
      return { status: 409, code: 'SLOT_UNAVAILABLE', title: 'Créneau indisponible', detail: ERROR_MESSAGES.SLOT_UNAVAILABLE };
    }
    if (pgCode === '23514') {
      return { status: 422, code: 'CHECK_VIOLATION', title: 'Donnée refusée', detail: ERROR_MESSAGES.CHECK_VIOLATION };
    }

    return { status: 500, code: 'INTERNAL_ERROR', title: 'Erreur interne' };
  }
}
