import { type ReactNode } from 'react'

interface TabPlaceholderProps {
  icon: ReactNode
  label: string
}

export function TabPlaceholder({ icon, label }: TabPlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
        {icon}
      </div>
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}
