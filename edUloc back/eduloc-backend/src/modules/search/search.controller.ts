import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsUUID, Matches, Max, Min, ValidateIf } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { SearchService } from './search.service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

class SearchQueryDto {
  @IsUUID() subjectId!: string;
  @IsOptional() @IsUUID() levelId?: string;

  /**
   * Coordonnées de la personne qui cherche. Obligatoires pour une recherche en présentiel ;
   * absentes, seule l'offre « en ligne » est renvoyée.
   */
  @ValidateIf((o: SearchQueryDto) => o.lat !== undefined || o.lng !== undefined)
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat?: number;
  @ValidateIf((o: SearchQueryDto) => o.lat !== undefined || o.lng !== undefined)
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng?: number;

  /** ONLINE : offres à distance ; IN_PERSON : présentiel autour de (lat, lng) ; BOTH/absent : les deux. */
  @IsOptional() @IsIn(['ONLINE', 'IN_PERSON', 'BOTH']) format?: 'ONLINE' | 'IN_PERSON' | 'BOTH';
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) @Max(100_000) radiusM = 10_000;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}

class SlotQueryDto {
  @IsUUID() offerId!: string;
  @Matches(ISO_DATE, { message: 'from doit être une date AAAA-MM-JJ' }) from!: string;
  @Matches(ISO_DATE, { message: 'to doit être une date AAAA-MM-JJ' }) to!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(15) @Max(480) duration = 60;
}

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Public()
  @Get('offers')
  offers(@Query() q: SearchQueryDto) {
    const format = q.format ?? 'BOTH';
    const hasCoordinates = q.lat !== undefined && q.lng !== undefined;
    if (format === 'IN_PERSON' && !hasCoordinates) {
      throw new BadRequestException(['lat est requis pour une recherche en présentiel']);
    }
    return this.service.searchOffers({
      subjectId: q.subjectId,
      levelId: q.levelId,
      lat: hasCoordinates ? q.lat! : null,
      lng: hasCoordinates ? q.lng! : null,
      format,
      radiusM: q.radiusM,
      limit: q.limit,
    });
  }

  @Public()
  @Get('offers/:id')
  offer(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.offerPublic(id);
  }

  @Public()
  @Get('tutors/:id')
  tutor(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.tutorPublic(id);
  }

  @Public()
  @Get('tutors/:id/slots')
  slots(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: SlotQueryDto,
  ) {
    const from = Date.parse(`${query.from}T00:00:00.000Z`);
    const to = Date.parse(`${query.to}T00:00:00.000Z`);
    if (Number.isNaN(from) || Number.isNaN(to) || to < from || to - from > 30 * 86_400_000) {
      throw new BadRequestException(['to doit suivre from, avec au plus 31 jours']);
    }
    return this.service.daySlots(id, query.offerId, query.from, query.to, query.duration);
  }
}
