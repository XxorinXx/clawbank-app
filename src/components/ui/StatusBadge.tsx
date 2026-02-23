import { cn } from "~/utils/cn";

interface StatusBadgeProps {
  status: string;
  styles: Record<string, string>;
  labels: Record<string, string>;
}

export function StatusBadge({ status, styles, labels }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        styles[status] ?? "bg-gray-100 text-gray-500",
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}

// Pre-configured status maps for common use cases

export const AGENT_STATUS_STYLES: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  connected: "bg-gray-100 text-gray-500",
  provisioning: "bg-yellow-50 text-yellow-700",
  paused: "bg-gray-100 text-gray-500",
  revoked: "bg-gray-100 text-gray-500",
};

export const AGENT_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  connected: "Connected",
  provisioning: "Provisioning",
  paused: "Disconnected",
  revoked: "Revoked",
};

export const REQUEST_STATUS_STYLES: Record<string, string> = {
  pending_execution: "bg-yellow-50 text-yellow-700",
  executed: "bg-green-50 text-green-700",
  pending_approval: "bg-amber-50 text-amber-700",
  approved: "bg-green-50 text-green-700",
  denied: "bg-red-50 text-red-700",
  failed: "bg-red-50 text-red-700",
};

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  pending_execution: "Processing",
  executed: "Executed",
  pending_approval: "Pending Approval",
  approved: "Approved",
  denied: "Denied",
  failed: "Failed",
};
