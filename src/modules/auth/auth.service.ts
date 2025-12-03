import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { MailboxService } from '../mailbox/mailbox.service';
import { AuthProvider, User } from '../user/entities/user.entity';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto } from './dto/token-response.dto';
import {
  GoogleOAuthService,
  GoogleUserInfo,
} from './providers/google-oauth.service';
import { TokenService } from './providers/token.service';

const BCRYPT_SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly tokenService: TokenService,
    private readonly googleOAuthService: GoogleOAuthService,
    @Inject(forwardRef(() => MailboxService))
    private readonly mailboxService: MailboxService,
  ) {}

  async register(
    registerDto: RegisterDto,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthResponseDto> {
    const existingUser = await this.userRepository.findOne({
      where: { email: registerDto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(
      registerDto.password,
      BCRYPT_SALT_ROUNDS,
    );

    const user = this.userRepository.create({
      email: registerDto.email.toLowerCase(),
      password: hashedPassword,
      firstName: registerDto.firstName,
      lastName: registerDto.lastName,
      authProvider: AuthProvider.LOCAL,
      isEmailVerified: false,
    });

    await this.userRepository.save(user);

    this.logger.log(`User registered: ${user.email}`);

    const { accessToken, refreshTokenId } =
      await this.tokenService.generateTokens(user, undefined, metadata);

    return {
      userId: user.id,
      email: user.email,
      tokens: accessToken,
      refreshToken: refreshTokenId,
    };
  }

  async login(
    loginDto: LoginDto,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthResponseDto> {
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.authProvider !== AuthProvider.LOCAL || !user.password) {
      throw new UnauthorizedException(
        'This account uses a different login method',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log(`User logged in: ${user.email}`);

    const { accessToken, refreshTokenId } =
      await this.tokenService.generateTokens(user, undefined, metadata);

    return {
      userId: user.id,
      email: user.email,
      tokens: accessToken,
      refreshToken: refreshTokenId,
    };
  }

  async authenticateWithGoogle(
    googleAuthDto: GoogleAuthDto,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthResponseDto> {
    const googleTokens = await this.googleOAuthService.exchangeCodeForTokens(
      googleAuthDto.code,
      googleAuthDto.codeVerifier,
    );

    let userInfo: GoogleUserInfo;

    if (googleTokens.idToken) {
      userInfo = await this.googleOAuthService.verifyIdToken(
        googleTokens.idToken,
      );
    } else {
      userInfo = await this.googleOAuthService.getUserInfo(
        googleTokens.accessToken,
      );
    }

    let user = await this.userRepository.findOne({
      where: { googleId: userInfo.googleId },
    });

    if (!user) {
      const existingEmailUser = await this.userRepository.findOne({
        where: { email: userInfo.email.toLowerCase() },
      });

      if (existingEmailUser) {
        if (existingEmailUser.authProvider === AuthProvider.LOCAL) {
          existingEmailUser.googleId = userInfo.googleId;
          existingEmailUser.avatarUrl =
            userInfo.avatarUrl || existingEmailUser.avatarUrl;
          existingEmailUser.isEmailVerified = true;
          await this.userRepository.save(existingEmailUser);
          user = existingEmailUser;
          this.logger.log(
            `Linked Google account to existing user: ${user.email}`,
          );
        } else {
          throw new ConflictException(
            'Email already registered with a different provider',
          );
        }
      } else {
        user = this.userRepository.create({
          email: userInfo.email.toLowerCase(),
          firstName: userInfo.firstName,
          lastName: userInfo.lastName,
          googleId: userInfo.googleId,
          avatarUrl: userInfo.avatarUrl,
          authProvider: AuthProvider.GOOGLE,
          isEmailVerified: userInfo.isEmailVerified,
          password: null,
        });
        await this.userRepository.save(user);
        this.logger.log(`New user registered via Google: ${user.email}`);
      }
    } else {
      user.avatarUrl = userInfo.avatarUrl || user.avatarUrl;
      user.isEmailVerified = userInfo.isEmailVerified || user.isEmailVerified;
      await this.userRepository.save(user);
      this.logger.log(`User logged in via Google: ${user.email}`);
    }

    const { accessToken, refreshTokenId } =
      await this.tokenService.generateTokens(
        user,
        googleTokens.refreshToken || undefined,
        metadata,
      );

    // Auto-create mailbox with Gmail tokens (avoids OAuth code reuse)
    if (googleTokens.accessToken && googleTokens.refreshToken) {
      setImmediate(() => {
        void (async () => {
          try {
            const existingMailboxes = await this.mailboxService.findAllByUser(
              user.id,
            );
            const mailboxExists = existingMailboxes.some(
              (m) => m.email.toLowerCase() === userInfo.email.toLowerCase(),
            );

            if (!mailboxExists) {
              const { google } = await import('googleapis');
              const { OAuth2Client } = await import('google-auth-library');
              const oauth2Client = new OAuth2Client();
              oauth2Client.setCredentials({
                access_token: googleTokens.accessToken,
                refresh_token: googleTokens.refreshToken!,
              });

              const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
              const profile = await gmail.users.getProfile({ userId: 'me' });

              await this.mailboxService.createGmailMailboxFromTokens(
                user.id,
                userInfo.email,
                googleTokens.accessToken,
                googleTokens.refreshToken!,
                googleTokens.expiresIn,
                profile.data.historyId || null,
              );
              this.logger.log(`Auto-created mailbox for ${user.email}`);
            }
          } catch (error) {
            this.logger.error(
              `Failed to auto-create mailbox: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        })();
      });
    }

    return {
      userId: user.id,
      email: user.email,
      tokens: accessToken,
      refreshToken: refreshTokenId,
    };
  }

  async refreshToken(
    refreshTokenString: string,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthResponseDto> {
    const { accessToken, refreshTokenId } =
      await this.tokenService.refreshAccessToken(refreshTokenString, metadata);

    const payload = this.tokenService.verifyAccessToken(
      accessToken.accessToken,
    );

    return {
      userId: payload.sub,
      email: payload.email,
      tokens: accessToken,
      refreshToken: refreshTokenId,
    };
  }

  async logout(
    userId: number,
    refreshTokenString?: string,
    revokeAll = false,
  ): Promise<void> {
    if (refreshTokenString) {
      const googleRefreshToken =
        await this.tokenService.getGoogleRefreshToken(refreshTokenString);

      if (googleRefreshToken) {
        await this.googleOAuthService.revokeToken(googleRefreshToken);
      }
    }

    if (revokeAll) {
      await this.tokenService.revokeAllUserTokens(userId);
      this.logger.log(`All tokens revoked for user ${userId}`);
    } else if (refreshTokenString) {
      await this.tokenService.revokeRefreshToken(refreshTokenString);
      this.logger.log(`Token revoked for user ${userId}`);
    }
  }

  async validateUser(userId: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }
}
