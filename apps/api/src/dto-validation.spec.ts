import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';

import { LoginDto } from './auth/dto/login.dto.js';
import { RegisterDto } from './auth/dto/register.dto.js';
import { CreateProjectDto } from './projects/dto/create-project.dto.js';
import { UpdateProjectDto } from './projects/dto/update-project.dto.js';

describe('DTO validation', () => {
  it('rechaza un email inválido en LoginDto', async () => {
    const dto = Object.assign(new LoginDto(), {
      email: 'no-es-un-email',
      password: 'password123',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'email')).toBe(true);
  });

  it('rechaza una contraseña demasiado corta en RegisterDto', async () => {
    const dto = Object.assign(new RegisterDto(), {
      email: 'test@example.com',
      password: '123',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });

  it('acepta un registro válido sin nombre', async () => {
    const dto = Object.assign(new RegisterDto(), {
      email: 'test@example.com',
      password: 'password123',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rechaza un nombre demasiado largo en RegisterDto', async () => {
    const dto = Object.assign(new RegisterDto(), {
      email: 'test@example.com',
      password: 'password123',
      name: 'a'.repeat(101),
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('rechaza un nombre vacío en CreateProjectDto', async () => {
    const dto = Object.assign(new CreateProjectDto(), {
      name: '',
      repositoryUrl: 'https://github.com/example/project',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('rechaza una URL inválida en CreateProjectDto', async () => {
    const dto = Object.assign(new CreateProjectDto(), {
      name: 'Mi proyecto',
      repositoryUrl: 'esto-no-es-una-url',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'repositoryUrl')).toBe(true);
  });

  it('acepta una actualización parcial válida', async () => {
    const dto = Object.assign(new UpdateProjectDto(), {
      name: 'Nuevo nombre',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('acepta un UpdateProjectDto vacío', async () => {
    const dto = new UpdateProjectDto();

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
