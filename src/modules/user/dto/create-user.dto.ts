import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AuthProvider } from '../entities/user.entity';

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({
    description: 'User password (required for local auth)',
    example: 'SecurePassword123!',
  })
  @IsString()
  @IsOptional()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional({
    description: 'Authentication provider',
    enum: AuthProvider,
    default: AuthProvider.LOCAL,
  })
  @IsEnum(AuthProvider)
  @IsOptional()
  authProvider?: AuthProvider;

  @ApiPropertyOptional({
    description: 'Google ID for OAuth users',
    example: '123456789',
  })
  @IsString()
  @IsOptional()
  googleId?: string;

  @ApiPropertyOptional({
    description: 'Profile picture URL',
    example: 'https://example.com/avatar.jpg',
  })
  @IsString()
  @IsOptional()
  avatarUrl?: string;
}
