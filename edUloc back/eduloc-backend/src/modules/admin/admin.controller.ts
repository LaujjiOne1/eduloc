import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { AcademicLevelService } from './academic-level.service';
import { AdminDirectoryService } from './admin-directory.service';
import { AdminService } from './admin.service';
import { DegreeEquivalencesService } from './degree-equivalences.service';
import {
  AdminBookingsQueryDto, AdminOffersQueryDto, ApplyDegreeEquivalenceDto, ApproveApplicationDto, CreateDegreeEquivalenceDto, DegreeDecisionDto,
  DegreeEquivalencesQueryDto, DegreeLookupQueryDto, ModerateOfferDto, RejectApplicationDto,
  ResolveConflictDto, ReviewDocumentDto, SetAcademicLevelDto, SetUserStatusDto, SuspendTutorDto, UsersQueryDto,
} from './dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly directory: AdminDirectoryService,
    private readonly equivalences: DegreeEquivalencesService,
    private readonly academicLevels: AcademicLevelService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.service.dashboard();
  }

  @Get('users')
  users(@Query() q: UsersQueryDto) {
    return this.service.users(q);
  }

  @Post('users/:id/status')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetUserStatusDto) {
    return this.service.setUserStatus(id, dto.status);
  }

  @Get('tutor-applications')
  applications(@Query('status') status?: string) {
    return this.service.tutorApplications(status);
  }

  @Post('tutor-applications/:id/approve')
  approve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveApplicationDto) {
    return this.service.approveApplication(u.userId, id, dto);
  }

  /** Réindexation sémantique de tous les tuteurs approuvés (tâche de fond). */
  @Post('matching/reindex')
  reindexAll() {
    return this.service.requestReindex();
  }

  @Post('tutors/:id/reindex')
  reindexOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.requestReindex(id);
  }

  /** Revue d'un justificatif : approuver un diplôme, un relevé, un certificat ou une preuve = attester de son authenticité. */
  @Post('tutor-documents/:id/review')
  reviewDocument(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDocumentDto) {
    return this.service.reviewDocument(id, dto);
  }

  /** Lien de lecture (10 min) d'un justificatif : l'admin l'ouvre avant d'attester de son authenticité. */
  @Get('tutor-documents/:id/url')
  documentUrl(@Param('id', ParseUUIDPipe) id: string) {
    return this.directory.documentUrl(id);
  }

  /** Applique au dossier une équivalence de diplôme VALIDATED (diplôme OTHER) ; elle alimente le niveau académique. */
  @Post('tutor-applications/:id/degree-equivalence')
  applyEquivalence(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyDegreeEquivalenceDto,
  ) {
    return this.equivalences.applyToApplication(u.userId, id, dto.degreeEquivalenceId);
  }

  /** Fixe (ou corrige) le niveau académique validé d'un tuteur, y compris déjà approuvé. */
  @Put('tutors/:id/academic-level')
  setAcademicLevel(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAcademicLevelDto,
  ) {
    return this.academicLevels.set(u.userId, id, dto.academicLevelId, dto.note);
  }

  @Delete('tutors/:id/academic-level')
  revokeAcademicLevel(@Param('id', ParseUUIDPipe) id: string) {
    return this.academicLevels.revoke(id);
  }

  @Get('degree-equivalences')
  degreeEquivalences(@Query() q: DegreeEquivalencesQueryDto) {
    return this.equivalences.list(q);
  }

  /** Recherche l'équivalence d'un diplôme déclaré (intitulé, pays, spécialité) : `{ equivalence: null }` si absente. */
  @Get('degree-equivalences/lookup')
  lookupEquivalence(@Query() q: DegreeLookupQueryDto) {
    return this.equivalences.lookup(q).then((equivalence) => ({ equivalence }));
  }

  @Post('degree-equivalences')
  createEquivalence(@CurrentUser() u: AuthUser, @Body() dto: CreateDegreeEquivalenceDto) {
    return this.equivalences.create(u.userId, dto);
  }

  @Patch('degree-equivalences/:id')
  decideEquivalence(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DegreeDecisionDto,
  ) {
    return this.equivalences.decide(u.userId, id, dto);
  }

  @Post('tutor-applications/:id/reject')
  reject(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectApplicationDto) {
    return this.service.rejectApplication(u.userId, id, dto.reason);
  }

  @Post('tutors/:id/suspend')
  suspend(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SuspendTutorDto) {
    return this.service.suspendTutor(u.userId, id, dto.reason);
  }

  /** Lève la suspension d'un tuteur (le dossier doit être approuvé). */
  @Post('tutors/:id/reinstate')
  reinstate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SuspendTutorDto) {
    return this.service.reinstateTutor(u.userId, id, dto.reason);
  }

  @Post('offers/:id/moderation')
  moderate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerateOfferDto) {
    return this.service.moderateOffer(id, dto.action);
  }

  @Get('bookings')
  bookings(@Query() q: AdminBookingsQueryDto) {
    return this.directory.bookings(q);
  }

  @Get('offers')
  offers(@Query() q: AdminOffersQueryDto) {
    return this.directory.offers(q);
  }

  @Get('conflicts')
  conflicts(@Query('status') status?: string) {
    return this.service.conflicts(status);
  }

  @Post('conflicts/:id/resolve')
  resolve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveConflictDto) {
    return this.service.resolveConflict(u.userId, id, dto.resolution);
  }

  @Post('conflicts/:id/dismiss')
  dismiss(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.dismissConflict(u.userId, id);
  }
}
