/**
 * Sets default wifi_network / wifi_password on jukebox_settings.
 *
 * Run AFTER adding the columns in Supabase SQL editor:
 *   ALTER TABLE jukebox_settings ADD COLUMN IF NOT EXISTS wifi_network text;
 *   ALTER TABLE jukebox_settings ADD COLUMN IF NOT EXISTS wifi_password text;
 *
 * Usage:
 *   node scripts/seed-wifi.mjs
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '../.env.local')

let env = {}
try {
  env = Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split('\n')
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => {
        const idx = l.indexOf('=')
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, '')]
      })
  )
} catch {
  console.error('Could not read .env.local — make sure you run this from the project root.')
  process.exit(1)
}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env.local')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

const { data, error } = await sb
  .from('jukebox_settings')
  .update({ wifi_network: 'BigBamBoo_Guest', wifi_password: 'tropicalvibes' })
  .is('wifi_network', null)  // only set if not already populated

if (error) {
  if (error.message.includes('column') && error.message.includes('does not exist')) {
    console.error('Column missing. Run this SQL in the Supabase SQL editor first:\n')
    console.error('  ALTER TABLE jukebox_settings ADD COLUMN IF NOT EXISTS wifi_network text;')
    console.error('  ALTER TABLE jukebox_settings ADD COLUMN IF NOT EXISTS wifi_password text;\n')
    console.error('Then re-run: node scripts/seed-wifi.mjs')
  } else {
    console.error('Error:', error.message)
  }
  process.exit(1)
}

console.log('✓ wifi_network = BigBamBoo_Guest')
console.log('✓ wifi_password = tropicalvibes')
console.log('Edit anytime in the jukebox admin → Settings → Display info.')
