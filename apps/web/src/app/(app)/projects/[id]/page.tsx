"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DeploymentStatusBadge } from "@/components/deployment-status-badge";
import { apiRequest } from "@/lib/api";
import {
  isActiveStatus,
  type EnqueueDeploymentResponse,
  type Project,
  type ProjectWithDeployments,
} from "@/lib/types";

const POLL_INTERVAL_MS = 3000;

export default function ProjectDetailPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject] = useState<ProjectWithDeployments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Changing it reloads the project (after a retry, for example).
  const [reloadKey, setReloadKey] = useState(0);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [deleting, setDeleting] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    async function loadProject() {
      try {
        const result = await apiRequest<ProjectWithDeployments>(
          `/projects/${projectId}`,
        );

        if (!active) return;

        setProject(result);
        setName(result.name);
        setRepositoryUrl(result.repositoryUrl);
        setError("");

        // Refresh while any deployment is in progress.
        if (result.deployments.some((d) => isActiveStatus(d.status))) {
          timeoutId = setTimeout(() => void loadProject(), POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load the project");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProject();

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [projectId, reloadKey]);

  async function handleDeploy() {
    setDeploying(true);
    setActionError("");

    try {
      const result = await apiRequest<EnqueueDeploymentResponse>("/deployments", {
        method: "POST",
        body: JSON.stringify({ projectId }),
      });

      router.push(`/deployments/${result.deploymentId}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not start the deployment");
      setDeploying(false);
    }
  }

  async function handleRetry(deploymentId: string) {
    setRetryingId(deploymentId);
    setActionError("");

    try {
      await apiRequest(`/deployments/${deploymentId}/retry`, { method: "POST" });
      setReloadKey((key) => key + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not retry the deployment");
    } finally {
      setRetryingId(null);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError("");

    try {
      const updated = await apiRequest<Project>(`/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ name, repositoryUrl }),
      });

      setProject((current) => (current ? { ...current, ...updated } : current));
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save the project");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete project "${project?.name}"? This cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    setActionError("");

    try {
      await apiRequest(`/projects/${projectId}`, { method: "DELETE" });
      router.push("/");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete the project");
      setDeleting(false);
    }
  }

  return (
    <>
      <Link href="/" className="text-sm text-cyan-300 hover:underline">
        ← Back to projects
      </Link>

      {loading && <p className="mt-8 text-slate-400">Loading project...</p>}

      {error && (
        <div className="mt-8 rounded-xl border border-red-900 bg-red-950/30 p-5">
          <h1 className="font-semibold text-red-300">Could not load project</h1>
          <p className="mt-2 text-sm text-red-300/80">{error}</p>
        </div>
      )}

      {project && (
        <>
          <header className="mt-8 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-slate-400">Project</p>
              <h1 className="mt-2 text-3xl font-bold">{project.name}</h1>
              <a
                href={project.repositoryUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block break-all text-sm text-cyan-300 hover:underline"
              >
                {project.repositoryUrl}
              </a>
              <p className="mt-2 text-sm text-slate-500">
                Created {new Date(project.createdAt).toLocaleDateString()}
              </p>
            </div>

            <button
              type="button"
              onClick={handleDeploy}
              disabled={deploying}
              className="rounded-lg bg-cyan-400 px-5 py-2.5 font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
            >
              {deploying ? "Deploying..." : "Deploy"}
            </button>
          </header>

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => setEditing((current) => !current)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
            >
              {editing ? "Cancel editing" : "Edit project"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg border border-red-900 px-4 py-2 text-sm text-red-300 hover:bg-red-950 disabled:opacity-60"
            >
              {deleting ? "Deleting..." : "Delete project"}
            </button>
          </div>

          {actionError && (
            <p role="alert" className="mt-4 text-sm text-red-400">
              {actionError}
            </p>
          )}

          {editing && (
            <form
              onSubmit={handleSave}
              className="mt-5 space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5"
            >
              <div>
                <label htmlFor="project-name" className="mb-2 block text-sm">
                  Project name
                </label>
                <input
                  id="project-name"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </div>

              <div>
                <label htmlFor="repository-url" className="mb-2 block text-sm">
                  Repository URL
                </label>
                <input
                  id="repository-url"
                  type="url"
                  required
                  value={repositoryUrl}
                  onChange={(event) => setRepositoryUrl(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </div>

              {saveError && (
                <p role="alert" className="text-sm text-red-400">
                  {saveError}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </form>
          )}

          <section className="mt-10">
            <h2 className="text-xl font-semibold">Deployments</h2>

            {project.deployments.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-slate-700 p-8 text-center">
                <h3 className="font-medium">No deployments yet</h3>
                <p className="mt-2 text-sm text-slate-400">
                  Press Deploy to build the latest commit of this repository.
                </p>
              </div>
            ) : (
              <ul className="mt-5 space-y-3">
                {project.deployments.map((deployment) => (
                  <li
                    key={deployment.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 hover:border-slate-700"
                  >
                    <Link
                      href={`/deployments/${deployment.id}`}
                      className="flex min-w-0 flex-1 flex-wrap items-center gap-4"
                    >
                      <DeploymentStatusBadge status={deployment.status} />
                      <span className="font-mono text-xs text-slate-400">
                        {deployment.commitSha?.slice(0, 7) ?? "—"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(deployment.createdAt).toLocaleString()}
                      </span>
                      <span className="ml-auto text-sm text-cyan-300">View logs →</span>
                    </Link>

                    {deployment.status === "FAILED" && (
                      <button
                        type="button"
                        onClick={() => handleRetry(deployment.id)}
                        disabled={retryingId === deployment.id}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-60"
                      >
                        {retryingId === deployment.id ? "Retrying..." : "Retry"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
