"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";

interface Project {
  id: string;
  name: string;
  repositoryUrl: string;
}

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await apiRequest<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ name, repositoryUrl }),
      });

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo crear el proyecto",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-xl">
        <Link href="/" className="text-sm text-cyan-300 hover:text-cyan-200">
          ← Back to projects
        </Link>

        <h1 className="mt-8 text-3xl font-bold">New project</h1>
        <p className="mt-2 text-slate-400">
          Connect a Git repository to start your deployment workflow.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-6"
        >
          <div>
            <label htmlFor="name" className="mb-2 block text-sm font-medium">
              Project name
            </label>
            <input
              id="name"
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="my-awesome-app"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label
              htmlFor="repositoryUrl"
              className="mb-2 block text-sm font-medium"
            >
              Repository URL
            </label>
            <input
              id="repositoryUrl"
              type="url"
              required
              value={repositoryUrl}
              onChange={(event) => setRepositoryUrl(event.target.value)}
              placeholder="https://github.com/user/repository"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-cyan-400"
            />
            <p className="mt-2 text-xs text-slate-500">
              Use the HTTPS URL of your Git repository.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-400">
              Could not create project: {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? "Creating project..." : "Create project"}
          </button>
        </form>
      </div>
    </main>
  );
}