import { motion } from "motion/react";
import { Plus, LogOut, KeyRound } from "lucide-react";

interface WorkspaceHeaderProps {
  hasWorkspaces: boolean;
  onCreateWorkspace: () => void;
  onExportWallet: () => void;
  onLogout: () => void;
}

export function WorkspaceHeader({
  hasWorkspaces,
  onCreateWorkspace,
  onExportWallet,
  onLogout,
}: WorkspaceHeaderProps) {
  return (
    <div className="mx-auto flex max-w-3xl items-center justify-between py-6">
      <h1 className="text-xl font-bold text-gray-900">
        {hasWorkspaces ? "Workspaces" : ""}
      </h1>
      <div className="flex items-center gap-3">
        {hasWorkspaces && (
          <motion.button
            className="flex cursor-pointer items-center gap-2 rounded-full bg-black px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            onClick={onCreateWorkspace}
          >
            <Plus size={16} />
            Create workspace
          </motion.button>
        )}
        <motion.button
          className="flex cursor-pointer items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={onExportWallet}
        >
          <KeyRound size={16} />
          Export Wallet
        </motion.button>
        <motion.button
          className="flex cursor-pointer items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={onLogout}
        >
          <LogOut size={16} />
          Logout
        </motion.button>
      </div>
    </div>
  );
}
