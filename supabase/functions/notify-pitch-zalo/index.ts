// supabase/functions/notify-pitch-zalo/index.ts
// Fires when a new event pitch is submitted.
// Sends a Zalo OA message if credentials are present, and always emails via Resend.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const payload = await req.json()
    // Called by the on_event_pitch_created trigger on public.event_pitches
    const pitch = payload.record

    if (!pitch) throw new Error('No pitch data in payload')

    const ZALO_TOKEN = Deno.env.get('ZALO_OA_TOKEN')
    const SHAWN_ZALO_ID = Deno.env.get('SHAWN_ZALO_USER_ID')
    const ADMIN_URL = 'https://admin.bigbamboo.app/dashboard/pitches'

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
      'NEW EVENT PITCH',
      '',
      `Event:    ${pitch.event_name}`,
      `Type:     ${pitch.event_type}`,
      `From:     ${pitch.name}`,
      `Contact:  ${pitch.whatsapp || pitch.email || '-'}`,
      `Crowd:    ${pitch.expected_attendance || '?'} expected`,
      `Timing:   ${pitch.preferred_day || 'Day flexible'} - ${pitch.how_far_out || '?'}`,
      '',
      `Has:      ${got}`,
      `Needs:    ${needs}`,
      '',
      'View full pitch:',
      ADMIN_URL,
    ].join('\n')

    const results: Record<string, unknown> = {}

    // Zalo OA — only fires once both secrets exist.
    // NOTE: Zalo OA access tokens expire after 1 hour, so a static ZALO_OA_TOKEN
    // secret stops working almost immediately. Making this durable needs the
    // refresh-token rotation flow, not a fixed secret.
    if (ZALO_TOKEN && SHAWN_ZALO_ID) {
      try {
        const z = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'access_token': ZALO_TOKEN },
          body: JSON.stringify({
            recipient: { user_id: SHAWN_ZALO_ID },
            message: { text: msg },
          }),
        })
        results.zalo = await z.json().catch(() => ({ status: z.status }))
      } catch (e) {
        results.zalo = { error: String(e) }
      }
    } else {
      results.zalo = 'skipped - ZALO_OA_TOKEN / SHAWN_ZALO_USER_ID not set'
    }

    // Email via Resend — the dependable channel.
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
    if (RESEND_KEY) {
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'BigBamBoo Pitches <tickets@bigbamboo.app>',
          to: ['shawndjkidd@gmail.com'],
          reply_to: pitch.email || undefined,
          subject: `New event pitch: ${pitch.event_name} (${pitch.event_type})`,
          html:
            `<pre style="font-family:ui-monospace,monospace;font-size:14px;line-height:1.7;background:#0E2220;color:#F5EED8;padding:24px;border-radius:12px;white-space:pre-wrap">${esc(msg)}</pre>` +
            `<br><a href="${ADMIN_URL}" style="background:#E8A820;color:#1a0800;padding:12px 28px;border-radius:100px;text-decoration:none;font-weight:700;font-family:sans-serif">View full pitch</a>`,
        }),
      })
      results.email = await r.json().catch(() => ({ status: r.status }))
    } else {
      results.email = 'skipped - RESEND_API_KEY not set'
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
