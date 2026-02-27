import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus, X } from "lucide-react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { Modal } from "~/components/Modal";
import { ModalActions } from "~/components/ui/ModalActions";
import { useSignTransaction } from "~/hooks/useSignTransaction";
import { slideVariants } from "~/utils/animations";

interface Member {
  value: string;
  type: "email" | "wallet";
}

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function validateMemberInput(input: string): { valid: boolean; type: "email" | "wallet"; error?: string } {
  if (EMAIL_REGEX.test(input)) {
    return { valid: true, type: "email" };
  }
  if (BASE58_REGEX.test(input)) {
    return { valid: true, type: "wallet" };
  }
  if (input.includes("@")) {
    return { valid: false, type: "email", error: "Invalid email address" };
  }
  return { valid: false, type: "wallet", error: "Invalid wallet address" };
}

function truncateValue(value: string): string {
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function CreateWorkspaceModal({ isOpen, onClose }: CreateWorkspaceModalProps) {
  const buildCreateWorkspaceTx = useAction(api.actions.createWorkspace.buildCreateWorkspaceTx);
  const submitCreateWorkspaceTx = useAction(api.actions.createWorkspace.submitCreateWorkspaceTx);
  const tx = useSignTransaction();

  const [step, setStep] = useState<1 | 2>(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [memberInput, setMemberInput] = useState("");
  const [memberError, setMemberError] = useState("");
  const [members, setMembers] = useState<Member[]>([]);

  const resetState = useCallback(() => {
    setStep(1);
    setDirection("forward");
    setName("");
    setNameError("");
    setMemberInput("");
    setMemberError("");
    setMembers([]);
    tx.reset();
  }, [tx]);

  const handleClose = useCallback(() => {
    if (tx.isProcessing) return;
    onClose();
    resetState();
  }, [onClose, resetState, tx.isProcessing]);

  const handleNext = useCallback(() => {
    if (!name.trim()) {
      setNameError("Workspace name is required");
      return;
    }
    setNameError("");
    setDirection("forward");
    setStep(2);
  }, [name]);

  const handleBack = useCallback(() => {
    setDirection("back");
    setStep(1);
  }, []);

  const handleAddMember = useCallback(() => {
    const trimmed = memberInput.trim();
    if (!trimmed) return;

    const result = validateMemberInput(trimmed);
    if (!result.valid) {
      setMemberError(result.error ?? "Invalid input");
      return;
    }

    const isDuplicate = members.some((m) => m.value.toLowerCase() === trimmed.toLowerCase());
    if (isDuplicate) {
      setMemberError("Member already added");
      return;
    }

    setMembers((prev) => [...prev, { value: trimmed, type: result.type }]);
    setMemberInput("");
    setMemberError("");
  }, [memberInput, members]);

  const handleRemoveMember = useCallback((index: number) => {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(async () => {
    const memberArgs = members.map((m) => ({ type: m.type, value: m.value }));
    const trimmedName = name.trim();

    const success = await tx.execute({
      build: () =>
        buildCreateWorkspaceTx({ name: trimmedName, members: memberArgs }),
      submit: ({ signedTx, settingsAddress }) =>
        submitCreateWorkspaceTx({
          name: trimmedName,
          members: memberArgs,
          signedTx,
          settingsAddress: settingsAddress!,
        }),
    });

    if (success) {
      toast.success("Workspace created");
      onClose();
      resetState();
    }
  }, [name, members, buildCreateWorkspaceTx, submitCreateWorkspaceTx, tx, onClose, resetState]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (step === 1) {
          handleNext();
        } else {
          if (memberInput.trim()) {
            handleAddMember();
          }
        }
      }
    },
    [step, handleNext, handleAddMember, memberInput],
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} preventClose={tx.isProcessing}>
      <AnimatePresence mode="wait" initial={false}>
        {step === 1 && (
          <motion.div
            key="step-1"
            initial={direction === "back" ? slideVariants.enterFromLeft : slideVariants.enterFromRight}
            animate={slideVariants.center}
            exit={slideVariants.exitToLeft}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <h2 className="mb-6 text-xl font-bold text-gray-900">Create Workspace</h2>

            <label className="mb-2 block text-sm font-medium text-gray-700">Workspace name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder="My Workspace"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-gray-400"
              autoFocus
            />
            {nameError && <p className="mt-1.5 text-sm text-red-500">{nameError}</p>}

            <ModalActions
              onCancel={handleClose}
              onConfirm={handleNext}
              confirmLabel="Next"
            />
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step-2"
            initial={direction === "forward" ? slideVariants.enterFromRight : slideVariants.enterFromLeft}
            animate={slideVariants.center}
            exit={slideVariants.exitToRight}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <h2 className="mb-6 text-xl font-bold text-gray-900">Add Members</h2>

            <div className="flex gap-2">
              <input
                type="text"
                value={memberInput}
                onChange={(e) => {
                  setMemberInput(e.target.value);
                  if (memberError) setMemberError("");
                }}
                onKeyDown={handleKeyDown}
                placeholder="Email or Solana wallet address"
                className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-gray-400"
                autoFocus
                disabled={tx.isProcessing}
              />
              <motion.button
                className="flex cursor-pointer items-center gap-1 rounded-full bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleAddMember}
                disabled={tx.isProcessing}
              >
                <Plus size={16} />
                Add
              </motion.button>
            </div>
            {memberError && <p className="mt-1.5 text-sm text-red-500">{memberError}</p>}

            {members.length > 0 && (
              <div className="mt-4 flex max-h-40 flex-col gap-2 overflow-y-auto">
                {members.map((member, index) => (
                  <div
                    key={member.value}
                    className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-700">{truncateValue(member.value)}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          member.type === "email"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-purple-100 text-purple-700"
                        }`}
                      >
                        {member.type === "email" ? "Email" : "Wallet"}
                      </span>
                    </div>
                    <button
                      className="cursor-pointer rounded-full p-1 text-gray-400 transition-colors hover:text-gray-600"
                      onClick={() => handleRemoveMember(index)}
                      disabled={tx.isProcessing}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {tx.error && <p className="mt-3 text-sm text-red-500">{tx.error}</p>}

            <ModalActions
              onCancel={handleBack}
              onConfirm={() => void handleSubmit()}
              cancelLabel="Back"
              confirmLabel="Create workspace"
              loadingLabel={tx.statusLabel || "Creating..."}
              isLoading={tx.isProcessing}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
