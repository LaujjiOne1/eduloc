import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL requis'),
  DIRECT_URL: z.string().optional(),
  REDIS_URL: z.string().min(1, 'REDIS_URL requis').default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET >= 32 caractères'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  OTP_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'OTP_ENCRYPTION_KEY = 32 octets hex'),
  /** local : fichiers sur disque (développement uniquement) ; supabase : Supabase Storage. */
  STORAGE_DRIVER: z.enum(['local', 'supabase']).optional(),
  STORAGE_LOCAL_DIR: z.string().default('.storage'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_VOICE_BUCKET: z.string().default('voice-messages'),
  SUPABASE_DOCUMENTS_BUCKET: z.string().default('documents'),
  SUPABASE_TUTOR_DOCS_BUCKET: z.string().default('tutor-documents'),
  CENTRIFUGO_URL: z.string().url().default('http://localhost:8000'),
  /** URL WebSocket que le CLIENT utilise (par défaut dérivée de CENTRIFUGO_URL). Sur appareil réel : IP du LAN / domaine public. */
  CENTRIFUGO_PUBLIC_URL: z.string().optional(),
  CENTRIFUGO_API_KEY: z.string().min(1),
  CENTRIFUGO_TOKEN_SECRET: z.string().min(16),
  CENTRIFUGO_SUB_SECRET: z.string().min(16),
  LIVEKIT_URL: z.string().min(1),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional().default(''),
  EXPO_ACCESS_TOKEN: z.string().optional().default(''),
  RESEND_API_KEY: z.string().optional().default(''),
  MAIL_FROM: z.string().refine((value) => {
    const displayName = value.match(/^[^<>]+\s+<([^<>]+)>$/);
    return z.string().email().safeParse(displayName?.[1] ?? value).success;
  }, 'MAIL_FROM doit être une adresse e-mail ou un expéditeur au format Nom <email>.')
    .default('onboarding@resend.dev'),
  BOOKING_MIN_NOTICE_HOURS: z.coerce.number().default(2),
  CANCELLATION_FREE_NOTICE_HOURS: z.coerce.number().default(24),
  MEDIA_RETENTION_MONTHS: z.coerce.number().default(12),
  /** Ollama (embeddings du matching) : joignable uniquement depuis le réseau privé, jamais publié sur Internet. */
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  EMBEDDING_MODEL: z.string().min(1).default('hf.co/unsloth/embeddinggemma-2-GGUF:UD-Q4_K_XL'),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(768),
  /** Import de CV : OCR PaddleOCR (service docker/paddleocr) — absent, l'OCR retombe sur Tesseract. */
  PADDLEOCR_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  /** Modèle Ollama d'extraction structurée du CV (génération, distinct du modèle d'embeddings). */
  CV_EXTRACTION_MODEL: z.string().min(1).default('qwen2.5:3b'),
  CV_EXTRACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
  /** Poids du scoring du matching (spec §6.4) : valeurs initiales, à calibrer avec le jeu d'évaluation. */
  MATCHING_CORROBORATION_WEIGHT: z.coerce.number().min(0).default(0.02),
  MATCHING_CORROBORATION_WINDOW: z.coerce.number().min(0).default(0.1),
  MATCHING_SUBJECT_BONUS: z.coerce.number().min(0).default(0.03),
  MATCHING_RATING_BONUS: z.coerce.number().min(0).default(0.02),
  MATCHING_RATING_PRIOR_MEAN: z.coerce.number().min(0).max(5).default(3.5),
  MATCHING_RATING_PRIOR_WEIGHT: z.coerce.number().min(0).default(5),
  MATCHING_RELEVANCE_WINDOW: z.coerce.number().min(0).default(0.15),
});

@Injectable()
export class AppConfig {
  readonly nodeEnv: string;
  readonly port: number;
  readonly apiUrl: string;
  readonly corsOrigins: string[];
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly jwtSecret: string;
  readonly jwtExpiresIn: string;
  readonly otpEncryptionKey: Buffer;
  readonly storageDriver: 'local' | 'supabase';
  readonly storageLocalDir: string;
  readonly supabaseUrl: string;
  readonly supabaseServiceRoleKey: string;
  readonly voiceBucket: string;
  readonly documentsBucket: string;
  readonly tutorDocsBucket: string;
  readonly centrifugoUrl: string;
  readonly centrifugoPublicUrl: string;
  readonly centrifugoApiKey: string;
  readonly centrifugoTokenSecret: string;
  readonly centrifugoSubSecret: string;
  readonly livekitUrl: string;
  readonly livekitApiKey: string;
  readonly livekitApiSecret: string;
  readonly fcmServiceAccountJson: string;
  readonly expoAccessToken: string;
  readonly resendApiKey: string;
  readonly mailFrom: string;
  readonly bookingMinNoticeHours: number;
  readonly cancellationFreeNoticeHours: number;
  readonly mediaRetentionMonths: number;
  readonly ollamaUrl: string;
  readonly embeddingModel: string;
  readonly embeddingDim: number;
  readonly paddleOcrUrl: string | null;
  readonly cvExtractionModel: string;
  readonly cvExtractionTimeoutMs: number;
  readonly matchingScoring: {
    corroborationWeight: number; corroborationWindow: number; subjectBonus: number; ratingBonus: number;
    ratingPriorMean: number; ratingPriorWeight: number; relevanceWindow: number;
  };

