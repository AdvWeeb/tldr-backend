import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: number;

  @Column({ type: 'text' })
  tokenHash: string;

  @Column({ nullable: true, type: 'text' })
  encryptedGoogleRefreshToken: string | null;

  @Column({ type: 'timestamp with time zone' })
  expiresAt: Date;

  @Column({ nullable: true, type: 'text' })
  userAgent: string | null;

  @Column({ nullable: true, type: 'text' })
  ipAddress: string | null;

  @Column({ default: false })
  isRevoked: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
