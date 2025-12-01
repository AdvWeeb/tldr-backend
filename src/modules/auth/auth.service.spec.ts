import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AuthProvider, User } from '../user/entities/user.entity';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './providers/google-oauth.service';
import { TokenService } from './providers/token.service';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: jest.Mocked<Repository<User>>;
  let tokenService: jest.Mocked<TokenService>;

  const mockUser: User = {
    id: 1,
    email: 'test@example.com',
    password: '$2b$12$hashedpassword',
    firstName: 'Test',
    lastName: 'User',
    authProvider: AuthProvider.LOCAL,
    googleId: null,
    avatarUrl: null,
    isEmailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTokenResponse = {
    accessToken: {
      accessToken: 'jwt-token',
      expiresIn: 900,
      tokenType: 'Bearer',
    },
    refreshTokenId: 'refresh-token-id',
  };

  beforeEach(async () => {
    const mockUserRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockTokenService = {
      generateTokens: jest.fn(),
      refreshAccessToken: jest.fn(),
      revokeRefreshToken: jest.fn(),
      revokeAllUserTokens: jest.fn(),
      getGoogleRefreshToken: jest.fn(),
      verifyAccessToken: jest.fn(),
    };

    const mockGoogleOAuthService = {
      exchangeCodeForTokens: jest.fn(),
      verifyIdToken: jest.fn(),
      getUserInfo: jest.fn(),
      revokeToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: TokenService,
          useValue: mockTokenService,
        },
        {
          provide: GoogleOAuthService,
          useValue: mockGoogleOAuthService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get(getRepositoryToken(User));
    tokenService = module.get(TokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      userRepository.findOne.mockResolvedValue(null);
      userRepository.create.mockReturnValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);
      tokenService.generateTokens.mockResolvedValue(mockTokenResponse);

      const result = await service.register({
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      });

      expect(result.userId).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
      expect(result.tokens.accessToken).toBeDefined();
    });

    it('should throw ConflictException if email already exists', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'Test',
          lastName: 'User',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should login user with valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('Password123!', 12);
      const userWithPassword = { ...mockUser, password: hashedPassword };

      userRepository.findOne.mockResolvedValue(userWithPassword);
      tokenService.generateTokens.mockResolvedValue(mockTokenResponse);

      const result = await service.login({
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(result.userId).toBe(mockUser.id);
      expect(result.tokens.accessToken).toBeDefined();
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'WrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should revoke refresh token on logout', async () => {
      tokenService.getGoogleRefreshToken.mockResolvedValue(null);

      await service.logout(1, 'refresh-token');

      expect(tokenService.revokeRefreshToken.mock.calls[0]).toEqual([
        'refresh-token',
      ]);
    });

    it('should revoke all tokens when revokeAll is true', async () => {
      tokenService.getGoogleRefreshToken.mockResolvedValue(null);

      await service.logout(1, 'refresh-token', true);

      expect(tokenService.revokeAllUserTokens.mock.calls[0]).toEqual([1]);
    });
  });
});
