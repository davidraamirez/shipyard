import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
}));

vi.mock('./auth.service.js', () => ({
  AuthService: class AuthService {
    register = mocks.register;
    login = mocks.login;
  },
}));

import { AuthController } from './auth.controller.js';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AuthController({
      register: mocks.register,
      login: mocks.login,
    } as any);
  });

  it('debe delegar el registro en AuthService', async () => {
    const body = {
      name: 'Bob',
      email: 'bob@example.com',
      password: 'Password123!',
    };
    const expected = {
      id: 'user-1',
      name: 'Bob',
      email: 'bob@example.com',
    };

    mocks.register.mockResolvedValue(expected);

    await expect(controller.register(body)).resolves.toEqual(expected);

    expect(mocks.register).toHaveBeenCalledWith(body);
    expect(mocks.register).toHaveBeenCalledOnce();
  });

  it('debe delegar el login en AuthService', async () => {
    const body = {
      email: 'bob@example.com',
      password: 'Password123!',
    };
    const expected = {
      access_token: 'fake-jwt-token',
    };

    mocks.login.mockResolvedValue(expected);

    await expect(controller.login(body)).resolves.toEqual(expected);

    expect(mocks.login).toHaveBeenCalledWith(body);
    expect(mocks.login).toHaveBeenCalledOnce();
  });

  it('debe propagar los errores del registro', async () => {
    const error = new Error('Error de registro');
    mocks.register.mockRejectedValue(error);

    await expect(
      controller.register({
        name: 'Bob',
        email: 'bob@example.com',
        password: 'Password123!',
      }),
    ).rejects.toBe(error);
  });

  it('debe propagar los errores del login', async () => {
    const error = new Error('Credenciales incorrectas');
    mocks.login.mockRejectedValue(error);

    await expect(
      controller.login({
        email: 'bob@example.com',
        password: 'Password123!',
      }),
    ).rejects.toBe(error);
  });
});