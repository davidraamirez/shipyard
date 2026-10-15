
"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";

interface Deployment {
  id: string;
  status: string;
  commitSha: string | null;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  repositoryUrl: string;
  createdAt: string;
  deployments: Deployment[];
}



function DeploymentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    QUEUED: "border-slate-700 bg-slate-800 text-slate-300",
    BUILDING: "border-blue-800 bg-blue-950 text-blue-300",
    TESTING: "border-purple-800 bg-purple-950 text-purple-300",
    DEPLOYING: "border-amber-800 bg-amber-950 text-amber-300",
    RUNNING: "border-emerald-800 bg-emerald-950 text-emerald-300",
    FAILED: "border-red-800 bg-red-950 text-red-300",
  };

  const style =
    styles[status] ?? "border-slate-700 bg-slate-800 text-slate-300";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${style}`}
    >
      {status}
    </span>
  );
}


function ProjectDetailContent() {
  
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    async function loadProject() {
      try {
        const result = await apiRequest<Project>(
          `/projects/${projectId}`,
        );
        setProject(result);
        setName(result.name);
        setRepositoryUrl(result.repositoryUrl);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar el proyecto",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadProject();
  }, [projectId]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError("");

    try {
      const updated = await apiRequest<Project>(`/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ name, repositoryUrl }),
      });

      setProject((current) =>
        current ? { ...current, ...updated } : updated,
      );
      setEditing(false);
      router.refresh();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "No se pudo guardar el proyecto",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `¿Seguro que quieres eliminar el proyecto "${project?.name}"?`,
    );

    if (!confirmed) return;

    setDeleting(true);
    setDeleteError("");

    try {
      await apiRequest<{ deleted: boolean }>(`/projects/${projectId}`, {
        method: "DELETE",
      });

      router.push("/");
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el proyecto",
      );
    } finally {
      setDeleting(false);
    }
  }
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-cyan-300 underline"
        >
        ← Back to projects
        </Link>

        {loading && (
          <p className="mt-8 text-slate-400">Loading project...</p>
        )}

        {error && (
          <div className="mt-8 rounded-xl border border-red-900 bg-red-950/30 p-5">
            <h1 className="font-semibold text-red-300">
              Could not load project
            </h1>
            <p className="mt-2 text-sm text-red-300/80">{error}</p>
          </div>
        )}

        {project && (
          <>
            <header className="mt-8">
              <p className="text-sm text-slate-400">Project</p>
              <h1 className="mt-2 text-3xl font-bold">
                {project.name}
              </h1>
              <a
                href={project.repositoryUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block break-all text-sm text-cyan-300 hover:underline"
              >
                {project.repositoryUrl}
              </a>
              <p className="mt-3 text-sm text-slate-500">
                Created{" "}
                {new Date(project.createdAt).toLocaleDateString()}
              </p>
              <button
                type="button"
                onClick={() => setEditing((current) => !current)}
                className="mt-5 rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
              >
                {editing ? "Cancel editing" : "Edit project"}
              </button>

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

              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="ml-3 mt-5 rounded-lg border border-red-900 px-4 py-2 text-sm text-red-300 hover:bg-red-950 disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete project"}
              </button>

              {deleteError && (
                <p role="alert" className="mt-3 text-sm text-red-400">
                  {deleteError}
                </p>
              )}
            </header>

            <section className="mt-10">
              <h2 className="text-xl font-semibold">Deployments</h2>
              <p className="mt-2 text-sm text-slate-400">
                Deployment history for this project.
              </p>

              {project.deployments.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed border-slate-700 p-8 text-center">
                  <h3 className="font-medium">No deployments yet</h3>
                  <p className="mt-2 text-sm text-slate-400">
                    Deployments will appear here when the deployment
                    workflow is implemented.
                  </p>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {project.deployments.map((deployment) => (
                    <article
                      key={deployment.id}
                      className="rounded-xl border border-slate-800 bg-slate-900 p-4"
                    >
                      <DeploymentStatusBadge status={deployment.status} />
                      <p className="mt-1 text-xs text-slate-400">
                        Commit: {deployment.commitSha ?? "Not specified"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(deployment.createdAt).toLocaleString()}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

export default function ProjectDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
          <p className="text-slate-400">Loading project...</p>
        </main>
      }
    >
      <ProjectDetailContent />
    </Suspense>
  );
}