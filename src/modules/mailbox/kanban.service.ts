import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ColumnConfig } from './entities';
import { ColumnDto, CreateColumnDto, UpdateColumnDto } from './dto';

@Injectable()
export class KanbanService {
  private readonly logger = new Logger(KanbanService.name);

  constructor(
    @InjectRepository(ColumnConfig)
    private readonly columnConfigRepository: Repository<ColumnConfig>,
  ) {}

  /**
   * Get all columns for a user, ordered by orderIndex
   */
  async findAllColumns(userId: number): Promise<ColumnDto[]> {
    const columns = await this.columnConfigRepository.find({
      where: { userId },
      order: { orderIndex: 'ASC' },
    });

    return columns.map((col) => this.toColumnDto(col));
  }

  /**
   * Find a specific column by ID
   */
  async findColumnById(
    userId: number,
    columnId: number,
  ): Promise<ColumnConfig> {
    const column = await this.columnConfigRepository.findOne({
      where: { id: columnId, userId },
    });

    if (!column) {
      throw new NotFoundException(`Column with ID ${columnId} not found`);
    }

    return column;
  }

  /**
   * Create a new column
   */
  async createColumn(
    userId: number,
    createDto: CreateColumnDto,
  ): Promise<ColumnDto> {
    // Check if column with same title exists for this user
    const existing = await this.columnConfigRepository.findOne({
      where: { userId, title: createDto.title },
    });

    if (existing) {
      throw new ConflictException(
        `Column with title "${createDto.title}" already exists`,
      );
    }

    // If orderIndex not provided, append to end
    let orderIndex = createDto.orderIndex;
    if (orderIndex === undefined) {
      interface MaxOrderResult {
        max: number;
      }
      const maxOrder = await this.columnConfigRepository
        .createQueryBuilder('col')
        .where('col.userId = :userId', { userId })
        .select('MAX(col.orderIndex)', 'max')
        .getRawOne<MaxOrderResult>();
      orderIndex = (maxOrder?.max ?? -1) + 1;
    }

    const column = this.columnConfigRepository.create({
      userId,
      title: createDto.title,
      orderIndex,
      gmailLabelId: createDto.gmailLabelId || null,
      color: createDto.color || '#6B7280',
      isDefault: false,
    });

    const saved = await this.columnConfigRepository.save(column);
    this.logger.log(`Created column "${saved.title}" for user ${userId}`);

    return this.toColumnDto(saved);
  }

  /**
   * Update an existing column
   */
  async updateColumn(
    userId: number,
    columnId: number,
    updateDto: UpdateColumnDto,
  ): Promise<ColumnDto> {
    const column = await this.findColumnById(userId, columnId);

    // Check if renaming to existing title
    if (updateDto.title && updateDto.title !== column.title) {
      const existing = await this.columnConfigRepository.findOne({
        where: { userId, title: updateDto.title },
      });

      if (existing) {
        throw new ConflictException(
          `Column with title "${updateDto.title}" already exists`,
        );
      }
    }

    // Handle reordering
    if (
      updateDto.orderIndex !== undefined &&
      updateDto.orderIndex !== column.orderIndex
    ) {
      await this.reorderColumns(
        userId,
        column.orderIndex,
        updateDto.orderIndex,
      );
    }

    // Update fields
    if (updateDto.title !== undefined) column.title = updateDto.title;
    if (updateDto.orderIndex !== undefined)
      column.orderIndex = updateDto.orderIndex;
    if (updateDto.gmailLabelId !== undefined)
      column.gmailLabelId = updateDto.gmailLabelId;
    if (updateDto.color !== undefined) column.color = updateDto.color;

    const updated = await this.columnConfigRepository.save(column);
    this.logger.log(`Updated column ${columnId} for user ${userId}`);

    return this.toColumnDto(updated);
  }

  /**
   * Delete a column
   */
  async deleteColumn(userId: number, columnId: number): Promise<void> {
    const column = await this.findColumnById(userId, columnId);

    if (column.isDefault) {
      throw new ConflictException('Cannot delete default columns');
    }

    await this.columnConfigRepository.remove(column);

    // Reorder remaining columns
    const remaining = await this.columnConfigRepository.find({
      where: { userId },
      order: { orderIndex: 'ASC' },
    });

    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].orderIndex !== i) {
        remaining[i].orderIndex = i;
      }
    }

    await this.columnConfigRepository.save(remaining);
    this.logger.log(`Deleted column ${columnId} for user ${userId}`);
  }

  /**
   * Initialize default columns for a new user
   */
  async initializeDefaultColumns(userId: number): Promise<void> {
    const existing = await this.columnConfigRepository.count({
      where: { userId },
    });
    if (existing > 0) {
      return; // Already initialized
    }

    const defaultColumns = [
      {
        userId,
        title: 'Inbox',
        orderIndex: 0,
        gmailLabelId: 'INBOX',
        color: '#3B82F6',
        isDefault: true,
      },
      {
        userId,
        title: 'Important',
        orderIndex: 1,
        gmailLabelId: 'IMPORTANT',
        color: '#EF4444',
        isDefault: true,
      },
      {
        userId,
        title: 'Starred',
        orderIndex: 2,
        gmailLabelId: 'STARRED',
        color: '#F59E0B',
        isDefault: true,
      },
      {
        userId,
        title: 'To Do',
        orderIndex: 3,
        gmailLabelId: null,
        color: '#8B5CF6',
        isDefault: false,
      },
      {
        userId,
        title: 'In Progress',
        orderIndex: 4,
        gmailLabelId: null,
        color: '#06B6D4',
        isDefault: false,
      },
      {
        userId,
        title: 'Done',
        orderIndex: 5,
        gmailLabelId: null,
        color: '#10B981',
        isDefault: false,
      },
    ];

    await this.columnConfigRepository.save(defaultColumns);
    this.logger.log(`Initialized default columns for user ${userId}`);
  }

  /**
   * Reorder columns when moving one column
   */
  private async reorderColumns(
    userId: number,
    oldIndex: number,
    newIndex: number,
  ): Promise<void> {
    if (oldIndex === newIndex) return;

    const columns = await this.columnConfigRepository.find({
      where: { userId },
      order: { orderIndex: 'ASC' },
    });

    // Moving forward (right)
    if (newIndex > oldIndex) {
      for (const col of columns) {
        if (col.orderIndex > oldIndex && col.orderIndex <= newIndex) {
          col.orderIndex--;
        }
      }
    }
    // Moving backward (left)
    else {
      for (const col of columns) {
        if (col.orderIndex >= newIndex && col.orderIndex < oldIndex) {
          col.orderIndex++;
        }
      }
    }

    await this.columnConfigRepository.save(columns);
  }

  /**
   * Convert entity to DTO
   */
  private toColumnDto(column: ColumnConfig): ColumnDto {
    return {
      id: column.id,
      title: column.title,
      orderIndex: column.orderIndex,
      gmailLabelId: column.gmailLabelId,
      color: column.color,
      isDefault: column.isDefault,
      createdAt: column.createdAt,
      updatedAt: column.updatedAt,
    };
  }
}
