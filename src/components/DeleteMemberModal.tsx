import { motion } from 'motion/react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useAction } from 'convex/react'
import { toast } from 'sonner'
import { Modal } from './Modal'
import { api } from '../../convex/_generated/api'
import { Id } from '../../convex/_generated/dataModel'
import { useSignTransaction } from '~/hooks/useSignTransaction'
import { truncateAddress } from '~/utils/format'

interface DeleteMemberModalProps {
  isOpen: boolean
  memberAddress: string | null
  workspaceId: Id<"workspaces">
  onClose: () => void
}

export function DeleteMemberModal({
  isOpen,
  memberAddress,
  workspaceId,
  onClose,
}: DeleteMemberModalProps) {
  const buildRemoveMemberTx = useAction(api.actions.removeMember.buildRemoveMemberTx)
  const submitRemoveMemberTx = useAction(api.actions.removeMember.submitRemoveMemberTx)
  const tx = useSignTransaction()

  const handleClose = () => {
    if (tx.isProcessing) return
    tx.reset()
    onClose()
  }

  const handleConfirm = async () => {
    if (!memberAddress) return

    const success = await tx.execute({
      build: () =>
        buildRemoveMemberTx({ workspaceId, memberPublicKey: memberAddress }),
      submit: ({ signedTx }) =>
        submitRemoveMemberTx({ workspaceId, memberPublicKey: memberAddress, signedTx }),
    })

    if (success) {
      toast.success('Member removed successfully')
      onClose()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      preventClose={tx.isProcessing}
      maxWidth="max-w-sm"
    >
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <AlertTriangle size={24} className="text-red-500" />
        </div>

        <h3 className="mb-2 text-lg font-bold text-gray-900">
          Remove Member
        </h3>

        <p className="mb-6 text-sm text-gray-500">
          This will remove{' '}
          <span className="font-mono font-semibold text-gray-700">
            {memberAddress ? truncateAddress(memberAddress, 6) : ''}
          </span>{' '}
          from the workspace smart account. This action cannot be undone.
        </p>

        {tx.error && (
          <div className="mb-4 w-full rounded-lg bg-red-50 px-4 py-3 text-left text-sm text-red-700">
            {tx.error}
          </div>
        )}

        <div className="flex w-full gap-3">
          <motion.button
            className="flex-1 cursor-pointer rounded-full bg-gray-100 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
            whileTap={{ scale: 0.97 }}
            onClick={handleClose}
            disabled={tx.isProcessing}
          >
            Cancel
          </motion.button>
          <motion.button
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-red-500 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            whileTap={tx.isProcessing ? {} : { scale: 0.97 }}
            onClick={() => void handleConfirm()}
            disabled={tx.isProcessing}
          >
            {tx.isProcessing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {tx.statusLabel}
              </>
            ) : (
              'Remove'
            )}
          </motion.button>
        </div>
      </div>
    </Modal>
  )
}
