import { supabase } from './supabase'

export async function signIn(email: string, password: string) {
  // Sign in via Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
  if (authError) throw authError

  // Look up staff user record
  const { data: staff, error: staffError } = await supabase
    .from('staff_users')
    .select('*')
    .eq('email', email)
    .eq('active', true)
    .single()

  if (staffError || !staff) throw new Error('No staff account found for this email.')
  return staff
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getCurrentStaff() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: staff } = await supabase
    .from('staff_users')
    .select('*')
    .eq('email', user.email)
    .eq('active', true)
    .single()

  return staff
}
