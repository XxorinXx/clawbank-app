import { motion } from "motion/react";
import { Loader2 } from "lucide-react";

interface ModalActionsProps {
  onCancel: () => void;
  onConfirm: () => void;
  cancelLabel?: string;
  confirmLabel: string;
  loadingLabel?: string;
  isLoading?: boolean;
  isDisabled?: boolean;
  variant?: "default" | "danger";
}

export function ModalActions({
  onCancel,
  onConfirm,
  cancelLabel = "Cancel",
  confirmLabel,
  loadingLabel,
  isLoading = false,
  isDisabled = false,
  variant = "default",
}: ModalActionsProps) {
  const confirmBg =
    variant === "danger"
      ? "bg-red-500 hover:bg-red-600"
      : "bg-black hover:bg-gray-800";

  return (
    <div className="mt-8 flex items-center justify-between">
      <motion.button
        className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.95 }}
        onClick={onCancel}
        disabled={isLoading}
      >
        {cancelLabel}
      </motion.button>
      <motion.button
        className={`flex cursor-pointer items-center gap-2 rounded-full ${confirmBg} px-6 py-2.5 font-medium text-white transition-colors disabled:opacity-50`}
        whileHover={isLoading || isDisabled ? {} : { scale: 1.02 }}
        whileTap={isLoading || isDisabled ? {} : { scale: 0.95 }}
        onClick={onConfirm}
        disabled={isLoading || isDisabled}
      >
        {isLoading && <Loader2 size={16} className="animate-spin" />}
        {isLoading ? (loadingLabel ?? confirmLabel) : confirmLabel}
      </motion.button>
    </div>
  );
}
