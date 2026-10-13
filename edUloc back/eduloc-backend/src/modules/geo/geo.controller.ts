import { Controller, Get, Ip, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimitService } from '../../common/rate-limit.service';
import { GeoService } from './geo.service';

class GeocodeQueryDto {
  @IsString() @MinLength(2) @MaxLength(120) q!: string;
}

class ReverseQueryDto {
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng!: number;
}

@ApiTags('geo')
@Controller('geo')
export class GeoController {
  constructor(
    private readonly service: GeoService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /** Adresse / quartier saisi → coordonnées (recherche et lieux des tuteurs). Public : utilisé avant connexion. */
  @Public()
  @Get('geocode')
  async geocode(@Query() q: GeocodeQueryDto, @Ip() ip: string) {
    await this.rateLimit.consume(`rl:geo:${ip}`, 60, 60);
    return this.service.search(q.q);
  }

  /** Position GPS → libellé lisible (« Utiliser ma position »). */
  @Public()
  @Get('reverse')
  async reverse(@Query() q: ReverseQueryDto, @Ip() ip: string) {
    await this.rateLimit.consume(`rl:geo:${ip}`, 60, 60);
    return (await this.service.reverse(q.lat, q.lng)) ?? { label: 'Position actuelle', latitude: q.lat, longitude: q.lng };
  }
}
