import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { hash, compare } from 'bcrypt';

const mocks = vi.hoisted(() => ({
  user: {
    create: vi.fn(),
    findUnique: vi.fn(),
  },
  signAsync: vi.fn(),
}));

vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;

  const prismaMock = { user: mocks.user };
  const jwtMock = { signAsync: mocks.signAsync };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService(prismaMock as any, jwtMock as any);
  });

  describe('register', () => {
    it('registers a user without returning the password', async () => {
      const user = {
        id: 'user-1',
        email: 'bob@example.com',
        name: 'Bob',
        createdAt: new Date(),
      };

      mocks.user.create.mockResolvedValue(user);

      const result = await service.register({
        email: 'bob@example.com',
        name: 'Bob',
        password: 'Password123!',
      });

      expect(result).toEqual(user);
      expect(mocks.user.create).toHaveBeenCalledOnce();

      const createArgs = mocks.user.create.mock.calls[0][0];
      expect(createArgs.data.email).toBe('bob@example.com');
      expect(createArgs.data.name).toBe('Bob');
      expect(createArgs.data.passwordHash).not.toBe('Password123!');
      expect(await compare('Password123!', createArgs.data.passwordHash))
        .toBe(true);

      expect(createArgs.select).toEqual({
        id: true,
        email: true,
        name: true,
        createdAt: true,
      });
    });

    it('turns a duplicate email into ConflictException', async () => {
      mocks.user.create.mockRejectedValue({
        code: 'P2002',
      });

      await expect(
        service.register({
          email: 'bob@example.com',
          name: 'Bob',
          password: 'Password123!',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('propagates unexpected Prisma errors', async () => {
      const error = new Error('Database unavailable');
      mocks.user.create.mockRejectedValue(error);

      await expect(
        service.register({
          email: 'bob@example.com',
          name: 'Bob',
          password: 'Password123!',
        }),
      ).rejects.toBe(error);
    });
  });

  describe('login', () => {
    it('returns a JWT for valid credentials', async () => {
      const passwordHash = await hash('Password123!', 4);

      mocks.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'bob@example.com',
        passwordHash,
      });
      mocks.signAsync.mockResolvedValue('fake-jwt-token');

      const result = await service.login({
        email: 'bob@example.com',
        password: 'Password123!',
      });

      expect(result).toEqual({
        access_token: 'fake-jwt-token',
      });
      expect(mocks.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'bob@example.com' },
      });
      expect(mocks.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'bob@example.com',
      });
    });

    it('rejects an unknown email', async () => {
      mocks.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'missing@example.com',
          password: 'Password123!',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(mocks.signAsync).not.toHaveBeenCalled();
    });

    it('rejects a wrong password', async () => {
      const passwordHash = await hash('CorrectPassword123!', 4);

      mocks.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'bob@example.com',
        passwordHash,
      });

      await expect(
        service.login({
          email: 'bob@example.com',
          password: 'WrongPassword123!',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(mocks.signAsync).not.toHaveBeenCalled();
    });
  });
});