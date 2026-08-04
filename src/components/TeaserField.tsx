'use client'

export const MAX_TEASER_WORDS = 15

export function countWords(s: string): number {
  const t = (s || '').trim()
  return t ? t.split(/\s+/).length : 0
}

/** Keeps typing capped at MAX_TEASER_WORDS words without fighting the caret. */
export function clampWords(s: string, max: number = MAX_TEASER_WORDS): string {
  const words = (s || '').split(/\s+/).filter(Boolean)
  if (words.length <= max) return s
  return words.slice(0, max).join(' ')
}

type Props = {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  label?: string
  labelClass?: string
  hint?: string
  placeholder?: string
}

/**
 * One-line hook shown to promoters on the public calendar.
 * Hard-capped at 15 words with a live counter.
 */
export default function TeaserField({
  value,
  onChange,
  onBlur,
  label = 'Teaser',
  labelClass,
  hint = 'One line that makes people want in. Shown under the name on the public calendar.',
  placeholder = 'Vinyl, natural wine and zero pretension.',
}: Props) {
  const n = countWords(value)
  const atMax = n >= MAX_TEASER_WORDS

  function handleChange(next: string) {
    if (countWords(next) <= MAX_TEASER_WORDS) return onChange(next)
    // Over the limit. Typing one more character just gets refused — otherwise the
    // 16th word glues onto the 15th. A paste gets truncated instead of dropped.
    if (next.length <= (value || '').length + 1) return
    onChange(clampWords(next))
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
        <label
          className={labelClass}
          style={labelClass ? { marginBottom: 0 } : { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.01em' }}
        >
          {label}
        </label>
        <span
          aria-live="polite"
          style={{
            fontSize: 11,
            fontVariantNumeric: 'tabular-nums',
            color: atMax ? 'var(--accent)' : 'var(--text-muted)',
            fontWeight: atMax ? 600 : 400,
            whiteSpace: 'nowrap',
          }}
        >
          {n} / {MAX_TEASER_WORDS} words
        </span>
      </div>

      <textarea
        className="input"
        rows={2}
        value={value || ''}
        placeholder={placeholder}
        onChange={e => handleChange(e.target.value)}
        onBlur={onBlur}
        style={{ resize: 'vertical', lineHeight: 1.5 }}
      />

      <div style={{ fontSize: 11, color: atMax ? 'var(--accent)' : 'var(--text-muted)', marginTop: 5 }}>
        {atMax ? "That's the lot — 15 words max. Trim something to add more." : hint}
      </div>
    </div>
  )
}
