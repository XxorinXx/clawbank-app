import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, Copy, Check, CheckCircle } from "lucide-react";
import { useMutation, useQuery, useAction } from "convex/react";
import { useSolanaWallets } from "@privy-io/react-auth";
import { VersionedTransaction } from "@solana/web3.js";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Modal } from "~/components/Modal";
import { useWorkspaceBalance } from "~/hooks/useWorkspaceBalance";
import { TokenDropdown } from "~/components/ui/TokenDropdown";
import { PeriodSelector, periodLabel, type PeriodType } from "~/components/ui/PeriodSelector";
import { slideVariants } from "~/utils/animations";
import { truncateAddress } from "~/utils/format";

interface AddAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: Id<"workspaces">;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function AddAgentModal({ isOpen, onClose, workspaceId }: AddAgentModalProps) {
  const createAgent = useMutation(api.mutations.agents.create);
  const generateConnectCode = useAction(
    api.actions.generateConnectCode.generateConnectCode,
  );
  const { data: balanceData } = useWorkspaceBalance(workspaceId);
  const { wallets: solanaWallets } = useSolanaWallets();
  const buildActivationTx = useAction(
    api.actions.buildAgentActivationTx.buildAgentActivationTx,
  );
  const submitActivationTx = useAction(
    api.actions.buildAgentActivationTx.submitAgentActivationTx,
  );

