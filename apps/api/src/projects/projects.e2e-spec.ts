import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('./projects.service.js', () => ({
  ProjectsService: class ProjectsService {},
}));

import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';
import { JwtStrategy } from '../auth/strategies/jwt.strategy.js';

describe('Projects authentication (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const jwtSecret = 'test-secret-for-e2e-only';

  const projectsServiceMock = {
    findAll: vi.fn(),
    create: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: jwtSecret,
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [ProjectsController],
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === 'JWT_SECRET') return jwtSecret;
              throw new Error(`Unknown config: ${key}`);
            },
          },
        },
        {
          provide: ProjectsService,
          useValue: projectsServiceMock,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    jwtService = moduleRef.get(JwtService);

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

  it('returns 401 when no token is sent', async () => {
    await request(app.getHttpServer())
      .get('/projects')
      .expect(401);

    expect(projectsServiceMock.findAll).not.toHaveBeenCalled();
  });

  it('returns 401 when the token is invalid', async () => {
    await request(app.getHttpServer())
      .get('/projects')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    expect(projectsServiceMock.findAll).not.toHaveBeenCalled();
  });

  it('allows access with a valid JWT', async () => {
    const token = await jwtService.signAsync({
      sub: 'user-1',
      email: 'test@example.com',
    });

    projectsServiceMock.findAll.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .get('/projects')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(projectsServiceMock.findAll).toHaveBeenCalledWith('user-1');
  });

  it('returns 400 when the id is not a UUID', async () => {
    const token = await jwtService.signAsync({
      sub: 'user-1',
      email: 'test@example.com',
    });

    await request(app.getHttpServer())
      .get('/projects/not-a-uuid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(projectsServiceMock.findOne).not.toHaveBeenCalled();
  });
});
