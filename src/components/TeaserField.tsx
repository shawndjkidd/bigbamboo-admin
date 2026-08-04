'use client'
import { useT } from '@/i18n/admin'

export const MAX_TEASER_WORDS = 15

export function countWords(s: string): number {
  const t = (s || '').trim()
  return t ? t.split(/\s+/).length : 0
}

/** Keeps a pasted value inside the word cap without mangling it. */
export function clampWords(s: string, max: number = MAX_TEASER_WORDS): string {
  const words = (s || '').split(/\s+/).filter(Boolean)
  if (words.length <= max) return s
  return words.slice(0, max).join(' ')
}

type Props = {
  value: string
  onChange: (v: string) => void
  valueVi?: string
  onChangeVi?: (v: string) => void
  onBlur?: () => void
  labelClass?: string
}

/**
 * The one-liner shown under an event name on the public calendar.
 * English and Vietnamese, each hard-capped at 15 words with its own counter.
 */
export default function TeaserField({
  value,
  onChange,
  valueVi,
  onChangeVi,
  onBlur,
  labelClass,
}: Props) {
  const { t } = useT()

  return (
    <div style={{ marginBottom: 16 }}>
      <One
        label={t.teaser.labelEn}
        labelClass={labelClass}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        hint={t.teaser.hint}
        atMaxText={t.teaser.atMax}
        wordsText={t.teaser.words}
        placeholder={t.teaser.placeholder}
      />
      {onChangeVi && (
        <One
          label={t.teaser.labelVi}
          labelClass={labelClass}
          value={valueVi || ''}
          onChange={onChangeVi}
          onBlur={onBlur}
          hint={t.teaser.hintVi}
          atMaxText={t.teaser.atMax}
          wordsText={t.teaser.words}
          placeholder={t.teaser.placeholderVi}
        />
      )}
    </div>
  )
}

function One({
  label, labelClass, value, onChange, onBlur, hint, atMaxText, wordsText, placeholder,
}: {
  label: string
  labelClass?: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  hint: string
  atMaxText: string
  wordsText: (n: number, max: number) => string
  placeholder: string
}) {
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
    <div style={{ marginBottom: 14 }}>
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
          {wordsText(n, MAX_TEASER_WORDS)}
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
        {atMax ? atMaxText : hint}
      </div>
    </div>
  )
}
