import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { CvImportService } from './cv-import.service';

class CvUploadRequestDto {
  @IsString() @MaxLength(100) mimeType!: string;
  @Type(() => Number) @IsInt() @Min(1) sizeBytes!: number;
  @IsOptional() @IsString() @MaxLength(255) fileName?: string;
}

class CvImportCreateDto {
  @IsUUID() uploadId!: string;
}

/** Pré-remplissage du dossier tuteur à partir d'un CV (PDF, Word, photo ou scan). */
@ApiTags('cv-imports')
@ApiBearerAuth()
@Controller('cv-imports')
export class CvImportController {
  constructor(private readonly service: CvImportService) {}

  @Post('uploads')
  requestUpload(@CurrentUser() user: AuthUser, @Body() input: CvUploadRequestDto) {
    return this.service.requestUpload(user.userId, input);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() input: CvImportCreateDto) {
    return this.service.create(user.userId, input.uploadId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(user.userId, id);
  }
}
