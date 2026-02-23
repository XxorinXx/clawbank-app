import { type ReactNode } from 'react'
import { EmptyState } from './ui/EmptyState'

interface TabPlaceholderProps {
  icon: ReactNode
  label: string
}

export function TabPlaceholder({ icon, label }: TabPlaceholderProps) {
  return <EmptyState icon={icon} title={label} />
}
