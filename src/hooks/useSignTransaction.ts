import { useState, useCallback } from "react";
import { useSolanaWallets } from "@privy-io/react-auth";
import { VersionedTransaction } from "@solana/web3.js";

type TransactionStatus = "idle" | "building" | "signing" | "submitting";

interface UseSignTransactionReturn {
  status: TransactionStatus;
  error: string | null;
  isProcessing: boolean;
  statusLabel: string;
  execute: <T>(opts: {
    build: () => Promise<{ serializedTx: string; createKey?: string } & T>;
    submit: (args: { signedTx: string; createKey?: string } & T) => Promise<void>;
  }) => Promise<boolean>;
  reset: () => void;
}

const STATUS_LABELS: Record<TransactionStatus, string> = {
  idle: "",
  building: "Building...",
  signing: "Signing...",
  submitting: "Submitting...",
};

/**
 * Encapsulates the 3-step build → sign → submit on-chain transaction pattern.
 * Returns execute() which resolves to true on success, false on error.
 */
export function useSignTransaction(): UseSignTransactionReturn {
  const { wallets: solanaWallets } = useSolanaWallets();
  const [status, setStatus] = useState<TransactionStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  const execute = useCallback(
    async <T,>(opts: {
      build: () => Promise<{ serializedTx: string; createKey?: string } & T>;
      submit: (args: { signedTx: string; createKey?: string } & T) => Promise<void>;
    }): Promise<boolean> => {
      setStatus("building");
      setError(null);

      try {
        const buildResult = await opts.build();

        setStatus("signing");
        const txBytes = Uint8Array.from(atob(buildResult.serializedTx), (c) =>
          c.charCodeAt(0),
        );
        const tx = VersionedTransaction.deserialize(txBytes);

        const wallet = solanaWallets[0];
        if (!wallet) throw new Error("No Solana wallet found");
        const signedTx = await wallet.signTransaction(tx);
        const signedBase64 = btoa(
          String.fromCharCode(...signedTx.serialize()),
        );

        setStatus("submitting");
        await opts.submit({ ...buildResult, signedTx: signedBase64 });

        setStatus("idle");
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Transaction failed";
        setError(message);
        setStatus("idle");
        return false;
      }
    },
    [solanaWallets],
  );

  return {
    status,
    error,
    isProcessing: status !== "idle",
    statusLabel: STATUS_LABELS[status],
    execute,
    reset,
  };
}
