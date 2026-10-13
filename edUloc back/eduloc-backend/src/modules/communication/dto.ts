import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { CursorQueryDto } from '../../common/pagination/cursor-pagination';

/** Pagination des messages + filtre optionnel par type (écran « Documents » = DOCUMENT). */
export class MessagesQueryDto extends CursorQueryDto {
  @IsOptional() @IsIn(['VOICE', 'DOCUMENT', 'SYSTEM', 'CALL_EVENT'])
  type?: 'VOICE' | 'DOCUMENT' | 'SYSTEM' | 'CALL_EVENT';
}

export const VOICE_MIME = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg'] as const;
export const DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;

/** Variantes de type audio envoyées par certains appareils (iOS / Android) pour un enregistrement .m4a. */
const AUDIO_ALIASES: Record<string, string> = {
  'audio/m4a': 'audio/mp4', 'audio/x-m4a': 'audio/mp4', 'audio/mp4a-latm': 'audio/mp4', 'audio/aac': 'audio/mp4',
  'audio/x-aac': 'audio/mp4', 'audio/mp3': 'audio/mpeg', 'audio/opus': 'audio/ogg',
};

export class RequestUploadDto {
  @IsIn(['VOICE', 'DOCUMENT']) kind!: 'VOICE' | 'DOCUMENT';
  @Transform(({ value, obj }: { value: unknown; obj: { kind?: string } }) => {
    if (obj.kind !== 'VOICE' || typeof value !== 'string') return value;
    const bare = value.split(';')[0].trim().toLowerCase();
    return AUDIO_ALIASES[bare] ?? bare;
  })
  @IsString() @MaxLength(100) mimeType!: string;
  @IsInt() @Min(1) @Max(20 * 1024 * 1024) sizeBytes!: number;
  @ValidateIf((o: RequestUploadDto) => o.kind === 'VOICE')
  @IsInt() @Min(500) @Max(300_000) durationMs?: number;
  @IsOptional() @IsString() @MaxLength(255) fileName?: string;
}

export class SendMessageDto {
  @IsUUID() clientMessageId!: string;
  @IsIn(['VOICE', 'DOCUMENT']) type!: 'VOICE' | 'DOCUMENT';
  @IsUUID() uploadId!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(128)
  @IsNumber({}, { each: true }) @Min(0, { each: true }) @Max(1, { each: true })
  waveform?: number[];
  @IsOptional() @IsUUID() replyToId?: string;
}

export class CreateCallDto {
  @IsUUID() conversationId!: string;
  @IsIn(['AUDIO', 'VIDEO']) type!: 'AUDIO' | 'VIDEO';
}