  constructor() {
    const parsed = envSchema.parse(process.env);
    this.nodeEnv = parsed.NODE_ENV;
    this.port = parsed.PORT;
    this.apiUrl = parsed.API_URL;
    this.corsOrigins = parsed.CORS_ORIGINS.split(',').map((o) => o.trim());
    this.databaseUrl = parsed.DATABASE_URL;
    this.redisUrl = parsed.REDIS_URL;
    this.jwtSecret = parsed.JWT_SECRET;
    this.jwtExpiresIn = parsed.JWT_EXPIRES_IN;
    this.otpEncryptionKey = Buffer.from(parsed.OTP_ENCRYPTION_KEY, 'hex');
    // Sans projet Supabase réel (placeholder de .env.example), le développement bascule sur le disque local.
    const supabaseIsPlaceholder = /votre-projet/i.test(parsed.SUPABASE_URL)
      || parsed.SUPABASE_SERVICE_ROLE_KEY === 'service-role-key';
    this.storageDriver = parsed.STORAGE_DRIVER ?? (supabaseIsPlaceholder ? 'local' : 'supabase');
    if (this.storageDriver === 'local' && parsed.NODE_ENV === 'production') {
      throw new Error('STORAGE_DRIVER=local est interdit en production.');
    }
    this.storageLocalDir = parsed.STORAGE_LOCAL_DIR;
    this.supabaseUrl = parsed.SUPABASE_URL;
    this.supabaseServiceRoleKey = parsed.SUPABASE_SERVICE_ROLE_KEY;
    this.voiceBucket = parsed.SUPABASE_VOICE_BUCKET;
    this.documentsBucket = parsed.SUPABASE_DOCUMENTS_BUCKET;
    this.tutorDocsBucket = parsed.SUPABASE_TUTOR_DOCS_BUCKET;
    this.centrifugoUrl = parsed.CENTRIFUGO_URL;
    this.centrifugoPublicUrl = parsed.CENTRIFUGO_PUBLIC_URL
      ?? `${parsed.CENTRIFUGO_URL.replace(/^http/, 'ws').replace(/\/$/, '')}/connection/websocket`;
    this.centrifugoApiKey = parsed.CENTRIFUGO_API_KEY;
    this.centrifugoTokenSecret = parsed.CENTRIFUGO_TOKEN_SECRET;
    this.centrifugoSubSecret = parsed.CENTRIFUGO_SUB_SECRET;
    this.livekitUrl = parsed.LIVEKIT_URL;
    this.livekitApiKey = parsed.LIVEKIT_API_KEY;
    this.livekitApiSecret = parsed.LIVEKIT_API_SECRET;
    this.fcmServiceAccountJson = parsed.FCM_SERVICE_ACCOUNT_JSON;
    this.expoAccessToken = parsed.EXPO_ACCESS_TOKEN;
    this.resendApiKey = parsed.RESEND_API_KEY;
    this.mailFrom = parsed.MAIL_FROM;
    this.bookingMinNoticeHours = parsed.BOOKING_MIN_NOTICE_HOURS;
    this.cancellationFreeNoticeHours = parsed.CANCELLATION_FREE_NOTICE_HOURS;
    this.mediaRetentionMonths = parsed.MEDIA_RETENTION_MONTHS;
    this.ollamaUrl = parsed.OLLAMA_URL.replace(/\/$/, '');
    this.embeddingModel = parsed.EMBEDDING_MODEL;
    this.embeddingDim = parsed.EMBEDDING_DIM;
    this.paddleOcrUrl = parsed.PADDLEOCR_URL ? parsed.PADDLEOCR_URL.replace(/\/$/, '') : null;
    this.cvExtractionModel = parsed.CV_EXTRACTION_MODEL;
    this.cvExtractionTimeoutMs = parsed.CV_EXTRACTION_TIMEOUT_MS;
    this.matchingScoring = {
      corroborationWeight: parsed.MATCHING_CORROBORATION_WEIGHT,
      corroborationWindow: parsed.MATCHING_CORROBORATION_WINDOW,
      subjectBonus: parsed.MATCHING_SUBJECT_BONUS,
      ratingBonus: parsed.MATCHING_RATING_BONUS,
      ratingPriorMean: parsed.MATCHING_RATING_PRIOR_MEAN,
      ratingPriorWeight: parsed.MATCHING_RATING_PRIOR_WEIGHT,
      relevanceWindow: parsed.MATCHING_RELEVANCE_WINDOW,
    };
  }
}
