import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { LessThan, Repository } from 'typeorm';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { User } from '../../user/entities/user.entity';
import { TokenResponseDto } from '../dto/token-response.dto';
import { RefreshToken } from '../entities/refresh-token.entity';

export interface JwtPayload {
  sub: number;
  email: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  tokenId: string;
  userId: number;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly encryptionUtil: EncryptionUtil;
  private readonly accessTokenTtl: number;
  private readonly refreshTokenTtl: number;

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const encryptionKey = this.configService.get<string>('encryption.key');
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY is not configured');
    }
    this.encryptionUtil = new EncryptionUtil(encryptionKey);
    this.accessTokenTtl = this.configService.get<number>(
      'jwt.accessTokenTtl',
      900,
    );
    this.refreshTokenTtl = this.configService.get<number>(
      'jwt.refreshTokenTtl',
      604800,
    );
  }

  async generateTokens(
    user: User,
    googleRefreshToken?: string,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<{ accessToken: TokenResponseDto; refreshTokenId: string }> {
    const accessToken = await this.generateAccessToken(user);
    const refreshTokenId = await this.createRefreshToken(
      user,
      googleRefreshToken,
      metadata,
    );

    return {
      accessToken,
      refreshTokenId,
    };
  }

  async generateAccessToken(user: User): Promise<TokenResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      expiresIn: this.accessTokenTtl,
      tokenType: 'Bearer',
    };
  }

  async createRefreshToken(
    user: User,
    googleRefreshToken?: string,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<string> {
    const tokenId = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(tokenId);

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + this.refreshTokenTtl);

    const refreshToken = this.refreshTokenRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt,
      userAgent: metadata?.userAgent || null,
      ipAddress: metadata?.ipAddress || null,
      encryptedGoogleRefreshToken: googleRefreshToken
        ? this.encryptionUtil.encrypt(googleRefreshToken)
        : null,
    });

    await this.refreshTokenRepository.save(refreshToken);

    this.logger.log(`Created refresh token for user ${user.id}`);

    return `${refreshToken.id}:${tokenId}`;
  }

  async refreshAccessToken(
    refreshTokenString: string,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<{ accessToken: TokenResponseDto; refreshTokenId: string }> {
    const [tokenUuid, tokenValue] = refreshTokenString.split(':');

    if (!tokenUuid || !tokenValue) {
      throw new UnauthorizedException('Invalid refresh token format');
    }

    const refreshToken = await this.refreshTokenRepository.findOne({
      where: { id: tokenUuid },
      relations: ['user'],
    });

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    if (refreshToken.isRevoked) {
      this.logger.warn(
        `Attempted to use revoked refresh token for user ${refreshToken.userId}`,
      );
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (new Date() > refreshToken.expiresAt) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const tokenHash = this.hashToken(tokenValue);
    if (tokenHash !== refreshToken.tokenHash) {
      await this.revokeAllUserTokens(refreshToken.userId);
      this.logger.warn(
        `Invalid token hash detected for user ${refreshToken.userId}, revoking all tokens`,
      );
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.refreshTokenRepository.update(refreshToken.id, {
      isRevoked: true,
    });

    const accessToken = await this.generateAccessToken(refreshToken.user);

    let googleRefreshToken: string | undefined;
    if (refreshToken.encryptedGoogleRefreshToken) {
      googleRefreshToken = this.encryptionUtil.decrypt(
        refreshToken.encryptedGoogleRefreshToken,
      );
    }

    const newRefreshTokenId = await this.createRefreshToken(
      refreshToken.user,
      googleRefreshToken,
      metadata,
    );

    this.logger.log(`Rotated refresh token for user ${refreshToken.userId}`);

    return {
      accessToken,
      refreshTokenId: newRefreshTokenId,
    };
  }

  async revokeRefreshToken(refreshTokenString: string): Promise<void> {
    const [tokenUuid] = refreshTokenString.split(':');

    if (!tokenUuid) {
      return;
    }

    await this.refreshTokenRepository.update(tokenUuid, { isRevoked: true });
    this.logger.log(`Revoked refresh token ${tokenUuid}`);
  }

  async revokeAllUserTokens(userId: number): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
    this.logger.log(`Revoked all refresh tokens for user ${userId}`);
  }

  async getGoogleRefreshToken(
    refreshTokenString: string,
  ): Promise<string | null> {
    const [tokenUuid] = refreshTokenString.split(':');

    if (!tokenUuid) {
      return null;
    }

    const refreshToken = await this.refreshTokenRepository.findOne({
      where: { id: tokenUuid },
    });

    if (!refreshToken?.encryptedGoogleRefreshToken) {
      return null;
    }

    return this.encryptionUtil.decrypt(
      refreshToken.encryptedGoogleRefreshToken,
    );
  }

  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.refreshTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected || 0;
  }

  verifyAccessToken(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
