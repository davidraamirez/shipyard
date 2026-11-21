import type { DeploymentStatus } from "@/lib/types";

const STYLES: Record<DeploymentStatus, string> = {
  QUEUED: "border-slate-700 bg-slate-800 text-slate-300",
  BUILDING: "border-blue-800 bg-blue-950 text-blue-300",
  TESTING: "border-purple-800 bg-purple-950 text-purple-300",
  DEPLOYING: "border-amber-800 bg-amber-950 text-amber-300",
  RUNNING: "border-emerald-800 bg-emerald-950 text-emerald-300",
  FAILED: "border-red-800 bg-red-950 text-red-300",
};

export function DeploymentStatusBadge({ status }: { status: DeploymentStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
