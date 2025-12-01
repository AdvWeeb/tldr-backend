import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators';
import { User } from '../user/entities/user.entity';
import { AttachmentService } from './attachment.service';

@ApiTags('Attachments')
@ApiBearerAuth()
@Controller('attachments')
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Download an attachment' })
  @ApiParam({ name: 'id', type: Number })
  @ApiProduces('application/octet-stream')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Attachment file',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Attachment not found',
  })
  async download(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename, mimeType } =
      await this.attachmentService.download(user.id, id);

    const safeFilename = encodeURIComponent(filename).replace(/['()]/g, escape);

    response.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${safeFilename}`,
      'Content-Length': buffer.length,
      'Cache-Control': 'private, max-age=3600',
    });

    return new StreamableFile(buffer);
  }
}
