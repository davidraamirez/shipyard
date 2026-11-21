import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  project: {
    findMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

import { ProjectsService } from './projects.service.js';

describe('ProjectsService', () => {
  let service: ProjectsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProjectsService(prismaMock as any);
  });

  it('lists only the projects of the user', async () => {
    const projects = [{ id: 'project-1', name: 'Shipyard' }];
    prismaMock.project.findMany.mockResolvedValue(projects);

    await expect(service.findAll('user-1')).resolves.toEqual(projects);

    expect(prismaMock.project.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('creates a project owned by the user', async () => {
    const project = { id: 'project-1', name: 'Shipyard', userId: 'user-1' };
    prismaMock.project.create.mockResolvedValue(project);

    await expect(
      service.create('user-1', {
        name: 'Shipyard',
        repositoryUrl: 'https://github.com/example/shipyard',
      }),
    ).resolves.toEqual(project);

    expect(prismaMock.project.create).toHaveBeenCalledWith({
      data: {
        name: 'Shipyard',
        repositoryUrl: 'https://github.com/example/shipyard',
        userId: 'user-1',
      },
    });
  });

  it('returns null if the project does not belong to the user', async () => {
    prismaMock.project.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne('project-1', 'user-2'),
    ).resolves.toBeNull();

    expect(prismaMock.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'project-1', userId: 'user-2' },
      }),
    );
  });

  it('returns null if the project cannot be updated', async () => {
    prismaMock.project.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update('project-1', 'user-2', { name: 'Other name' }),
    ).resolves.toBeNull();

    expect(prismaMock.project.findFirst).not.toHaveBeenCalled();
  });

  it('updates a project of the user', async () => {
    const project = { id: 'project-1', name: 'Shipyard v2' };
    prismaMock.project.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.project.findFirst.mockResolvedValue(project);

    await expect(
      service.update('project-1', 'user-1', { name: 'Shipyard v2' }),
    ).resolves.toEqual(project);

    expect(prismaMock.project.updateMany).toHaveBeenCalledWith({
      where: { id: 'project-1', userId: 'user-1' },
      data: { name: 'Shipyard v2' },
    });
  });

  it('deletes a project of the user', async () => {
    prismaMock.project.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      service.remove('project-1', 'user-1'),
    ).resolves.toEqual({ deleted: true });

    expect(prismaMock.project.deleteMany).toHaveBeenCalledWith({
      where: { id: 'project-1', userId: 'user-1' },
    });
  });

  it('returns null if the project cannot be deleted', async () => {
    prismaMock.project.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      service.remove('project-1', 'user-2'),
    ).resolves.toBeNull();
  });
});