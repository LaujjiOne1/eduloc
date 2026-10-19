import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { CatalogService } from './catalog.service';
import { CreateSubjectDto, SuggestSubjectsQueryDto, TracksQueryDto } from './dto';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  @Public()
  @Get('subjects')
  subjects() {
    return this.service.subjects();
  }

  /** Autocomplétion filtrée selon le diplôme du tuteur (voir CatalogService.suggest). */
  @Get('subjects/suggest')
  @ApiBearerAuth()
  suggest(@CurrentUser() user: AuthUser, @Query() query: SuggestSubjectsQueryDto) {
    return this.service.suggest(user.userId, query);
  }

  @Post('subjects')
  @ApiBearerAuth()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSubjectDto) {
    return this.service.createSubject(user.userId, dto);
  }

  @Public()
  @Get('tracks')
  tracks(@Query() query: TracksQueryDto) {
    return this.service.tracks(query.kind, query.levelName);
  }

  @Public()
  @Get('education-levels')
  levels() {
    return this.service.levels();
  }
}
