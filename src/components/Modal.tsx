import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Prevent closing via backdrop click or X button */
  preventClose?: boolean;
  /** Max width class, defaults to "max-w-md" */
  maxWidth?: string;
}

export function Modal({
  isOpen,
  onClose,
  children,
  preventClose = false,
  maxWidth = "max-w-md",
}: ModalProps) {
  const handleClose = () => {
    if (preventClose) return;
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={handleClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Panel */}
          <motion.div
            className={`relative z-10 w-full ${maxWidth} overflow-hidden rounded-2xl bg-white p-6 shadow-xl`}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute right-4 top-4 cursor-pointer rounded-full p-1 text-gray-400 transition-colors hover:text-gray-600"
              onClick={handleClose}
              disabled={preventClose}
            >
              <X size={20} />
            </button>

            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
