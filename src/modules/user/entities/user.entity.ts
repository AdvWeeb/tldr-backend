import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
}

@Entity('users')
export class User {
  @ApiProperty({
    description: 'User unique identifier',
    example: 1,
  })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @Column({ unique: true })
  @Index()
  email: string;

  @Exclude()
  @Column({ nullable: true, type: 'text' })
  password: string | null;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  @Column()
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  @Column()
  lastName: string;

  @ApiProperty({
    description: 'Authentication provider',
    example: AuthProvider.LOCAL,
    enum: AuthProvider,
  })
  @Column({
    type: 'enum',
    enum: AuthProvider,
    default: AuthProvider.LOCAL,
  })
  authProvider: AuthProvider;

  @ApiProperty({
    description: 'Google ID for OAuth users',
    example: '123456789',
    nullable: true,
  })
  @Column({ nullable: true, unique: true, type: 'text' })
  @Index()
  googleId: string | null;

  @ApiProperty({
    description: 'Profile picture URL',
    example: 'https://example.com/avatar.jpg',
    nullable: true,
  })
  @Column({ nullable: true, type: 'text' })
  avatarUrl: string | null;

  @ApiProperty({
    description: 'Whether the user email is verified',
    example: true,
  })
  @Column({ default: false })
  isEmailVerified: boolean;

  @ApiProperty({
    description: 'User creation timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({
    description: 'User last update timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
