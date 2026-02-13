import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { TokenIcon } from './TokenIcon'

interface TokenInfo {
  mint: string
  symbol: string
  name: string
  icon: string | null
  usdValue: number
}

interface BalanceHeaderProps {
  totalUsd: number
  tokens: TokenInfo[]
  onOpenModal: () => void
  onClose: () => void
}

function AnimatedUsd({ value }: { value: number }) {
  const [display, setDisplay] = useState(value)
  const ref = useRef({ value: display, raf: 0 })

  useEffect(() => {
    const start = ref.current.value
    const end = value
    const duration = 600
    const startTime = performance.now()

    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = start + (end - start) * eased
      ref.current.value = current
      setDisplay(current)
      if (progress < 1) {
        ref.current.raf = requestAnimationFrame(animate)
      }
    }

    const current = ref.current
    current.raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(current.raf)
  }, [value])

  return (
    <span className="text-3xl font-bold text-gray-900 tabular-nums">
      ${display.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  )
}

const ICON_SIZE = 24
const ICON_CLASS = 'h-6 w-6'
const MAX_VISIBLE = 3
const MIN_DISPLAY = 2
const OVERLAP = -(ICON_SIZE * 0.45)

function TokenIconStack({
  tokens,
  onOpenModal,
}: {
  tokens: TokenInfo[]
  onOpenModal: () => void
}) {
  const visible = tokens.slice(0, MAX_VISIBLE)
  const placeholderCount = Math.max(0, MIN_DISPLAY - visible.length)
  const extra = tokens.length - Math.min(tokens.length, MAX_VISIBLE)
  const totalSlots = visible.length + placeholderCount

  return (
    <motion.button
      className="flex cursor-pointer items-center gap-1.5 rounded-full bg-gray-50 px-2 py-1 transition-colors hover:bg-gray-100"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      onClick={onOpenModal}
    >
      <div className="flex items-center">
        {visible.map((token, i) => (
          <div
            key={token.mint}
            className="relative"
            style={{
              marginLeft: i === 0 ? 0 : OVERLAP,
              zIndex: totalSlots - i,
            }}
          >
            <TokenIcon
              icon={token.icon}
              className={`${ICON_CLASS} border-2 border-white`}
            />
          </div>
        ))}
        {Array.from({ length: placeholderCount }).map((_, i) => (
          <div
            key={`placeholder-${i}`}
            className="relative"
            style={{
              marginLeft: OVERLAP,
              zIndex: totalSlots - visible.length - i - 1,
            }}
          >
            <TokenIcon
              icon={null}
              className={`${ICON_CLASS} border-2 border-white`}
            />
          </div>
        ))}
      </div>
      {extra > 0 && (
        <span className="text-[11px] font-semibold text-gray-500">
          +{extra}
        </span>
      )}
    </motion.button>
  )
}

export function BalanceHeader({ totalUsd, tokens, onOpenModal, onClose }: BalanceHeaderProps) {
  if (tokens.length === 0 || totalUsd <= 0) {
    return null
  }

  return (
    <motion.div
      className="relative mb-6 rounded-2xl border border-gray-100 bg-white p-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <button
        className="absolute right-4 top-4 cursor-pointer rounded-full p-1 text-gray-400 transition-colors hover:text-gray-600"
        onClick={onClose}
      >
        <X size={16} />
      </button>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-500">Total balance</span>
          <TokenIconStack tokens={tokens} onOpenModal={onOpenModal} />
        </div>
        <AnimatedUsd value={totalUsd} />
      </div>
    </motion.div>
  )
}
