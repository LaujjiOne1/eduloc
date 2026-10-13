import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { CursorQueryDto } from '../../common/pagination/cursor-pagination';
import { ConversationsService } from './conversations.service';
import { MessagesQueryDto } from './dto';

@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly service: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: CursorQueryDto) {
    return this.service.listMine(user.userId, q);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getOne(user.userId, id);
  }

  @Get(':id/messages')
  messages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: MessagesQueryDto,
  ) {
    return this.service.listMessages(user.userId, id, q);
  }

  @Post(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.markRead(user.userId, id);
  }
}
