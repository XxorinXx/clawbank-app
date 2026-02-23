import { motion } from "motion/react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface WelcomeScreenProps {
  onCreateWorkspace: () => void;
}

export function WelcomeScreen({ onCreateWorkspace }: WelcomeScreenProps) {
  return (
    <div className="flex min-h-[calc(100vh-88px)] items-center justify-center">
      <motion.div
        className="flex w-full max-w-md flex-col items-center text-center"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <motion.div
          className="mb-8 flex h-32 w-32 items-center justify-center rounded-2xl bg-gray-100"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Plus size={48} className="text-gray-400" />
        </motion.div>

        <h1 className="text-2xl font-bold text-gray-900">
          Welcome to ClawBank
        </h1>
        <p className="mt-3 max-w-[240px] text-center text-sm leading-relaxed text-gray-400">
          Create your first workspace to get started
        </p>

        <div className="mt-7 flex flex-col items-center gap-3">
          <motion.button
            className="cursor-pointer rounded-full bg-black px-8 py-3 font-medium text-white transition-colors hover:bg-gray-800"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            onClick={onCreateWorkspace}
          >
            Create workspace
          </motion.button>

          <motion.button
            className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => toast("Coming soon")}
          >
            Import workspace
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
