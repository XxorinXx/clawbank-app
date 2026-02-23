import { useState } from 'react'
import { motion } from 'motion/react'
import { User, Trash2, UserPlus, RefreshCw, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspaceMembers } from '~/hooks/useWorkspaceMembers'
import { Id } from '../../convex/_generated/dataModel'
import { DeleteMemberModal } from './DeleteMemberModal'
import { ListSkeleton } from './ui/ListSkeleton'
import { truncateAddress } from '~/utils/format'

function PermissionBadge({ label }: { label: string }) {
  return (
    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
      {label}
    </span>
  )
}

interface MembersTabProps {
  workspaceId: Id<"workspaces">
}

export function MembersTab({ workspaceId }: MembersTabProps) {
  const { members, isLoading, isSyncing, onchainError } =
    useWorkspaceMembers(workspaceId)
  const [deletingMember, setDeletingMember] = useState<string | null>(null)

  if (isLoading) {
    return <ListSkeleton />
  }

  const isSoleMember = members.length <= 1

  return (
    <div className="flex flex-col gap-2">
      {/* Syncing indicator */}
      {isSyncing && (
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          <RefreshCw size={12} className="animate-spin" />
          Syncing with on-chain data...
        </div>
      )}

      {/* On-chain fetch error warning */}
      {onchainError && !isSyncing && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle size={12} />
          Could not sync on-chain members. Showing cached data.
        </div>
      )}

      {/* Empty state */}
      {members.length === 0 && (
        <div className="flex flex-col items-center py-12 text-gray-400">
          <User size={32} className="mb-2" />
          <span className="text-sm">No members found</span>
        </div>
      )}

      {/* Member list */}
      {members.map((member) => (
        <div
          key={member.walletAddress}
          className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-gray-50"
        >
          {/* Avatar */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100">
            <User size={20} className="text-gray-400" />
          </div>

          {/* Name + roles */}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-gray-900">
                {truncateAddress(member.walletAddress, 6)}
              </span>
              {member.role === 'creator' && (
                <span className="rounded bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Creator
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {member.permissions ? (
                <>
                  {member.permissions.initiate && <PermissionBadge label="Initiate" />}
                  {member.permissions.vote && <PermissionBadge label="Vote" />}
                  {member.permissions.execute && <PermissionBadge label="Execute" />}
                </>
              ) : (
                <span className="text-[10px] text-gray-400">Permissions loading...</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {!isSoleMember && (
              <motion.button
                className="cursor-pointer rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                whileTap={{ scale: 0.9 }}
                onClick={() => setDeletingMember(member.walletAddress)}
                title="Remove member"
              >
                <Trash2 size={16} />
              </motion.button>
            )}
            <motion.button
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                isSoleMember
                  ? 'cursor-not-allowed bg-gray-50 text-gray-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              whileTap={isSoleMember ? {} : { scale: 0.95 }}
              disabled={isSoleMember}
              onClick={() => {
                if (!isSoleMember) toast('Manage member — coming soon')
              }}
            >
              Manage
            </motion.button>
          </div>
        </div>
      ))}

      {/* Add member button */}
      <motion.button
        className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 py-3 text-sm font-medium text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
        whileTap={{ scale: 0.98 }}
        onClick={() => toast('Add member — coming soon')}
      >
        <UserPlus size={16} />
        Add Member
      </motion.button>

      {/* Delete confirmation modal */}
      <DeleteMemberModal
        isOpen={!!deletingMember}
        memberAddress={deletingMember}
        workspaceId={workspaceId}
        onClose={() => setDeletingMember(null)}
      />
    </div>
  )
}
