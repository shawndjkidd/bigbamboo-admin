'use client'

import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: number | string
}

export function Card({ padding = 18, style, className, ...props }: CardProps) {
  return (
    <div
      className={['card', className].filter(Boolean).join(' ')}
      style={{ padding, ...style }}
      {...props}
    />
  )
}
