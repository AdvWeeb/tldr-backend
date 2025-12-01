import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  expiresIn: number;
}

export interface GoogleUserInfo {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  isEmailVerified: boolean;
}

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private readonly oauth2Client: OAuth2Client;

  constructor(private readonly configService: ConfigService) {
    this.oauth2Client = new OAuth2Client({
      clientId: this.configService.get<string>('googleOAuth.clientId'),
      clientSecret: this.configService.get<string>('googleOAuth.clientSecret'),
      redirectUri: this.configService.get<string>('googleOAuth.redirectUri'),
    });
  }

  async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
  ): Promise<GoogleTokens> {
    try {
      const { tokens } = await this.oauth2Client.getToken({
        code,
        codeVerifier,
      });

      if (!tokens.access_token) {
        throw new UnauthorizedException('Failed to obtain access token');
      }

      this.logger.log('Successfully exchanged authorization code for tokens');

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        idToken: tokens.id_token || null,
        expiresIn: tokens.expiry_date
          ? Math.floor((tokens.expiry_date - Date.now()) / 1000)
          : 3600,
      };
    } catch (error) {
      this.logger.error('Failed to exchange authorization code', error);
      throw new UnauthorizedException('Invalid authorization code');
    }
  }

  async verifyIdToken(idToken: string): Promise<GoogleUserInfo> {
    try {
      const ticket = await this.oauth2Client.verifyIdToken({
        idToken,
        audience: this.configService.get<string>('googleOAuth.clientId'),
      });

      const payload: TokenPayload | undefined = ticket.getPayload();

      if (!payload) {
        throw new UnauthorizedException('Invalid ID token payload');
      }

      if (!payload.sub || !payload.email) {
        throw new UnauthorizedException('Missing required user information');
      }

      return {
        googleId: payload.sub,
        email: payload.email,
        firstName: payload.given_name || '',
        lastName: payload.family_name || '',
        avatarUrl: payload.picture || null,
        isEmailVerified: payload.email_verified || false,
      };
    } catch (error) {
      this.logger.error('Failed to verify ID token', error);
      throw new UnauthorizedException('Invalid ID token');
    }
  }

  async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    try {
      this.oauth2Client.setCredentials({ access_token: accessToken });

      const response = await this.oauth2Client.request<{
        sub: string;
        email: string;
        given_name?: string;
        family_name?: string;
        picture?: string;
        email_verified?: boolean;
      }>({
        url: 'https://www.googleapis.com/oauth2/v3/userinfo',
      });

      const data = response.data;

      return {
        googleId: data.sub,
        email: data.email,
        firstName: data.given_name || '',
        lastName: data.family_name || '',
        avatarUrl: data.picture || null,
        isEmailVerified: data.email_verified || false,
      };
    } catch (error) {
      this.logger.error('Failed to fetch user info', error);
      throw new UnauthorizedException('Failed to fetch user information');
    }
  }

  async revokeToken(token: string): Promise<void> {
    try {
      await this.oauth2Client.revokeToken(token);
      this.logger.log('Successfully revoked Google token');
    } catch (error) {
      this.logger.warn('Failed to revoke Google token', error);
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    try {
      this.oauth2Client.setCredentials({ refresh_token: refreshToken });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new UnauthorizedException('Failed to refresh access token');
      }

      return {
        accessToken: credentials.access_token,
        expiresIn: credentials.expiry_date
          ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
          : 3600,
      };
    } catch (error) {
      this.logger.error('Failed to refresh Google access token', error);
      throw new UnauthorizedException('Failed to refresh Google access token');
    }
  }
}
