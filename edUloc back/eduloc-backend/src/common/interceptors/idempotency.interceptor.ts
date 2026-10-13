import {
  CallHandler, ConflictException, ExecutionContext, Injectable, NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, defer, of } from 'rxjs';
import { finalize, switchMap, tap } from 'rxjs/operators';
import { RedisService } from '../../core/redis/redis.service';

const WINDOW_SECONDS = 24 * 3600;
const LOCK_SECONDS = 30;
const WAIT_STEP_MS = 250;
const WAIT_STEPS = 20; // 5 s au plus pour attendre la requête d'origine

type Resolution = { replay: { body: unknown } | null };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Idempotence des créations (UC-D05) : en-tête Idempotency-Key.
 * - Clé déjà vue : la réponse mémorisée (24 h) est renvoyée telle quelle, SANS réexécuter le use case.
 * - Deux requêtes simultanées avec la même clé : la seconde attend la première (verrou), jamais de doublon.
 * La réponse rejouée passe par le pipeline Nest normal : on n'écrit jamais à la main sur `res`
 * (l'ancienne version terminait l'observable sans valeur et faisait tomber le serveur).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly redis: RedisService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: { userId: string } }>();
    const key = req.headers['idempotency-key'];
    if (req.method !== 'POST' || typeof key !== 'string' || key.length < 8 || !req.user) {
      return next.handle();
    }

    const resultKey = `idem:${req.user.userId}:${key}`;
    const lockKey = `${resultKey}:lock`;

    return defer(() => this.resolve(resultKey, lockKey)).pipe(
      switchMap(({ replay }) => {
        if (replay) return of(replay.body);
        return next.handle().pipe(
          tap((body) => {
            void this.redis.set(resultKey, JSON.stringify({ body }), WINDOW_SECONDS);
          }),
          // Succès comme échec : le verrou est libéré (un échec doit pouvoir être rejoué).
          finalize(() => {
            void this.redis.del(lockKey);
          }),
        );
      }),
    );
  }

  private async resolve(resultKey: string, lockKey: string): Promise<Resolution> {
    const cached = await this.redis.get(resultKey);
    if (cached) return { replay: JSON.parse(cached) as { body: unknown } };

    if (await this.redis.setNx(lockKey, '1', LOCK_SECONDS)) return { replay: null };

    // Une requête identique est en cours : on attend son résultat.
    for (let i = 0; i < WAIT_STEPS; i += 1) {
      await sleep(WAIT_STEP_MS);
      const done = await this.redis.get(resultKey);
      if (done) return { replay: JSON.parse(done) as { body: unknown } };
    }
    throw new ConflictException('REQUEST_IN_PROGRESS');
  }
}
