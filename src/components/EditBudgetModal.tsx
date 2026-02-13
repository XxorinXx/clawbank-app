import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Loader2, ChevronDown } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Modal } from "~/components/Modal";
import { TokenIcon } from "~/components/TokenIcon";
import { useWorkspaceBalance } from "~/hooks/useWorkspaceBalance";

type PeriodType = "daily" | "weekly" | "monthly";

const PERIODS: { value: PeriodType; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function periodLabel(period: PeriodType): string {
  switch (period) {
    case "daily":
      return "day";
    case "weekly":
      return "week";
    case "monthly":
      return "month";
  }
}

interface AgentLimit {
  tokenMint: string;
  tokenSymbol?: string;
  limitAmount: number;
  spentAmount: number;
  periodType: string;
  periodStart: number;
}

interface EditBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: Id<"workspaces">;
  agent: {
    _id: Id<"agents">;
    name: string;
    limits: AgentLimit[];
  };
}

export function EditBudgetModal({
  isOpen,
  onClose,
  workspaceId,
  agent,
}: EditBudgetModalProps) {
  const updateSpendingLimit = useMutation(api.mutations.agents.updateSpendingLimit);
  const { data: balanceData } = useWorkspaceBalance(workspaceId);

  const currentLimit = agent.limits[0];

  const [tokenMint, setTokenMint] = useState(currentLimit?.tokenMint ?? "");
  const [tokenSymbol, setTokenSymbol] = useState(currentLimit?.tokenSymbol ?? "");
  const [amount, setAmount] = useState(currentLimit ? String(currentLimit.limitAmount) : "");
  const [period, setPeriod] = useState<PeriodType>(
    (currentLimit?.periodType as PeriodType) ?? "daily",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [isTokenDropdownOpen, setIsTokenDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reset state when agent changes
  useEffect(() => {
    const limit = agent.limits[0];
    setTokenMint(limit?.tokenMint ?? "");
    setTokenSymbol(limit?.tokenSymbol ?? "");
    setAmount(limit ? String(limit.limitAmount) : "");
    setPeriod((limit?.periodType as PeriodType) ?? "daily");
    setFormError("");
  }, [agent._id, agent.limits]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsTokenDropdownOpen(false);
      }
    }
    if (isTokenDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isTokenDropdownOpen]);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    onClose();
  }, [onClose, isSubmitting]);

  const isSaveEnabled = tokenMint.length > 0 && parseFloat(amount) > 0;

  const handleSave = useCallback(async () => {
    if (!isSaveEnabled) return;
    setFormError("");
    setIsSubmitting(true);

    try {
      await updateSpendingLimit({
        agentId: agent._id,
        tokenMint,
        limitAmount: parseFloat(amount),
        periodType: period,
      });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update budget";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSaveEnabled, updateSpendingLimit, agent._id, tokenMint, amount, period, onClose]);

  const selectedToken = balanceData?.tokens.find((t) => t.mint === tokenMint);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} preventClose={isSubmitting}>
      <h2 className="mb-1 text-xl font-bold text-gray-900">Manage Budget</h2>
      <p className="mb-6 text-sm text-gray-500">
        Update spending limits for <span className="font-medium text-gray-700">{agent.name}</span>.
      </p>

      {/* Token + Amount row */}
      <div className="flex gap-3">
        {/* Token selector */}
        <div className="relative w-36" ref={dropdownRef}>
          <label className="mb-2 block text-sm font-medium text-gray-700">Token</label>
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition-colors hover:border-gray-300 focus:border-gray-400"
            onClick={() => setIsTokenDropdownOpen(!isTokenDropdownOpen)}
            disabled={isSubmitting}
          >
            {selectedToken ? (
              <>
                <TokenIcon icon={selectedToken.icon} className="h-5 w-5" />
                <span className="flex-1 text-left font-medium">{selectedToken.symbol}</span>
              </>
            ) : (
              <span className="flex-1 text-left text-gray-500">{tokenSymbol || "Token"}</span>
            )}
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {isTokenDropdownOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
              {balanceData && balanceData.tokens.length > 0 ? (
                balanceData.tokens.map((token) => (
                  <button
                    key={token.mint}
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50"
                    onClick={() => {
                      setTokenMint(token.mint);
                      setTokenSymbol(token.symbol);
                      setIsTokenDropdownOpen(false);
                    }}
                  >
                    <TokenIcon icon={token.icon} className="h-5 w-5" />
                    <span className="font-medium">{token.symbol}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-gray-400">No tokens found</div>
              )}
            </div>
          )}
        </div>

        {/* Amount */}
        <div className="flex-1">
          <label className="mb-2 block text-sm font-medium text-gray-700">Amount</label>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "" || /^\d*\.?\d*$/.test(val)) {
                setAmount(val);
              }
            }}
            placeholder="0.00"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-right text-sm outline-none transition-colors focus:border-gray-400"
            disabled={isSubmitting}
          />
        </div>
      </div>

      {/* Period selector */}
      <label className="mb-2 mt-4 block text-sm font-medium text-gray-700">Period</label>
      <div className="flex gap-0 rounded-xl border border-gray-200 p-1">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              period === p.value
                ? "bg-black text-white"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setPeriod(p.value)}
            disabled={isSubmitting}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      {parseFloat(amount) > 0 && (
        <p className="mt-4 text-sm text-gray-500">
          This agent can spend up to{" "}
          <span className="font-semibold text-gray-900">
            {amount} {selectedToken?.symbol ?? tokenSymbol}
          </span>{" "}
          per{" "}
          <span className="font-semibold text-gray-900">{periodLabel(period)}</span>{" "}
          without approval.
        </p>
      )}

      {/* Error */}
      {formError && <p className="mt-3 text-sm text-red-500">{formError}</p>}

      {/* Actions */}
      <div className="mt-8 flex items-center justify-between">
        <motion.button
          className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleClose}
          disabled={isSubmitting}
        >
          Cancel
        </motion.button>
        <motion.button
          className="flex cursor-pointer items-center gap-2 rounded-full bg-black px-6 py-2.5 font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
          whileHover={isSubmitting || !isSaveEnabled ? {} : { scale: 1.02 }}
          whileTap={isSubmitting || !isSaveEnabled ? {} : { scale: 0.95 }}
          onClick={() => void handleSave()}
          disabled={isSubmitting || !isSaveEnabled}
        >
          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
          {isSubmitting ? "Saving..." : "Save"}
        </motion.button>
      </div>
    </Modal>
  );
}
