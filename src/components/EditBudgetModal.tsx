import { useState, useCallback, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Modal } from "~/components/Modal";
import { useWorkspaceBalance } from "~/hooks/useWorkspaceBalance";
import { useSignTransaction } from "~/hooks/useSignTransaction";
import { TokenDropdown } from "~/components/ui/TokenDropdown";
import { PeriodSelector, periodLabel, type PeriodType } from "~/components/ui/PeriodSelector";
import { ModalActions } from "~/components/ui/ModalActions";

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
  const buildSpendingLimitUpdateTx = useAction(
    api.actions.updateSpendingLimitOnchain.buildSpendingLimitUpdateTx,
  );
  const submitSpendingLimitUpdateTx = useAction(
    api.actions.updateSpendingLimitOnchain.submitSpendingLimitUpdateTx,
  );
  const { data: balanceData } = useWorkspaceBalance(workspaceId);
  const tx = useSignTransaction();

  const currentLimit = agent.limits[0];

  const [tokenMint, setTokenMint] = useState(currentLimit?.tokenMint ?? "");
  const [tokenSymbol, setTokenSymbol] = useState(currentLimit?.tokenSymbol ?? "");
  const [amount, setAmount] = useState(currentLimit ? String(currentLimit.limitAmount) : "");
  const [period, setPeriod] = useState<PeriodType>(
    (currentLimit?.periodType as PeriodType) ?? "daily",
  );

  // Reset state when agent changes
  useEffect(() => {
    const limit = agent.limits[0];
    setTokenMint(limit?.tokenMint ?? "");
    setTokenSymbol(limit?.tokenSymbol ?? "");
    setAmount(limit ? String(limit.limitAmount) : "");
    setPeriod((limit?.periodType as PeriodType) ?? "daily");
    tx.reset();
  }, [agent._id, agent.limits]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    if (tx.isProcessing) return;
    onClose();
  }, [onClose, tx.isProcessing]);

  const isSaveEnabled = tokenMint.length > 0 && parseFloat(amount) > 0;

  const handleSave = useCallback(async () => {
    if (!isSaveEnabled) return;

    const limitAmount = parseFloat(amount);

    const success = await tx.execute({
      build: () =>
        buildSpendingLimitUpdateTx({
          agentId: agent._id,
          workspaceId,
          tokenMint,
          limitAmount,
          periodType: period,
        }),
      submit: ({ signedTx, createKey }) =>
        submitSpendingLimitUpdateTx({
          agentId: agent._id,
          workspaceId,
          signedTx,
          createKey: createKey!,
          tokenMint,
          limitAmount,
          periodType: period,
        }),
    });

    if (success) {
      onClose();
    }
  }, [
    isSaveEnabled,
    buildSpendingLimitUpdateTx,
    submitSpendingLimitUpdateTx,
    tx,
    agent._id,
    workspaceId,
    tokenMint,
    amount,
    period,
    onClose,
  ]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} preventClose={tx.isProcessing}>
      <h2 className="mb-1 text-xl font-bold text-gray-900">Manage Budget</h2>
      <p className="mb-6 text-sm text-gray-500">
        Update spending limits for <span className="font-medium text-gray-700">{agent.name}</span>.
      </p>

      {/* Token + Amount row */}
      <div className="flex gap-3">
        <TokenDropdown
          tokens={balanceData?.tokens ?? []}
          selectedMint={tokenMint}
          selectedSymbol={tokenSymbol}
          onSelect={(mint, symbol) => {
            setTokenMint(mint);
            setTokenSymbol(symbol);
          }}
          disabled={tx.isProcessing}
        />

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
            disabled={tx.isProcessing}
          />
        </div>
      </div>

      <PeriodSelector value={period} onChange={setPeriod} disabled={tx.isProcessing} />

      {parseFloat(amount) > 0 && (
        <p className="mt-4 text-sm text-gray-500">
          This agent can spend up to{" "}
          <span className="font-semibold text-gray-900">
            {amount} {tokenSymbol}
          </span>{" "}
          per{" "}
          <span className="font-semibold text-gray-900">{periodLabel(period)}</span>{" "}
          without approval.
        </p>
      )}

      {tx.error && <p className="mt-3 text-sm text-red-500">{tx.error}</p>}

      <ModalActions
        onCancel={handleClose}
        onConfirm={() => void handleSave()}
        confirmLabel="Save"
        loadingLabel={tx.statusLabel || "Saving..."}
        isLoading={tx.isProcessing}
        isDisabled={!isSaveEnabled}
      />
    </Modal>
  );
}
