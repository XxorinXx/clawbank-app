import { type ReactNode } from "react";
import { motion } from "motion/react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
        {icon}
      </div>
      <span className="text-sm font-medium">{title}</span>
      {description && (
        <span className="mt-1 text-xs text-gray-300">{description}</span>
      )}
      {action && (
        <motion.button
          className="mt-4 cursor-pointer rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          whileTap={{ scale: 0.98 }}
          onClick={action.onClick}
        >
          {action.label}
        </motion.button>
      )}
    </div>
  );
}
