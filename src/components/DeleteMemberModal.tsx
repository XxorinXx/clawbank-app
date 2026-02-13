import { useState } from 'react'
import { motion } from 'motion/react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useAction } from 'convex/react'
import { toast } from 'sonner'
import { Modal } from './Modal'
import { api } from '../../convex/_generated/api'
import { Id } from '../../convex/_generated/dataModel'

type FlowState = 'confirming' | 'submitting' | 'error'

function truncateAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

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
  const [state, setState] = useState<FlowState>('confirming')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const removeMember = useAction(api.actions.removeMember.removeMember)

  const handleClose = () => {
    if (state === 'submitting') return
    setState('confirming')
    setErrorMsg(null)
    onClose()
  }

  const handleConfirm = async () => {
    if (!memberAddress) return
    setState('submitting')
    setErrorMsg(null)

    try {
      const result = await removeMember({
        workspaceId,
        memberPublicKey: memberAddress,
      })

      if (result.status === 'executed') {
        toast.success('Member removed successfully')
      } else {
        toast.success('Removal proposal created — awaiting approval')
      }

      setState('confirming')
      onClose()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove member'
      setState('error')
      setErrorMsg(message)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      preventClose={state === 'submitting'}
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
          This will create a proposal to remove{' '}
          <span className="font-mono font-semibold text-gray-700">
            {memberAddress ? truncateAddress(memberAddress) : ''}
          </span>{' '}
          from the workspace multisig. This action cannot be undone.
        </p>

        {/* Error message */}
        {state === 'error' && errorMsg && (
          <div className="mb-4 w-full rounded-lg bg-red-50 px-4 py-3 text-left text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="flex w-full gap-3">
          <motion.button
            className="flex-1 cursor-pointer rounded-full bg-gray-100 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
            whileTap={{ scale: 0.97 }}
            onClick={handleClose}
            disabled={state === 'submitting'}
          >
            Cancel
          </motion.button>
          <motion.button
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-red-500 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            whileTap={state === 'submitting' ? {} : { scale: 0.97 }}
            onClick={() => void handleConfirm()}
            disabled={state === 'submitting'}
          >
            {state === 'submitting' ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Removing...
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
