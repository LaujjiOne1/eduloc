import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { MatchingSearchDto } from './search/matching-search.dto';
import { MatchingSearchService } from './search/matching-search.service';

@ApiTags('matching')
@ApiBearerAuth()
@Controller('matching')
export class MatchingController {
  constructor(private readonly service: MatchingSearchService) {}

  /**
   * Tuteurs admissibles les plus pertinents pour le besoin d'un bénéficiaire. Niveau universitaire : présélection
   * SQL → tri sémantique → disponibilités ; sinon recherche classique. 503 MATCHING_UNAVAILABLE si Ollama est arrêté.
   * 30 requêtes / minute / utilisateur (chaque appel déclenche un embedding).
   */
  @Post('search')
  @HttpCode(200)
  search(@CurrentUser() user: AuthUser, @Body() dto: MatchingSearchDto) {
    return this.service.search(user.userId, dto);
  }
}
