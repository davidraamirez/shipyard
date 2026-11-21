import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';

import { LoginDto } from './auth/dto/login.dto.js';
import { RegisterDto } from './auth/dto/register.dto.js';
import { CreateProjectDto } from './projects/dto/create-project.dto.js';
import { UpdateProjectDto } from './projects/dto/update-project.dto.js';
import { CreateDeploymentDto } from './deployments/dto/create-deployment.dto.js';
import { FindLogsQueryDto } from './deployments/dto/find-logs-query.dto.js';

describe('DTO validation', () => {
  it('rejects an invalid email in LoginDto', async () => {
    const dto = Object.assign(new LoginDto(), {
      email: 'not-an-email',
      password: 'password123',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'email')).toBe(true);
  });

  it('rejects a too-short password in RegisterDto', async () => {
    const dto = Object.assign(new RegisterDto(), {
      email: 'test@example.com',
      password: '123',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });

  it('accepts a valid registration without a name', async () => {
    const dto = Object.assign(new RegisterDto(), {
      email: 'test@example.com',
      password: 'password123',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a too-long name in RegisterDto', async () => {
    const dto = Object.assign(new RegisterDto(), {
      email: 'test@example.com',
      password: 'password123',
      name: 'a'.repeat(101),
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('rejects an empty name in CreateProjectDto', async () => {
    const dto = Object.assign(new CreateProjectDto(), {
      name: '',
      repositoryUrl: 'https://github.com/example/project',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('rejects an invalid URL in CreateProjectDto', async () => {
    const dto = Object.assign(new CreateProjectDto(), {
      name: 'My project',
      repositoryUrl: 'this-is-not-a-url',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'repositoryUrl')).toBe(true);
  });

  it('accepts a valid partial update', async () => {
    const dto = Object.assign(new UpdateProjectDto(), {
      name: 'New name',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts an empty UpdateProjectDto', async () => {
    const dto = new UpdateProjectDto();

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a non-UUID projectId in CreateDeploymentDto', async () => {
    const dto = Object.assign(new CreateDeploymentDto(), {
      projectId: 'not-a-uuid',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'projectId')).toBe(true);
  });

  it('accepts a CreateDeploymentDto with a valid UUID', async () => {
    const dto = Object.assign(new CreateDeploymentDto(), {
      projectId: '3f8a2b1c-4d5e-4f60-8a7b-9c0d1e2f3a4b',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts FindLogsQueryDto without a cursor and rejects a non-UUID cursor', async () => {
    await expect(validate(new FindLogsQueryDto())).resolves.toHaveLength(0);

    const errors = await validate(
      Object.assign(new FindLogsQueryDto(), { after: '1 OR 1=1' }),
    );

    expect(errors.some((error) => error.property === 'after')).toBe(true);
  });
});
