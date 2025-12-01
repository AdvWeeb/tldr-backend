import { Test, TestingModule } from '@nestjs/testing';
import { AuthProvider, User } from '../user/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let mockRegister: jest.Mock;
  let mockLogin: jest.Mock;
  let mockAuthenticateWithGoogle: jest.Mock;
  let mockRefreshToken: jest.Mock;
  let mockLogout: jest.Mock;

  const mockUser: User = {
    id: 1,
    email: 'test@example.com',
    password: null,
    firstName: 'Test',
    lastName: 'User',
    authProvider: AuthProvider.LOCAL,
    googleId: null,
    avatarUrl: null,
    isEmailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAuthResponse = {
    userId: 1,
    email: 'test@example.com',
    tokens: {
      accessToken: 'jwt-token',
      expiresIn: 900,
      tokenType: 'Bearer',
    },
    refreshToken: 'refresh-token-id',
  };

  beforeEach(async () => {
    mockRegister = jest.fn();
    mockLogin = jest.fn();
    mockAuthenticateWithGoogle = jest.fn();
    mockRefreshToken = jest.fn();
    mockLogout = jest.fn();

    const mockAuthService = {
      register: mockRegister,
      login: mockLogin,
      authenticateWithGoogle: mockAuthenticateWithGoogle,
      refreshToken: mockRefreshToken,
      logout: mockLogout,
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should register a new user', async () => {
      mockRegister.mockResolvedValue(mockAuthResponse);

      const result = await controller.register(
        {
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'Test',
          lastName: 'User',
        },
        'Mozilla/5.0',
        '127.0.0.1',
      );

      expect(result).toEqual(mockAuthResponse);
      expect(mockRegister).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should login user', async () => {
      mockLogin.mockResolvedValue(mockAuthResponse);

      const result = await controller.login(
        {
          email: 'test@example.com',
          password: 'Password123!',
        },
        'Mozilla/5.0',
        '127.0.0.1',
      );

      expect(result).toEqual(mockAuthResponse);
      expect(mockLogin).toHaveBeenCalled();
    });
  });

  describe('googleAuth', () => {
    it('should authenticate with Google', async () => {
      mockAuthenticateWithGoogle.mockResolvedValue(mockAuthResponse);

      const result = await controller.googleAuth(
        {
          code: 'google-auth-code',
          codeVerifier: 'code-verifier',
        },
        'Mozilla/5.0',
        '127.0.0.1',
      );

      expect(result).toEqual(mockAuthResponse);
      expect(mockAuthenticateWithGoogle).toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('should refresh access token', async () => {
      mockRefreshToken.mockResolvedValue(mockAuthResponse);

      const result = await controller.refreshToken(
        { refreshToken: 'refresh-token' },
        'Mozilla/5.0',
        '127.0.0.1',
      );

      expect(result).toEqual(mockAuthResponse);
      expect(mockRefreshToken).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should logout user', async () => {
      mockLogout.mockResolvedValue(undefined);

      await controller.logout(mockUser, { refreshToken: 'refresh-token' });

      expect(mockLogout).toHaveBeenCalledWith(
        mockUser.id,
        'refresh-token',
        false,
      );
    });
  });
});
