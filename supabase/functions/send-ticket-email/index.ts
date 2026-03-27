import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { order } = await req.json()
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')

    if (!RESEND_KEY) throw new Error('RESEND_API_KEY not set')
    if (!order?.email) throw new Error('No email on order')

    const shortId = 'BBQ-' + order.id.slice(0, 8).toUpperCase()
    const qrData = encodeURIComponent(`${shortId}|${order.name}|${order.event_title}`)
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}&color=1A0800&bgcolor=F5EED8`

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0E2220;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-size:36px;font-weight:900;letter-spacing:0.04em;color:#E8A820;">BigBamBoo</div>
      <div style="font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-top:4px;">Tropical Bar & Venue · An Phú, Saigon</div>
    </div>
    <div style="background:#F5EED8;border-radius:16px;overflow:hidden;margin-bottom:24px;">
      <div style="background:#2D5A52;padding:16px 24px;">
        <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.6);">Your Ticket</div>
        <div style="font-size:26px;font-weight:900;color:#F5EED8;letter-spacing:0.02em;margin-top:2px;">${order.event_title}</div>
      </div>
      <div style="padding:24px;text-align:center;">
        <img src="${qrUrl}" alt="Ticket QR Code" width="180" height="180" style="border-radius:8px;margin-bottom:16px;display:block;margin-left:auto;margin-right:auto;">
        <div style="font-size:20px;font-weight:700;color:#1A0800;margin-bottom:4px;">${order.name}</div>
        <div style="font-size:13px;color:#5A4030;margin-bottom:16px;">${order.quantity} ticket${order.quantity > 1 ? 's' : ''}</div>
        <div style="border-top:2px dashed #C0A880;margin:16px 0;"></div>
        <div style="font-size:13px;font-weight:700;letter-spacing:0.1em;color:#B03A14;">${shortId}</div>
        <div style="font-size:11px;color:#8A7060;margin-top:4px;">Show this at the door</div>
      </div>
      <div style="background:#2D5A52;padding:12px 24px;text-align:center;">
        <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.6);">bigbamboo.app · 0347 393 293</div>
      </div>
    </div>
    <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:20px;margin-bottom:24px;">
      <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:12px;">What to bring</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.7);line-height:1.8;">
        ✓ &nbsp;This email or a screenshot of your QR code<br>
        ✓ &nbsp;Your name: <strong style="color:#F5EED8;">${order.name}</strong><br>
        ✓ &nbsp;A good mood 🌴
      </div>
    </div>
    <div style="text-align:center;font-size:11px;color:rgba(255,255,255,0.25);line-height:1.8;">
      Questions? Zalo / WhatsApp: 0347 393 293<br>
      An Phú, Thủ Đức, TP. Hồ Chí Minh<br><br>
      <a href="https://bigbamboo.app" style="color:#E8A820;text-decoration:none;">bigbamboo.app</a>
    </div>
  </div>
</body>
</html>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'BigBamBoo Tickets <tickets@bigbamboo.app>',
        to: [order.email],
        subject: `🎟 Your ticket to ${order.event_title}`,
        html,
      }),
    })

    const result = await res.json()
    if (!res.ok) throw new Error(result.message || 'Resend error')

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
