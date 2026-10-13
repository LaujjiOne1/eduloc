import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  TutorApplicationInputDto, TutorDocumentRegistrationDto, TutorUploadRequestDto,
  TutorVideoRegistrationDto,
} from './tutor-applications.dto';
import { TutorApplicationsService } from './tutor-applications.service';

@ApiTags('tutor-applications')
@ApiBearerAuth()
@Controller('tutor-applications')
export class TutorApplicationsController {
  constructor(private readonly service: TutorApplicationsService) {}

  @Get('me')
  getMine(@CurrentUser() user: AuthUser) {
    return this.service.getMine(user.userId);
  }

  @Post()
  createDraft(@CurrentUser() user: AuthUser, @Body() input: TutorApplicationInputDto) {
    return this.service.createDraft(user.userId, input);
  }

  @Patch(':applicationId')
  updateDraft(
    @CurrentUser() user: AuthUser,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() input: TutorApplicationInputDto,
  ) {
    return this.service.updateDraft(user.userId, applicationId, input);
  }

  @Post(':applicationId/documents/uploads')
  requestDocumentUpload(
    @CurrentUser() user: AuthUser,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() input: TutorUploadRequestDto,
  ) {
    return this.service.requestDocumentUpload(user.userId, applicationId, input);
  }

  @Post(':applicationId/documents')
  registerDocument(
    @CurrentUser() user: AuthUser,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() input: TutorDocumentRegistrationDto,
  ) {
    return this.service.registerDocument(user.userId, applicationId, input);
  }

  @Post(':applicationId/video/uploads')
  requestVideoUpload(
    @CurrentUser() user: AuthUser,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() input: TutorUploadRequestDto,
  ) {
    return this.service.requestVideoUpload(user.userId, applicationId, input);
  }

  @Post(':applicationId/video')
  registerVideo(
    @CurrentUser() user: AuthUser,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() input: TutorVideoRegistrationDto,
  ) {
    return this.service.registerVideo(user.userId, applicationId, input.uploadId);
  }

  @Post(':applicationId/submit')
  submit(
    @CurrentUser() user: AuthUser,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.service.submit(user.userId, applicationId);
  }
}
