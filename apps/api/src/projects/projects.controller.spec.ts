import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  create: vi.fn(),
  findOne: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('./projects.service.js', () => ({
  ProjectsService: class ProjectsService {
    findAll = mocks.findAll;
    create = mocks.create;
    findOne = mocks.findOne;
    update = mocks.update;
    remove = mocks.remove;
  },
}));

import { ProjectsController } from './projects.controller.js';

describe('ProjectsController', () => {
  let controller: ProjectsController;

  const request = {
    user: {
      userId: 'user-1',
      email: 'bob@example.com',
    },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new ProjectsController({
      findAll: mocks.findAll,
      create: mocks.create,
      findOne: mocks.findOne,
      update: mocks.update,
      remove: mocks.remove,
    } as any);
  });

  it('debe listar los proyectos del usuario autenticado', async () => {
    const projects = [{ id: 'project-1', name: 'Shipyard' }];
    mocks.findAll.mockResolvedValue(projects);

    await expect(controller.findAll(request)).resolves.toEqual(projects);

    expect(mocks.findAll).toHaveBeenCalledWith('user-1');
  });

  it('debe crear un proyecto asociado al usuario autenticado', async () => {
    const body = {
      name: 'Shipyard',
      repositoryUrl: 'https://github.com/example/shipyard',
    };
    const project = { id: 'project-1', ...body, userId: 'user-1' };

    mocks.create.mockResolvedValue(project);

    await expect(controller.create(request, body as any))
      .resolves.toEqual(project);

    expect(mocks.create).toHaveBeenCalledWith('user-1', body);
  });

  it('debe devolver un proyecto existente', async () => {
    const project = { id: 'project-1', name: 'Shipyard' };
    mocks.findOne.mockResolvedValue(project);

    await expect(
      controller.findOne(request, 'project-1'),
    ).resolves.toEqual(project);

    expect(mocks.findOne).toHaveBeenCalledWith('project-1', 'user-1');
  });

  it('debe lanzar NotFoundException si el proyecto no existe', async () => {
    mocks.findOne.mockResolvedValue(null);

    await expect(
      controller.findOne(request, 'missing-project'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('debe actualizar un proyecto existente', async () => {
    const body = { name: 'Shipyard v2' };
    const project = { id: 'project-1', name: 'Shipyard v2' };
    mocks.update.mockResolvedValue(project);

    await expect(
      controller.update(request, 'project-1', body as any),
    ).resolves.toEqual(project);

    expect(mocks.update).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      body,
    );
  });

  it('debe lanzar NotFoundException si no puede actualizar el proyecto', async () => {
    mocks.update.mockResolvedValue(null);

    await expect(
      controller.update(request, 'missing-project', { name: 'Otro' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('debe eliminar un proyecto existente', async () => {
    mocks.remove.mockResolvedValue({ deleted: true });

    await expect(
      controller.remove(request, 'project-1'),
    ).resolves.toEqual({ deleted: true });

    expect(mocks.remove).toHaveBeenCalledWith('project-1', 'user-1');
  });

  it('debe lanzar NotFoundException si no puede eliminar el proyecto', async () => {
    mocks.remove.mockResolvedValue(null);

    await expect(
      controller.remove(request, 'missing-project'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});