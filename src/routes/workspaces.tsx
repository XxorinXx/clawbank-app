import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useAuth } from "~/hooks/useAuth";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CreateWorkspaceModal } from "~/components/CreateWorkspaceModal";
import { WorkspaceDrawer } from "~/components/WorkspaceDrawer";
import { WorkspaceCard } from "~/components/WorkspaceCard";
import { WorkspaceHeader } from "~/components/WorkspaceHeader";
import { WelcomeScreen } from "~/components/WelcomeScreen";
import { Id } from "../../convex/_generated/dataModel";

export const Route = createFileRoute("/workspaces")({
  component: WorkspacesPage,
} as const);

interface Workspace {
  _id: string;
  name: string;
  vaultAddress: string;
  createdAt: number;
}

function WorkspacesPage() {
  const { isAuthenticated, isLoading, userEmail, walletAddress, logout, exportWallet } = useAuth();
  const navigate = useNavigate();
  const { isAuthenticated: isConvexAuthenticated } = useConvexAuth();
  const getOrCreateUser = useMutation(api.users.getOrCreateUser);
  const didSync = useRef(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<Id<"workspaces"> | null>(null);

  const workspaces = useQuery(
    api.queries.listUserWorkspaces.listUserWorkspaces,
    isConvexAuthenticated ? {} : "skip",
  ) as Workspace[] | undefined;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void navigate({ to: "/" });
    }
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isConvexAuthenticated || !walletAddress || !userEmail || didSync.current) return;
    didSync.current = true;
    getOrCreateUser({ email: userEmail, walletAddress }).catch(() => {
      didSync.current = false;
    });
  }, [isConvexAuthenticated, walletAddress, userEmail, getOrCreateUser]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const hasWorkspaces = workspaces !== undefined && workspaces.length > 0;

  return (
    <div className="relative min-h-screen px-4">
      <WorkspaceHeader
        hasWorkspaces={hasWorkspaces}
        onCreateWorkspace={() => setIsModalOpen(true)}
        onExportWallet={() => void exportWallet()}
        onLogout={() => void logout()}
      />

      {hasWorkspaces ? (
        <motion.div
          className="mx-auto max-w-3xl"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex flex-col gap-3">
            {workspaces.map((ws) => {
              const id = ws._id as Id<"workspaces">;
              return (
                <WorkspaceCard
                  key={ws._id}
                  name={ws.name}
                  vaultAddress={ws.vaultAddress}
                  createdAt={ws.createdAt}
                  isSelected={selectedWorkspaceId === id}
                  onToggle={() =>
                    setSelectedWorkspaceId(selectedWorkspaceId === id ? null : id)
                  }
                />
              );
            })}
          </div>
        </motion.div>
      ) : (
        <WelcomeScreen onCreateWorkspace={() => setIsModalOpen(true)} />
      )}

      {selectedWorkspaceId && (
        <WorkspaceDrawer
          workspaceId={selectedWorkspaceId}
          onClose={() => setSelectedWorkspaceId(null)}
        />
      )}

      <CreateWorkspaceModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
