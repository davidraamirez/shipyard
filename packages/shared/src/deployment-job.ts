// Queue contract between the API (producer) and the worker (consumer).
export const DEPLOYMENTS_QUEUE = 'deployments';
export const DEPLOY_PROJECT_JOB = 'deploy-project';

export type DeploymentJob = {
  deploymentId: string;
  projectId: string;
  repositoryUrl: string;
  requestedAt: string;
};
