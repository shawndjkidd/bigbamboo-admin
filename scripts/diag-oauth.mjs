import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local if present (simple key=value parser, no dotenv needed)
const envLocalPath = resolve(new URL('.', import.meta.url).pathname, '../.env.local');
if (existsSync(envLocalPath)) {
  const lines = readFileSync(envLocalPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1); // preserve raw value including any trailing whitespace
    if (!(key in process.env)) process.env[key] = val;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';

function hasTrailingWhitespace(val) {
  return val.length !== val.trim().length;
}

const envChecks = {
  NEXT_PUBLIC_SUPABASE_URL: {
    present: !!SUPABASE_URL,
    hasTrailingWhitespace: hasTrailingWhitespace(SUPABASE_URL),
    length: SUPABASE_URL.length,
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    present: !!SERVICE_ROLE_KEY,
    hasTrailingWhitespace: hasTrailingWhitespace(SERVICE_ROLE_KEY),
    length: SERVICE_ROLE_KEY.length,
  },
  SPOTIFY_CLIENT_ID: {
    present: !!SPOTIFY_CLIENT_ID,
    hasTrailingWhitespace: hasTrailingWhitespace(SPOTIFY_CLIENT_ID),
    length: SPOTIFY_CLIENT_ID.length,
  },
  SPOTIFY_CLIENT_SECRET: {
    present: !!SPOTIFY_CLIENT_SECRET,
    hasTrailingWhitespace: hasTrailingWhitespace(SPOTIFY_CLIENT_SECRET),
    length: SPOTIFY_CLIENT_SECRET.length,
  },
};

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.log(JSON.stringify({ error: 'Missing SUPABASE URL or SERVICE_ROLE_KEY', envChecks }, null, 2));
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await supabase
  .from('jukebox_provider_auth')
  .select('*')
  .eq('venue_id', 'bigbamboo');

if (error) {
  console.log(JSON.stringify({ error: error.message, code: error.code, envChecks }, null, 2));
  process.exit(1);
}

const rows = (data || []).map(row => ({
  id: row.id,
  venue_id: row.venue_id,
  provider: row.provider,
  is_connected: row.is_connected,
  created_at: row.created_at,
  updated_at: row.updated_at,
  expires_at: row.expires_at,
  has_access_token: !!row.access_token,
  has_refresh_token: !!row.refresh_token,
  access_token_length: row.access_token ? String(row.access_token).length : 0,
  refresh_token_length: row.refresh_token ? String(row.refresh_token).length : 0,
}));

console.log(JSON.stringify({ row_count: rows.length, rows, envChecks }, null, 2));
