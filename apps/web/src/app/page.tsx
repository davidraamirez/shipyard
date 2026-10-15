"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";

interface Project {
  id: string;
  name: string;
  repositoryUrl: string;
  createdAt: string;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  function handleLogout() {
    sessionStorage.removeItem("shipyard_access_token");
    window.location.href = "/login";
  }

  useEffect(() => {
    async function loadProjects() {
      try {
        const token = sessionStorage.getItem("shipyard_access_token");
        if (!token) {
          setIsAuthenticated(false);
          setLoading(false);
          return;
        }
        setIsAuthenticated(true);

        const result = await apiRequest<Project[]>("/projects");
        setProjects(result);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "No se pudieron cargar los proyectos",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadProjects();
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-slate-800 p-6 md:block">
          <Link href="/" className="text-2xl font-bold tracking-tight">
            Shipyard<span className="text-cyan-400">.</span>
          </Link>

          <p className="mt-2 text-sm text-slate-500">Deployment platform</p>

          <nav className="mt-10">
            <Link
              href="/"
              className="block rounded-lg bg-slate-800 px-4 py-3 text-sm font-medium"
            >
              Projects
            </Link>
          </nav>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex items-center justify-between border-b border-slate-800 px-6 py-5 md:px-10">
            <div>
              <p className="text-sm text-slate-400">Workspace</p>
              <h1 className="mt-1 text-xl font-semibold">Projects</h1>
            </div>

            {isAuthenticated ? (
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-900"
              >
                Sign out
              </button>
            ) : (
              <Link
                href="/login"
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-900"
              >
                Sign in
              </Link>
            )}
          </header>

          <div className="mx-auto max-w-6xl p-6 md:p-10">
            <h2 className="text-2xl font-bold tracking-tight">Your projects</h2>
            <p className="mt-2 text-sm text-slate-400">
              Manage your repositories and deployments in one place.
            </p>

             <div className="mt-5">
                <Link
                    href="/projects/new"
                    className="inline-flex rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
                >
                    + New project
                </Link>
            </div>
            <div className="mt-8">
              {loading && (
                <p className="text-sm text-slate-400">Loading projects...</p>
              )}

              {error && (
                <div className="rounded-xl border border-red-900 bg-red-950/30 p-5">
                  <p className="font-medium text-red-300">
                    Could not load projects
                  </p>
                  <p className="mt-2 text-sm text-red-300/80">{error}</p>
                  {error.includes("401") && (
                    <Link
                      href="/login"
                      className="mt-4 inline-block text-sm text-cyan-300 underline"
                    >
                      Sign in to continue
                    </Link>
                  )}
                </div>
              )}

              {!loading && !error && projects.length === 0 && (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 text-center">
                  <h3 className="text-lg font-semibold">No projects yet</h3>
                  <p className="mt-2 max-w-md text-sm text-slate-400">
                    Your projects will appear here when you create your first one.
                  </p>
                </div>
              )}

              {!loading && !error && projects.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {projects.map((project) => ( 
                  <article
                    key={project.id}
                    className="rounded-xl border border-slate-800 bg-slate-900 p-5 transition hover:border-cyan-400/60"
                  >
                    <Link
                      href={`/projects/${project.id}`}
                      className="block"
                    >
                      <h3 className="font-semibold">{project.name}</h3>
                      <p className="mt-2 break-all text-sm text-slate-400">
                        {project.repositoryUrl}
                      </p>
                      <p className="mt-4 text-xs text-slate-500">
                        Created{" "}
                        {new Date(project.createdAt).toLocaleDateString()}
                      </p>
                      <p className="mt-4 text-sm font-medium text-cyan-300">
                        View project →
                      </p>
                    </Link>
                  </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}