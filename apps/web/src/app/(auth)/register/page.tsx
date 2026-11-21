"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { setToken } from "@/lib/auth";

interface LoginResponse {
  access_token: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await apiRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, ...(name ? { name } : {}) }),
      });

      // Sign in right away with the new account.
      const result = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      setToken(result.access_token);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="w-full max-w-md">
        <Link href="/" className="text-3xl font-bold tracking-tight">
          Shipyard<span className="text-cyan-400">.</span>
        </Link>

        <h1 className="mt-8 text-2xl font-semibold">Create your account</h1>
        <p className="mt-2 text-sm text-slate-400">
          Start deploying your repositories in minutes.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-6"
        >
          <div>
            <label htmlFor="name" className="mb-2 block text-sm font-medium">
              Name <span className="text-slate-500">(optional)</span>
            </label>
            <input
              id="name"
              autoComplete="name"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-cyan-400"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={72}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-cyan-400"
            />
            <p className="mt-2 text-xs text-slate-500">At least 8 characters.</p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="text-cyan-300 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
