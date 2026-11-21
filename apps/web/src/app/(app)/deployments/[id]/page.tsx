"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DeploymentStatusBadge } from "@/components/deployment-status-badge";
import { apiRequest } from "@/lib/api";
import {
  isActiveStatus,
  type DeploymentDetail,
  type DeploymentLog,
} from "@/lib/types";

const POLL_INTERVAL_MS = 2000;
// Page size of GET /deployments/:id/logs: a full page means there is more.
const LOGS_PAGE_SIZE = 1000;

const LEVEL_STYLES: Record<DeploymentLog["level"], string> = {
  INFO: "text-slate-300",
  WARN: "text-amber-300",
  ERROR: "text-red-400",
};

export default function DeploymentPage() {
  const { id } = useParams<{ id: string }>();

  const [deployment, setDeployment] = useState<DeploymentDetail | null>(null);
  // Logs are tied to the follow session that loaded them: when it restarts
  // (another deployment or a retry) the previous ones are no longer shown.
  const [logState, setLogState] = useState<{ key: string; items: DeploymentLog[] }>({
    key: "",
    items: [],
  });
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  // Changing it restarts following (after a retry).
  const [followKey, setFollowKey] = useState(0);
  const currentKey = `${id}:${followKey}`;
  const logs = useMemo(
    () => (logState.key === currentKey ? logState.items : []),
    [logState, currentKey],
  );

  const logsRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let lastLogId: string | null = null;
    // After a final status, poll once more: the worker writes the
    // last log right after updating the status.
    let drained = false;
    const key = `${id}:${followKey}`;

    async function poll() {
      try {
        const query = lastLogId ? `?after=${lastLogId}` : "";
        const [current, newLogs] = await Promise.all([
          apiRequest<DeploymentDetail>(`/deployments/${id}`),
          apiRequest<DeploymentLog[]>(`/deployments/${id}/logs${query}`),
        ]);

        if (!active) return;

        setDeployment(current);
        setError("");

        if (newLogs.length > 0) {
          lastLogId = newLogs[newLogs.length - 1].id;
          setLogState((previous) => ({
            key,
            items: previous.key === key ? [...previous.items, ...newLogs] : newLogs,
          }));
        }

        const morePages = newLogs.length === LOGS_PAGE_SIZE;
        const finished = !isActiveStatus(current.status);

        if (morePages) {
          timeoutId = setTimeout(() => void poll(), 0);
        } else if (!finished || !drained) {
          drained = finished;
          timeoutId = setTimeout(() => void poll(), POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load the deployment");
        // A one-off network error does not stop following.
        timeoutId = setTimeout(() => void poll(), POLL_INTERVAL_MS * 2);
      }
    }

    void poll();

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [id, followKey]);

  // Scroll to the bottom on new logs only if the user was already there.
  useEffect(() => {
    const element = logsRef.current;
    if (element && stickToBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [logs]);

  function handleScroll() {
    const element = logsRef.current;
    if (!element) return;
    stickToBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  }

  async function handleRetry() {
    setRetrying(true);
    setError("");

    try {
      await apiRequest(`/deployments/${id}/retry`, { method: "POST" });
      stickToBottom.current = true;
      setFollowKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not retry the deployment");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <>
      {deployment ? (
        <Link
          href={`/projects/${deployment.project.id}`}
          className="text-sm text-cyan-300 hover:underline"
        >
          ← {deployment.project.name}
        </Link>
      ) : (
        <Link href="/" className="text-sm text-cyan-300 hover:underline">
          ← Back to projects
        </Link>
      )}

      {!deployment && !error && (
        <p className="mt-8 text-slate-400">Loading deployment...</p>
      )}

      {error && (
        <p role="alert" className="mt-6 rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
          {error}
        </p>
      )}

      {deployment && (
        <>
          <header className="mt-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-slate-400">Deployment</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <DeploymentStatusBadge status={deployment.status} />
                {isActiveStatus(deployment.status) && (
                  <span className="text-sm text-slate-400">In progress...</span>
                )}
              </div>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-slate-500">Commit</dt>
                <dd className="font-mono text-slate-300">
                  {deployment.commitSha?.slice(0, 7) ?? "—"}
                </dd>
                <dt className="text-slate-500">Started</dt>
                <dd className="text-slate-300">
                  {new Date(deployment.createdAt).toLocaleString()}
                </dd>
                <dt className="text-slate-500">Repository</dt>
                <dd className="break-all text-slate-300">
                  {deployment.project.repositoryUrl}
                </dd>
              </dl>
            </div>

            {deployment.status === "FAILED" && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="rounded-lg bg-cyan-400 px-5 py-2.5 font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
              >
                {retrying ? "Retrying..." : "Retry"}
              </button>
            )}
          </header>

          <section className="mt-8">
            <h2 className="text-lg font-semibold">Logs</h2>
            <div
              ref={logsRef}
              onScroll={handleScroll}
              className="mt-3 max-h-[60vh] overflow-auto rounded-xl border border-slate-800 bg-black/60 p-4 font-mono text-xs leading-relaxed"
            >
              {logs.length === 0 ? (
                <p className="text-slate-500">Waiting for logs...</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex gap-3">
                    <span className="shrink-0 select-none text-slate-600">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                    <pre className={`whitespace-pre-wrap break-words ${LEVEL_STYLES[log.level]}`}>
                      {log.message}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
