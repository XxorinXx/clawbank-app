import { motion } from "motion/react";
import { truncateAddress, formatDate } from "~/utils/format";

interface WorkspaceCardProps {
  name: string;
  vaultAddress: string;
  createdAt: number;
  isSelected: boolean;
  onToggle: () => void;
}

export function WorkspaceCard({
  name,
  vaultAddress,
  createdAt,
  isSelected,
  onToggle,
}: WorkspaceCardProps) {
  return (
    <motion.div
      className={`cursor-pointer rounded-2xl border bg-white p-5 transition-colors hover:bg-gray-50 ${
        isSelected
          ? "border-gray-300"
          : "border-gray-100 hover:border-gray-200"
      }`}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      onClick={onToggle}
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold text-gray-900">{name}</h3>
          <p className="font-mono text-sm text-gray-500">
            {truncateAddress(vaultAddress)}
          </p>
        </div>
        <span className="text-xs text-gray-400">{formatDate(createdAt)}</span>
      </div>
    </motion.div>
  );
}
