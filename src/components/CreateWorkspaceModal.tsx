import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus, Loader2, X } from "lucide-react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { Modal } from "~/components/Modal";

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

const slideVariants = {
  enterFromRight: { x: 80, opacity: 0 },
  enterFromLeft: { x: -80, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exitToLeft: { x: -80, opacity: 0 },
  exitToRight: { x: 80, opacity: 0 },
};

export function CreateWorkspaceModal({ isOpen, onClose }: CreateWorkspaceModalProps) {
  const createWorkspace = useAction(api.actions.createWorkspace.createWorkspace);
  const [step, setStep] = useState<1 | 2>(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [memberInput, setMemberInput] = useState("");
  const [memberError, setMemberError] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetState = useCallback(() => {
    setStep(1);
    setDirection("forward");
    setName("");
    setNameError("");
    setMemberInput("");
    setMemberError("");
    setMembers([]);
    setIsSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    onClose();
    resetState();
  }, [onClose, resetState, isSubmitting]);

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
    setIsSubmitting(true);
    try {
      await createWorkspace({
        name: name.trim(),
        members: members.map((m) => ({ type: m.type, value: m.value })),
      });
      toast.success("Workspace created");
      onClose();
      resetState();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create workspace";
      toast.error(message);
      setIsSubmitting(false);
    }
  }, [name, members, createWorkspace, onClose, resetState]);

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
    <Modal isOpen={isOpen} onClose={handleClose} preventClose={isSubmitting}>
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

            <div className="mt-8 flex items-center justify-between">
              <motion.button
                className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleClose}
              >
                Cancel
              </motion.button>
              <motion.button
                className="cursor-pointer rounded-full bg-black px-6 py-2.5 font-medium text-white transition-colors hover:bg-gray-800"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleNext}
              >
                Next
              </motion.button>
            </div>
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
                disabled={isSubmitting}
              />
              <motion.button
                className="flex cursor-pointer items-center gap-1 rounded-full bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleAddMember}
                disabled={isSubmitting}
              >
                <Plus size={16} />
                Add
              </motion.button>
            </div>
            {memberError && <p className="mt-1.5 text-sm text-red-500">{memberError}</p>}

            {/* Member list */}
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
                      disabled={isSubmitting}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8 flex items-center justify-between">
              <motion.button
                className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleBack}
                disabled={isSubmitting}
              >
                Back
              </motion.button>
              <motion.button
                className="flex cursor-pointer items-center gap-2 rounded-full bg-black px-6 py-2.5 font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                whileHover={isSubmitting ? {} : { scale: 1.02 }}
                whileTap={isSubmitting ? {} : { scale: 0.95 }}
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
              >
                {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                {isSubmitting ? "Creating..." : "Create workspace"}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
