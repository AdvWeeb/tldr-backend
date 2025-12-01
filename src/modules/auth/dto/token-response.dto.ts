import { ApiProperty } from '@nestjs/swagger';

export class TokenResponseDto {
  @ApiProperty({
    description: 'JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Access token expiration time in seconds',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Token type',
    example: 'Bearer',
  })
  tokenType: string;
}

export class AuthResponseDto {
  @ApiProperty({
    description: 'User ID',
    example: 1,
  })
  userId: number;

  @ApiProperty({
    description: 'User email',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Token information',
    type: TokenResponseDto,
  })
  tokens: TokenResponseDto;

  @ApiProperty({
    description:
      'Refresh token identifier (store securely, use for token refresh)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890:abc123...',
  })
  refreshToken: string;
}