  // Step state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  // Step 1 fields
  const [name, setName] = useState("");
  const [tokenMint, setTokenMint] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("SOL");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<PeriodType>("daily");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Step 2 fields
  const [agentId, setAgentId] = useState<Id<"agents"> | null>(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [codeExpired, setCodeExpired] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

  // On-chain activation state
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState("");
  const activatingRef = useRef(false);

  // Latch: once we detect the agent is connected, remember it so brief
  // query-refresh undefined blips don't flash back to the connect-code UI.
  const [agentConnected, setAgentConnected] = useState(false);

  // Reactive queries for step 2
  const connectCodeData = useQuery(
    api.queries.agents.getConnectCode,
    agentId ? { agentId } : "skip",
  );
  const agentsList = useQuery(
    api.queries.agents.list,
    step === 2 && agentId ? { workspaceId } : "skip",
  );

  // Find our agent in the list to detect status changes
  const currentAgent = agentsList?.find((a: { _id: string }) => a._id === agentId);

  // Latch connected status
  useEffect(() => {
    if (currentAgent?.status === "connected" || currentAgent?.status === "active") {
      setAgentConnected(true);
    }
  }, [currentAgent?.status]);

  // Set default token when balance data loads
  useEffect(() => {
    if (balanceData && balanceData.tokens.length > 0 && !tokenMint) {
      setTokenMint(balanceData.tokens[0].mint);
      setTokenSymbol(balanceData.tokens[0].symbol);
    }
  }, [balanceData, tokenMint]);

  // Countdown timer for connect code
  useEffect(() => {
    if (step !== 2 || !connectCodeData?.expiresAt) return;

    const tick = () => {
      const remaining = connectCodeData.expiresAt - Date.now();
      if (remaining <= 0) {
        setCountdown(0);
        setCodeExpired(true);
      } else {
        setCountdown(remaining);
        setCodeExpired(false);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [step, connectCodeData?.expiresAt]);

  // On-chain activation: build tx, sign with user wallet, submit, confirm
  const handleActivation = useCallback(async () => {
    if (!agentId) return;
    setIsActivating(true);
    setActivationError("");

    try {
      const { serializedTx, createKey } = await buildActivationTx({
        agentId,
        workspaceId,
      });

      // Deserialize the sponsor-signed tx and sign with user wallet
      const txBytes = Uint8Array.from(atob(serializedTx), (c) => c.charCodeAt(0));
      const tx = VersionedTransaction.deserialize(txBytes);

      const wallet = solanaWallets[0];
      if (!wallet) throw new Error("No Solana wallet found");
      const signedTx = await wallet.signTransaction(tx);

      // Send back to backend for submission via Helius RPC
      const signedBase64 = btoa(
        String.fromCharCode(...signedTx.serialize()),
      );

      await submitActivationTx({
        agentId,
        signedTx: signedBase64,
        createKey,
      });

      setDirection("forward");
      setStep(3);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to activate agent on-chain";
      setActivationError(message);
    } finally {
      setIsActivating(false);
    }
  }, [agentId, workspaceId, solanaWallets, buildActivationTx, submitActivationTx]);

  const handleRetryActivation = useCallback(() => {
    activatingRef.current = false;
    setActivationError("");
  }, []);

  // Auto-trigger activation when agent connects
  useEffect(() => {
    if (
      step === 2 &&
      agentConnected &&
      !activatingRef.current &&
      !isActivating &&
      !activationError
    ) {
      activatingRef.current = true;
      void handleActivation();
    }
  }, [step, agentConnected, isActivating, activationError, handleActivation]);

  const resetState = useCallback(() => {
    setStep(1);
    setDirection("forward");
    setName("");
    setTokenMint("");
    setTokenSymbol("SOL");
    setAmount("");
    setPeriod("daily");
    setIsSubmitting(false);
    setFormError("");
    setAgentId(null);
    setCopied(false);
    setCountdown(0);
    setCodeExpired(false);
    setIsGeneratingCode(false);
    setIsActivating(false);
    setActivationError("");
    setAgentConnected(false);
    activatingRef.current = false;
  }, []);

  const revokeAgent = useMutation(api.mutations.agents.revoke);

  const handleClose = useCallback(async () => {
    if (isSubmitting || isActivating) return;
    // If closing during step 2 before activation completes, revoke the agent
    if (step === 2 && agentId) {
      try {
        await revokeAgent({ agentId });
      } catch {
        // Best-effort cleanup
      }
    }
    onClose();
    resetState();
  }, [onClose, resetState, isSubmitting, isActivating, step, agentId, revokeAgent]);

  const isNextEnabled = name.trim().length > 0 && tokenMint.length > 0 && parseFloat(amount) > 0;

  const handleNext = useCallback(async () => {
    if (!isNextEnabled) return;
    setFormError("");
    setIsSubmitting(true);

    try {
      const result = await createAgent({
        workspaceId,
        name: name.trim(),
        budget: {
          tokenMint,
          limitAmount: parseFloat(amount),
          periodType: period,
        },
      });

      setAgentId(result.agentId);
      setDirection("forward");
      setStep(2);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create agent";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [isNextEnabled, createAgent, workspaceId, name, tokenMint, amount, period]);

  const handleGetNewCode = useCallback(async () => {
    if (!agentId) return;
    setIsGeneratingCode(true);
    try {
      await generateConnectCode({ agentId });
      setCodeExpired(false);
    } catch {
      // The query will pick up the new code reactively
    } finally {
      setIsGeneratingCode(false);
    }
  }, [agentId, generateConnectCode]);

  const handleCopy = useCallback(async () => {
    if (!connectCodeData?.connectCode) return;
    const command = `npx clawbank connect ${connectCodeData.connectCode}`;
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [connectCodeData?.connectCode]);

  const handleDone = useCallback(() => {
    onClose();
    resetState();
  }, [onClose, resetState]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} preventClose={isSubmitting}>
      <AnimatePresence mode="wait" initial={false}>
        {/* Step 1 — Name & Budget */}
        {step === 1 && (
          <motion.div
            key="step-1"
            initial={direction === "back" ? slideVariants.enterFromLeft : slideVariants.enterFromRight}
            animate={slideVariants.center}
            exit={slideVariants.exitToLeft}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <h2 className="mb-1 text-xl font-bold text-gray-900">Add Agent</h2>
            <p className="mb-6 text-sm text-gray-500">
              Name your agent and set its spending budget.
            </p>

            {/* Agent name */}
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Agent name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                if (e.target.value.length <= 32) {
                  setName(e.target.value);
                  if (formError) setFormError("");
                }
              }}
              placeholder="e.g. My Trading Bot"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-gray-400"
              autoFocus
              disabled={isSubmitting}
            />

            {/* Token + Amount row */}
            <div className="mt-4 flex gap-3">
              <TokenDropdown
                tokens={balanceData?.tokens ?? []}
                selectedMint={tokenMint}
                selectedSymbol={tokenSymbol}
                onSelect={(mint, symbol) => {
                  setTokenMint(mint);
                  setTokenSymbol(symbol);
                }}
                disabled={isSubmitting}
              />

              {/* Amount */}
              <div className="flex-1">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Amount
                </label>
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
            <PeriodSelector value={period} onChange={setPeriod} disabled={isSubmitting} />

            {/* Summary */}
            {name.trim() && parseFloat(amount) > 0 && (
              <p className="mt-4 text-sm text-gray-500">
                This agent can spend up to{" "}
                <span className="font-semibold text-gray-900">
                  {amount} {tokenSymbol}
                </span>{" "}
                per{" "}
                <span className="font-semibold text-gray-900">
                  {periodLabel(period)}
                </span>{" "}
                without approval.
              </p>
            )}

            {/* Error */}
            {formError && (
              <p className="mt-3 text-sm text-red-500">{formError}</p>
            )}

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
                whileHover={isSubmitting || !isNextEnabled ? {} : { scale: 1.02 }}
                whileTap={isSubmitting || !isNextEnabled ? {} : { scale: 0.95 }}
                onClick={() => void handleNext()}
                disabled={isSubmitting || !isNextEnabled}
              >
                {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                {isSubmitting ? "Creating..." : "Next"}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Step 2 — Connect Code */}
        {step === 2 && (
          <motion.div
            key="step-2"
            initial={direction === "forward" ? slideVariants.enterFromRight : slideVariants.enterFromLeft}
            animate={slideVariants.center}
            exit={slideVariants.exitToLeft}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <h2 className="mb-1 text-xl font-bold text-gray-900">
              {agentConnected
                ? "Activating Agent"
                : "Connect Your Agent"}
            </h2>
            <p className="mb-6 text-sm text-gray-500">
              {agentConnected
                ? activationError
                  ? "There was a problem during activation."
                  : "Setting up your agent's permissions..."
                : "Run this in your agent's terminal — that's it."}
            </p>

            {agentConnected ? (
              activationError ? (
                <div className="flex flex-col items-center gap-4 py-8">
                  <p className="text-center text-sm text-red-500">
                    {activationError}
                  </p>
                  <motion.button
                    className="flex cursor-pointer items-center gap-2 rounded-full bg-black px-6 py-2.5 font-medium text-white transition-colors hover:bg-gray-800"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleRetryActivation}
                  >
                    Retry
                  </motion.button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-12">
                  <Loader2 size={28} className="animate-spin text-gray-400" />
                  <span className="text-sm text-gray-500">
                    This may take a few seconds...
                  </span>
                </div>
              )
            ) : connectCodeData?.connectCode && !codeExpired ? (
              <>
                {/* CLI command */}
                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <code className="text-sm font-medium text-gray-900">
                    npx clawbank connect {connectCodeData.connectCode}
                  </code>
                </div>

                {/* Standalone code display */}
                <div className="mt-4 flex items-center justify-center rounded-xl bg-gray-50 px-6 py-4">
                  <span className="text-3xl font-mono tracking-widest text-gray-900">
                    {connectCodeData.connectCode}
                  </span>
                </div>

                {/* Timer + Copy */}
                <div className="mt-3 flex items-center justify-between">
                  <span
                    className={`text-sm ${
                      countdown < 60_000 ? "text-red-500" : "text-gray-500"
                    }`}
                  >
                    Expires in {formatCountdown(countdown)}
                  </span>
                  <motion.button
                    className="flex cursor-pointer items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => void handleCopy()}
                  >
                    {copied ? (
                      <>
                        <Check size={14} className="text-green-600" />
                        <span className="text-green-600">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        Copy
                      </>
                    )}
                  </motion.button>
                </div>

                {/* Waiting indicator */}
                <div className="mt-6 flex items-center justify-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
                  </span>
                  <span className="text-sm text-gray-500">
                    Waiting for agent to connect...
                  </span>
                </div>
              </>
            ) : codeExpired ? (
              /* Code expired state */
              <div className="flex flex-col items-center gap-4 py-8">
                <p className="text-sm font-medium text-gray-500">Code expired.</p>
                <motion.button
                  className="flex cursor-pointer items-center gap-2 rounded-full bg-black px-6 py-2.5 font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                  whileHover={isGeneratingCode ? {} : { scale: 1.02 }}
                  whileTap={isGeneratingCode ? {} : { scale: 0.95 }}
                  onClick={() => void handleGetNewCode()}
                  disabled={isGeneratingCode}
                >
                  {isGeneratingCode && <Loader2 size={16} className="animate-spin" />}
                  {isGeneratingCode ? "Generating..." : "Get New Code"}
                </motion.button>
              </div>
            ) : (
              /* Loading state */
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-gray-400" />
              </div>
            )}
          </motion.div>
        )}

        {/* Step 3 — Done */}
        {step === 3 && (
          <motion.div
            key="step-3"
            initial={slideVariants.enterFromRight}
            animate={slideVariants.center}
            exit={slideVariants.exitToRight}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="flex flex-col items-center text-center"
          >
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
            >
              <CheckCircle size={56} className="text-green-500" />
            </motion.div>

            <h2 className="mt-4 text-xl font-bold text-gray-900">
              Agent Activated
            </h2>

            <div className="mt-4 flex flex-col gap-1">
              <span className="font-semibold text-gray-900">
                {currentAgent?.name ?? name}
              </span>
              {currentAgent?.publicKey && (
                <span className="font-mono text-sm text-gray-500">
                  {truncateAddress(currentAgent.publicKey)}
                </span>
              )}
              <span className="text-sm text-gray-500">
                {amount} {tokenSymbol} / {periodLabel(period)}
              </span>
            </div>

            <div className="mt-8 w-full">
              <motion.button
                className="w-full cursor-pointer rounded-full bg-black px-6 py-2.5 font-medium text-white transition-colors hover:bg-gray-800"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleDone}
              >
                Done
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
