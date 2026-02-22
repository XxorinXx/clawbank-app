import { useState } from 'react'
import { motion } from 'motion/react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useAction } from 'convex/react'
import { useSolanaWallets } from '@privy-io/react-auth'
import { VersionedTransaction } from '@solana/web3.js'
import { toast } from 'sonner'
import { Modal } from './Modal'
import { api } from '../../convex/_generated/api'
import { Id } from '../../convex/_generated/dataModel'

type FlowState = 'confirming' | 'building' | 'signing' | 'submitting' | 'error'

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
  const buildRemoveMemberTx = useAction(api.actions.removeMember.buildRemoveMemberTx)
  const submitRemoveMemberTx = useAction(api.actions.removeMember.submitRemoveMemberTx)
  const { wallets: solanaWallets } = useSolanaWallets()

  const isProcessing = state === 'building' || state === 'signing' || state === 'submitting'

  const handleClose = () => {
    if (isProcessing) return
    setState('confirming')
    setErrorMsg(null)
    onClose()
  }

  const handleConfirm = async () => {
    if (!memberAddress) return
    setState('building')
    setErrorMsg(null)

    try {
      // Step 1: Build the transaction
      const { serializedTx } = await buildRemoveMemberTx({
        workspaceId,
        memberPublicKey: memberAddress,
      })

      // Step 2: Sign with user's Privy wallet
      setState('signing')
      const txBytes = Uint8Array.from(atob(serializedTx), (c) => c.charCodeAt(0))
      const tx = VersionedTransaction.deserialize(txBytes)

      const wallet = solanaWallets[0]
      if (!wallet) throw new Error('No Solana wallet found')
      const signedTx = await wallet.signTransaction(tx)
      const signedBase64 = btoa(String.fromCharCode(...signedTx.serialize()))

      // Step 3: Submit on-chain + reconcile DB
      setState('submitting')
      await submitRemoveMemberTx({
        workspaceId,
        memberPublicKey: memberAddress,
        signedTx: signedBase64,
      })

      toast.success('Member removed successfully')
      setState('confirming')
      onClose()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove member'
      setState('error')
      setErrorMsg(message)
    }
  }

  const statusLabel = state === 'building'
    ? 'Building...'
    : state === 'signing'
      ? 'Signing...'
      : state === 'submitting'
        ? 'Removing...'
        : 'Remove'

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      preventClose={isProcessing}
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
            disabled={isProcessing}
          >
            Cancel
          </motion.button>
          <motion.button
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-red-500 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            whileTap={isProcessing ? {} : { scale: 0.97 }}
            onClick={() => void handleConfirm()}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {statusLabel}
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
