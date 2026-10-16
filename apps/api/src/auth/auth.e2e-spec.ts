import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

vi.mock('./auth.service.js', () => ({
  AuthService: class AuthService {},
}));

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
describe('Auth HTTP validation (e2e)', () => {
  let app: INestApplication;

  const authServiceMock = {
    register: vi.fn(),
    login: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authServiceMock,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rechaza un registro con email inválido', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'no-es-un-email',
        password: 'password123',
      })
      .expect(400);

    expect(authServiceMock.register).not.toHaveBeenCalled();
  });

  it('rechaza propiedades no declaradas en el DTO', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
        isAdmin: true,
      })
      .expect(400);

    expect(authServiceMock.register).not.toHaveBeenCalled();
  });

  it('acepta un registro válido y delega en AuthService', async () => {
    authServiceMock.register.mockResolvedValueOnce({
      id: 'user-1',
      email: 'test@example.com',
    });

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
      })
      .expect(201);

    expect(authServiceMock.register).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });
});
