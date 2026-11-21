import { UnrecoverableError } from 'bullmq';
import type { DeploymentJob } from '@shipyard/shared';
import { prisma } from './prisma.js';
import { cloneRepository, getHeadCommit, removeWorkspace } from './git.js';
import { detectProject } from './project-detector.js';
import { buildProject } from './build.js';
import { PermanentDeploymentError, isRecordNotFound } from './errors.js';

type DeploymentAttempt = {
  attemptsMade: number;
  maxAttempts: number;
};

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

async function writeDeploymentLog(
  deploymentId: string,
  level: LogLevel,
  message: string,
) {
  try {
    await prisma.deploymentLog.create({
      data: {
        deploymentId,
        level,
        message,
      },
    });
  } catch (error) {
    // Failing to save a log must not hide the original error.
    console.error(
      `Could not save a log for deployment ${deploymentId}:`,
      error,
    );
  }
}

export async function processDeployment(
  { deploymentId, projectId, repositoryUrl }: DeploymentJob,
  { attemptsMade, maxAttempts }: DeploymentAttempt = {
    attemptsMade: 0,
    maxAttempts: 1,
  },
) {
  const attemptNumber = attemptsMade + 1;

  console.log(`Processing deployment: ${deploymentId}`);
  console.log(`Project: ${projectId}`);
  console.log(`Repository: ${repositoryUrl}`);
  console.log(`Attempt: ${attemptNumber}/${maxAttempts}`);

  await writeDeploymentLog(
    deploymentId,
    'INFO',
    `Starting attempt ${attemptNumber}/${maxAttempts}`,
  );

  let workspace: string | null = null;

  try {
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'BUILDING' },
    });

    console.log(`Deployment ${deploymentId}: BUILDING`);

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      'Status set to BUILDING',
    );

    workspace = await cloneRepository(repositoryUrl, deploymentId);

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      'Repository cloned',
    );

    const commitSha = await getHeadCommit(workspace);

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { commitSha },
    });

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      `Commit: ${commitSha.slice(0, 7)}`,
    );

    const projectInfo = await detectProject(workspace);

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      `Detected project type: ${projectInfo.type}`,
    );

    if (projectInfo.type !== 'NODE') {
      throw new PermanentDeploymentError(
        `Unsupported project type for build: ${projectInfo.type}`,
      );
    }

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      `Package manager: ${projectInfo.packageManager ?? 'not detected'}`,
    );

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      `Build script: ${projectInfo.buildScript ?? 'not defined'}`,
    );

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      'Starting project build',
    );

    // Build output is stored as it arrives from the build-runner.
    await buildProject(deploymentId, workspace, projectInfo, async (output) => {
      // Chunks are split by polling and sometimes start with a
      // newline: leading and trailing ones are removed.
      const text = output.replace(/^\n+/, '').trimEnd();

      if (text) {
        await writeDeploymentLog(deploymentId, 'INFO', text);
      }
    });

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      'Build completed',
    );

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'RUNNING' },
    });

    console.log(`Deployment ${deploymentId}: RUNNING`);

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      'Status set to RUNNING',
    );

    return {
      success: true,
      deploymentId,
      status: 'RUNNING' as const,
    };
  } catch (error) {
    if (isRecordNotFound(error)) {
      // The project was deleted while the job was queued: there is nothing
      // to update and nowhere to store logs.
      console.warn(
        `Deployment ${deploymentId}: no longer exists; dropping the job`,
      );

      throw new UnrecoverableError('The deployment no longer exists');
    }

    const isPermanent = error instanceof PermanentDeploymentError;
    const isLastAttempt = isPermanent || attemptNumber >= maxAttempts;
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    if (isLastAttempt) {
      await writeDeploymentLog(
        deploymentId,
        'ERROR',
        isPermanent
          ? `Unrecoverable error: ${errorMessage}`
          : `Last attempt failed (${attemptNumber}/${maxAttempts}): ${errorMessage}`,
      );

      try {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'FAILED' },
        });

        await writeDeploymentLog(
          deploymentId,
          'ERROR',
          isPermanent
            ? 'Status set to FAILED'
            : 'Status set to FAILED after exhausting all attempts',
        );
      } catch (databaseError) {
        console.error(
          'Could not update the status in PostgreSQL:',
          databaseError,
        );
      }
    } else {
      await writeDeploymentLog(
        deploymentId,
        'WARN',
        `Attempt ${attemptNumber}/${maxAttempts} failed: ${errorMessage}. BullMQ will retry it.`,
      );

      console.warn(
        `Deployment ${deploymentId}: attempt failed; BullMQ will retry it`,
      );
    }

    if (isPermanent) {
      throw new UnrecoverableError(errorMessage);
    }

    throw error;
  } finally {
    if (workspace) {
      await removeWorkspace(workspace).catch((cleanupError) => {
        console.error(
          `Could not remove the workspace of deployment ${deploymentId}:`,
          cleanupError,
        );
      });
    }
  }
}
