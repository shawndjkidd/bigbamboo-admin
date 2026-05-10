'use client'

import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost'
export type ButtonSize = 'md' | 'sm'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:   'admin-btn admin-btn--primary',
  secondary: 'admin-btn admin-btn--secondary',
  danger:    'admin-btn admin-btn--danger',
  success:   'admin-btn admin-btn--success',
  ghost:     'admin-btn admin-btn--ghost',
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  md: 'admin-btn--md',
  sm: 'admin-btn--sm',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({ variant = 'secondary', size = 'sm', className, ...props }: ButtonProps) {
  const cls = [VARIANT_CLASS[variant], SIZE_CLASS[size], className].filter(Boolean).join(' ')
  return <button className={cls} {...props} />
}
