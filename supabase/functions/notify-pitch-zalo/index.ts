// supabase/functions/notify-pitch-zalo/index.ts
// Fires when a new event pitch is submitted
// Sends a Zalo OA message to Shawn's personal number via Zalo API
// Also sends a WhatsApp fallback via wa.me link in the message

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const payload = await req.json()
    // This function is called via Supabase Database Webhook on INSERT to event_pitches
    const pitch = payload.record

    if (!pitch) throw new Error('No pitch data in payload')

    const ZALO_TOKEN = Deno.env.get('ZALO_OA_TOKEN')
    const SHAWN_ZALO_ID = Deno.env.get('SHAWN_ZALO_USER_ID') // Shawn's Zalo user ID
    const ADMIN_URL = 'https://admin.bigbamboo.app/dashboard/pitches'

    const has = (v: boolean) => v ? '✓' : '—'
    const got = [
      pitch.has_performers && 'Performers',
      pitch.has_vendors && 'Vendors',
      pitch.has_sponsors && 'Sponsors',
      pitch.has_photographer && 'Photographer',
      pitch.has_marketing && 'Marketing',
    ].filter(Boolean).join(', ') || 'Nothing confirmed yet'

    const needs = [
      pitch.needs_sound && 'Sound',
      pitch.needs_bar && 'Bar',
      pitch.needs_food_bar && 'Food+Bar',
      pitch.needs_production && 'Production',
      pitch.needs_ticketing && 'Ticketing',
      pitch.needs_marketing && 'Marketing',
    ].filter(Boolean).join(', ') || 'Not specified'

    const msg = [
      '🎉 NEW EVENT PITCH',
      '',
      `📌 ${pitch.event_name}`,
      `🎭 ${pitch.event_type}`,
      `👤 ${pitch.name}`,
      `📱 ${pitch.whatsapp || pitch.email || '—'}`,
      `👥 ${pitch.expected_attendance || '?'} people expected`,
      `📅 ${pitch.preferred_day || 'Day flexible'} · ${pitch.how_far_out || '?'}`,
      '',
      `✅ Has: ${got}`,
      `🙏 Needs: ${needs}`,
      '',
      `🔗 View full pitch:`,
      ADMIN_URL,
    ].join('\n')

    // Send via Zalo OA API if token available
    if (ZALO_TOKEN && SHAWN_ZALO_ID) {
      await fetch('https://openapi.zalo.me/v2.0/oa/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': ZALO_TOKEN,
        },
        body: JSON.stringify({
          recipient: { user_id: SHAWN_ZALO_ID },
          message: { text: msg }
        })
      })
    }

    // Always send via Resend email as reliable fallback
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
    if (RESEND_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'BigBamBoo Pitches <tickets@bigbamboo.app>',
          to: ['shawndjkidd@gmail.com'],
          subject: `🎉 New Event Pitch: ${pitch.event_name} (${pitch.event_type})`,
          html: `<pre style="font-family:monospace;font-size:14px;line-height:1.7;background:#0E2220;color:#F5EED8;padding:24px;border-radius:12px">${msg.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</pre>
          <br><a href="${ADMIN_URL}" style="background:#E8A820;color:#1a0800;padding:12px 28px;border-radius:100px;text-decoration:none;font-weight:700;font-family:sans-serif">View Full Pitch →</a>`
        })
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
