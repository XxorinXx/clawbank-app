import { Modal } from './Modal'
import { motion } from 'motion/react'
import { TokenIcon } from './TokenIcon'
import { formatUsd } from '~/utils/format'

interface TokenInfo {
  mint: string
  symbol: string
  name: string
  icon: string | null
  usdValue: number
}

interface TokenListModalProps {
  isOpen: boolean
  onClose: () => void
  tokens: TokenInfo[]
}

export function TokenListModal({ isOpen, onClose, tokens }: TokenListModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-sm">
      <div className="flex flex-col">
        <h2 className="mb-4 text-lg font-bold text-gray-900">Tokens</h2>

        <div className="custom-scrollbar -mx-2 max-h-[60vh] overflow-y-auto px-2">
          {tokens.map((token) => (
            <div
              key={token.mint}
              className="flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-gray-50"
            >
              <TokenIcon icon={token.icon} className="h-10 w-10 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-gray-900">
                  {token.name}
                </span>
                <span className="text-xs text-gray-500">{token.symbol}</span>
              </div>
              <span className="shrink-0 text-sm font-medium text-gray-900">
                {formatUsd(token.usdValue)}
              </span>
            </div>
          ))}
        </div>

        <motion.button
          className="mt-4 w-full cursor-pointer rounded-full bg-black py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-gray-800"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            // Stub - send flow not implemented yet
          }}
        >
          Send
        </motion.button>
      </div>
    </Modal>
  )
}
