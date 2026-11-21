// Shapes of the API responses (apps/api).

export type DeploymentStatus =
  | "QUEUED"
  | "BUILDING"
  | "TESTING"
  | "DEPLOYING"
  | "RUNNING"
  | "FAILED";

// Statuses in which the deployment can still change.
export const ACTIVE_STATUSES: readonly DeploymentStatus[] = [
  "QUEUED",
  "BUILDING",
  "TESTING",
  "DEPLOYING",
];

export function isActiveStatus(status: DeploymentStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export interface Deployment {
  id: string;
  status: DeploymentStatus;
  commitSha: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  repositoryUrl: string;
  createdAt: string;
}

export interface ProjectWithDeployments extends Project {
  deployments: Deployment[];
}

export interface DeploymentDetail extends Deployment {
  project: Pick<Project, "id" | "name" | "repositoryUrl">;
}

export interface DeploymentLog {
  id: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  createdAt: string;
}

export interface EnqueueDeploymentResponse {
  message: string;
  deploymentId: string;
  status: DeploymentStatus;
}
