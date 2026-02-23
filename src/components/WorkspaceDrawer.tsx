import { useState } from "react";
import { motion } from "motion/react";
import { Activity, Bot, Inbox, Plus, Users, Wallet } from "lucide-react";
import { BalanceHeader } from "~/components/BalanceHeader";
import { TokenListModal } from "~/components/TokenListModal";
import { DrawerTabs, type TabItem } from "~/components/DrawerTabs";
import { TabPlaceholder } from "~/components/TabPlaceholder";
import { MembersTab } from "~/components/MembersTab";
import { AgentsTab } from "~/components/AgentsTab";
import { RequestsTab } from "~/components/RequestsTab";
import { AddAgentModal } from "~/components/AddAgentModal";
import { useWorkspaceBalance } from "~/hooks/useWorkspaceBalance";
import { Id } from "../../convex/_generated/dataModel";

const DRAWER_TABS: TabItem[] = [
  { key: "requests", label: "Requests", icon: <Inbox size={14} /> },
  { key: "agents", label: "Agents", icon: <Bot size={14} /> },
  { key: "humans", label: "Humans", icon: <Users size={14} /> },
  { key: "activity", label: "Activity", icon: <Activity size={14} /> },
];

function BalanceHeaderSkeleton() {
  return (
    <div className="mb-4 animate-pulse rounded-2xl border border-gray-100 bg-white p-6">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-24 rounded bg-gray-200" />
          <div className="h-8 w-40 rounded bg-gray-200" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gray-200" />
          <div className="-ml-3 h-8 w-8 rounded-full bg-gray-200" />
          <div className="-ml-3 h-8 w-8 rounded-full bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

interface WorkspaceDrawerProps {
  workspaceId: Id<"workspaces">;
  onClose: () => void;
}

export function WorkspaceDrawer({ workspaceId, onClose }: WorkspaceDrawerProps) {
  const { data: balanceData, isLoading: balanceLoading } = useWorkspaceBalance(workspaceId);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("requests");
  const [isAddAgentOpen, setIsAddAgentOpen] = useState(false);

  const renderTabContent = () => {
    switch (activeTab) {
      case "humans":
        return <MembersTab workspaceId={workspaceId} />;
      case "requests":
        return <RequestsTab workspaceId={workspaceId} />;
      case "activity":
        return <TabPlaceholder icon={<Activity size={28} className="text-gray-400" />} label="Activity" />;
      case "agents":
        return <AgentsTab workspaceId={workspaceId} onAddAgent={() => setIsAddAgentOpen(true)} />;
      case "balances":
        return <TabPlaceholder icon={<Wallet size={28} className="text-gray-400" />} label="Balances" />;
      default:
        return null;
    }
  };

  return (
    <motion.div
      className="mx-auto mt-4 max-w-3xl rounded-2xl border border-gray-100 bg-white p-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Balance header */}
      {balanceLoading ? (
        <BalanceHeaderSkeleton />
      ) : balanceData && balanceData.tokens.length > 0 && balanceData.totalUsd > 0 ? (
        <>
          <BalanceHeader
            totalUsd={balanceData.totalUsd}
            tokens={balanceData.tokens}
            onOpenModal={() => setIsTokenModalOpen(true)}
            onClose={onClose}
          />
          <TokenListModal
            isOpen={isTokenModalOpen}
            onClose={() => setIsTokenModalOpen(false)}
            tokens={balanceData.tokens}
          />
        </>
      ) : (
        <div className="mb-4 flex justify-end">
          <button
            className="cursor-pointer rounded-full p-1 text-gray-400 transition-colors hover:text-gray-600"
            onClick={onClose}
          >
            <Plus size={16} className="rotate-45" />
          </button>
        </div>
      )}

      {/* Connect Agent action */}
      <div className="mb-4 flex">
        <motion.button
          className="flex cursor-pointer items-center gap-1.5 rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsAddAgentOpen(true)}
        >
          <Bot size={14} />
          Connect Agent
        </motion.button>
      </div>

      {/* Tabs */}
      <DrawerTabs items={DRAWER_TABS} activeKey={activeTab} onChange={setActiveTab}>
        {renderTabContent()}
      </DrawerTabs>

      <AddAgentModal
        isOpen={isAddAgentOpen}
        onClose={() => setIsAddAgentOpen(false)}
        workspaceId={workspaceId}
      />
    </motion.div>
  );
}
