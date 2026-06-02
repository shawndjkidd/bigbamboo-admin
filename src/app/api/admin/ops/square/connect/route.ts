// Start the Square OAuth flow.
// User clicks "Connect Square" in the dashboard → we redirect to Square's authorize page.
import { NextRequest, NextResponse } from 'next/server'
import { squareAuthorizeUrl } from '@/lib/ops/square'
import crypto from 'crypto'

export async function GET(req: NextRequest) {
  // CSRF protection via state cookie
  const state = crypto.randomBytes(24).toString('hex')
  const res = NextResponse.redirect(squareAuthorizeUrl(state))
  res.cookies.set('square_oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/',
  })
  return res
}
