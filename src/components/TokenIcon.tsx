import { Coins } from 'lucide-react'
import { cn } from '~/utils/cn'

interface TokenIconProps {
  icon?: string | null
  className?: string
  alt?: string
  style?: React.CSSProperties
}

export function TokenIcon({
  icon,
  style,
  className = 'h-7 w-7',
}: TokenIconProps) {
  return icon && icon !== '' ? (
    <img
      src={icon}
      draggable={false}
      className={cn(
        'rounded-full select-none object-cover',
        className,
      )}
      style={style}
      onError={(e) => {
        e.currentTarget.style.display = 'none'
        e.currentTarget.nextElementSibling?.classList.remove('hidden')
      }}
    />
  ) : (
    <div
      className={cn(
        'flex items-center select-none justify-center rounded-full bg-gray-100 border border-gray-200',
        className,
        'p-1.5',
      )}
      style={style}
    >
      <Coins className="h-full w-full text-gray-400" />
    </div>
  )
}
