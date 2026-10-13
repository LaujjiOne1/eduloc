import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { BeneficiariesService } from './beneficiaries.service';
import { CreateBeneficiaryDto, EnsureSelfDto, UpdateBeneficiaryDto } from './dto';

@ApiTags('beneficiaries')
@ApiBearerAuth()
@Controller('beneficiaries')
export class BeneficiariesController {
  constructor(private readonly service: BeneficiariesService) {}

  @Get() list(@CurrentUser() u: AuthUser) { return this.service.list(u.userId); }
  /** « Pour moi » : bénéficiaire du compte, créé à la demande (aucune saisie). */
  @Post('self') self(@CurrentUser() u: AuthUser, @Body() dto: EnsureSelfDto) { return this.service.ensureSelf(u.userId, dto.educationLevelId); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.service.get(u.userId, id); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateBeneficiaryDto) { return this.service.create(u.userId, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBeneficiaryDto) { return this.service.update(u.userId, id, dto); }
  @Delete(':id') archive(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.service.archive(u.userId, id); }
}
