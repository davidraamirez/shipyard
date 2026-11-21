"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    apiRequest<Project[]>("/projects")
      .then((result) => {
        if (active) setProjects(result);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Could not load projects",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your projects</h1>
          <p className="mt-2 text-sm text-slate-400">
            Manage your repositories and deployments in one place.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
        >
          + New project
        </Link>
      </div>

      <div className="mt-8">
        {loading && <p className="text-sm text-slate-400">Loading projects...</p>}

        {error && (
          <div className="rounded-xl border border-red-900 bg-red-950/30 p-5">
            <p className="font-medium text-red-300">Could not load projects</p>
            <p className="mt-2 text-sm text-red-300/80">{error}</p>
          </div>
        )}

        {!loading && !error && projects.length === 0 && (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 text-center">
            <h2 className="text-lg font-semibold">No projects yet</h2>
            <p className="mt-2 max-w-md text-sm text-slate-400">
              Create your first project to connect a repository and deploy it.
            </p>
          </div>
        )}

        {!loading && !error && projects.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block rounded-xl border border-slate-800 bg-slate-900 p-5 transition hover:border-cyan-400/60"
              >
                <h2 className="font-semibold">{project.name}</h2>
                <p className="mt-2 break-all text-sm text-slate-400">
                  {project.repositoryUrl}
                </p>
                <p className="mt-4 text-xs text-slate-500">
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
