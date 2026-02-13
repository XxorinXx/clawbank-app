import { type ReactNode, useCallback } from 'react'
import { cn } from '~/utils/cn'

export interface TabItem {
  key: string
  label: string
  icon?: ReactNode
}

interface DrawerTabsProps {
  items: TabItem[]
  activeKey: string
  onChange: (key: string) => void
  rightSlot?: ReactNode
  children: ReactNode
}

export function DrawerTabs({
  items,
  activeKey,
  onChange,
  rightSlot,
  children,
}: DrawerTabsProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      let nextIndex: number | null = null
      if (e.key === 'ArrowRight') {
        nextIndex = (index + 1) % items.length
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (index - 1 + items.length) % items.length
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onChange(items[index].key)
        return
      }
      if (nextIndex !== null) {
        e.preventDefault()
        onChange(items[nextIndex].key)
        const tabEl = (e.currentTarget.parentElement as HTMLElement)?.children[
          nextIndex
        ] as HTMLElement | undefined
        tabEl?.focus()
      }
    },
    [items, onChange],
  )

  return (
    <div className="flex flex-col">
      <div className="flex items-center border-b border-gray-100">
        <div className="flex gap-1" role="tablist">
          {items.map((item, index) => {
            const isActive = item.key === activeKey
            return (
              <button
                key={item.key}
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors outline-none',
                  isActive
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-400 hover:text-gray-600',
                )}
                onClick={() => onChange(item.key)}
                onKeyDown={(e) => handleKeyDown(e, index)}
              >
                {item.icon}
                {item.label}
              </button>
            )
          })}
        </div>
        {rightSlot && <div className="ml-auto">{rightSlot}</div>}
      </div>
      <div role="tabpanel" className="pt-4">
        {children}
      </div>
    </div>
  )
}
