// src/components/ui/loading.tsx
import { ReactNode } from 'react'

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  children?: ReactNode
}

export function Loading({ size = 'md', className = '', children }: LoadingProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8', 
    lg: 'h-12 w-12'
  }

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className={`animate-spin rounded-full border-b-2 border-blue-600 ${sizeClasses[size]}`}></div>
      {children && (
        <span className="ml-2 text-gray-600">{children}</span>
      )}
    </div>
  )
}

export function LoadingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loading size="lg">Loading...</Loading>
    </div>
  )
}