import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators';
import { User } from '../user/entities/user.entity';
import { ColumnDto, CreateColumnDto, UpdateColumnDto } from './dto';
import { KanbanService } from './kanban.service';

@ApiTags('Kanban Board')
@ApiBearerAuth()
@Controller('kanban')
export class KanbanController {
  constructor(private readonly kanbanService: KanbanService) {}

  @Get('columns')
  @ApiOperation({
    summary: 'Get all Kanban columns for the user',
    description:
      "Returns the user's custom board structure ordered by position",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of columns',
    type: [ColumnDto],
  })
  async getColumns(@CurrentUser() user: User): Promise<ColumnDto[]> {
    return this.kanbanService.findAllColumns(user.id);
  }

  @Post('columns')
  @ApiOperation({
    summary: 'Create a new Kanban column',
    description:
      'Adds a new column to the board with optional Gmail label mapping',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Column created successfully',
    type: ColumnDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Column with this title already exists',
  })
  async createColumn(
    @CurrentUser() user: User,
    @Body() createDto: CreateColumnDto,
  ): Promise<ColumnDto> {
    return this.kanbanService.createColumn(user.id, createDto);
  }

  @Patch('columns/:id')
  @ApiOperation({
    summary: 'Update a Kanban column',
    description:
      'Rename, reorder, or change the Gmail label mapping of a column',
  })
  @ApiParam({ name: 'id', description: 'Column ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Column updated successfully',
    type: ColumnDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Column not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Column with new title already exists',
  })
  async updateColumn(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateColumnDto,
  ): Promise<ColumnDto> {
    return this.kanbanService.updateColumn(user.id, id, updateDto);
  }

  @Delete('columns/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a Kanban column',
    description:
      'Removes a column from the board (cannot delete default columns)',
  })
  @ApiParam({ name: 'id', description: 'Column ID' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Column deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Column not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Cannot delete default columns',
  })
  async deleteColumn(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.kanbanService.deleteColumn(user.id, id);
  }

  @Post('columns/initialize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initialize default columns',
    description:
      'Creates default columns (Inbox, Important, Starred, Done) if not already initialized',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Default columns initialized',
  })
  async initializeColumns(
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    await this.kanbanService.initializeDefaultColumns(user.id);
    return { message: 'Default columns initialized' };
  }
}
