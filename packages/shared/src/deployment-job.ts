// Contrato de la cola entre la API (productor) y el worker (consumidor).
export const DEPLOYMENTS_QUEUE = 'deployments';
export const DEPLOY_PROJECT_JOB = 'deploy-project';

export type DeploymentJob = {
  deploymentId: string;
  projectId: string;
  repositoryUrl: string;
  requestedAt: string;
};
