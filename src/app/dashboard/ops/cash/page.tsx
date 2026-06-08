'use client'
import { useEffect, useMemo, useState } from 'react'
import { ops, vnd, today, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

type Acct = { account_id: string; name: string; kind: string; balance: number }
type Mv = { id: string; occurred_at: string; account_id: string; amount: number; type: string; group_id: string | null; bag_id: string | null; person: string | null; note: string | null }
type Week = { id: string; week_start: string; status: string; built_total: number; deposited_total: number; opened_at: string | null; closed_at: string | null }
type Bag = {
  id: string; week_id: string; business_date: string; weekday: number; label: string | null
  built_amount: number; pos_cash: number | null; sales: number; payouts: number
  counted: number | null; over_short: number | null; person: string | null
  location: string; status: string; opened_at: string | null; closed_at: string | null
}
type Tpl = { weekday: number; amount: number; active: boolean }

const TYPE_LABEL: Record<string, string> = {
  drop: 'Cash drop (Till → Safe)', deposit: 'Bank deposit (Safe → bank)', bank_in: 'Bank cash in (bank → Safe)',
  expense: 'Cash expense', refund: 'Cash refund', adjust: 'Adjustment',
  bag_out: 'Bag → Till', bag_in: 'Bag → Safe', cash_sale: 'Cash sales',
  float_issue: 'Float issued', float_return: 'Float returned',
  day_open: 'Day open — float to till', day_close: 'Day close — swept to safe',
}
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const weekdayOf = (d: string) => new Date(d + 'T12:00:00').getDay()
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// Monday that starts the week containing dateStr
const weekStartOf = (dateStr: string) => {
  const t = new Date(dateStr + 'T12:00:00'); const off = (t.getDay() + 6) % 7
  const m = new Date(t); m.setDate(t.getDate() - off); return fmt(m)
}
// the date for a given weekday within the week beginning on monStr
const dateForWeekday = (monStr: string, weekday: number) => {
  const m = new Date(monStr + 'T12:00:00'); const off = (weekday + 6) % 7
  const d = new Date(m); d.setDate(m.getDate() + off); return fmt(d)
}
// VND notes, largest first
const NOTES = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000]
type Denoms = Record<string, number>
const denomTotal = (d: Denoms) => NOTES.reduce((s, n) => s + n * (Number(d[n]) || 0), 0)

export default function CashPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [accts, setAccts] = useState<Acct[]>([])
  const [moves, setMoves] = useState<Mv[]>([])
  const [week, setWeek] = useState<Week | null>(null)
  const [bags, setBags] = useState<Bag[]>([])
  const [template, setTemplate] = useState<Tpl[]>([])
  const [tab, setTab] = useState<string>('')

  // build-week overrides {weekday: amount}
  const [buildOverride, setBuildOverride] = useState<Record<number, string>>({})
  const [showTpl, setShowTpl] = useState(false)

  // per-bag return inputs
  const [retInputs, setRetInputs] = useState<Record<string, { counted: string; pos: string; person: string }>>({})
  const [takePerson, setTakePerson] = useState<Record<string, string>>({})

  // add an extra (event) bag
  const [addDate, setAddDate] = useState(''); const [addLabel, setAddLabel] = useState(''); const [addAmt, setAddAmt] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  // record-a-movement
  const [mvType, setMvType] = useState('drop'); const [mvAcct, setMvAcct] = useState(''); const [mvAmt, setMvAmt] = useState(''); const [mvNote, setMvNote] = useState('')

  // edit a movement (super-admin)
  const [editId, setEditId] = useState<string | null>(null); const [eAmt, setEAmt] = useState(''); const [eNote, setENote] = useState('')
  const [setBal, setSetBal] = useState('')

  // denominations + float builder
  const [safeCount, setSafeCount] = useState<Record<string, string>>({})
  const [recipe, setRecipe] = useState<Record<string, string>>({})
  const [nBags, setNBags] = useState('')
  const [showDenom, setShowDenom] = useState(false)

  // history (closed weeks)
  const [histWeeks, setHistWeeks] = useState<Week[]>([])
  const [histBags, setHistBags] = useState<Bag[]>([])
  const [showHist, setShowHist] = useState(false)

  useEffect(() => { init() }, [])
  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user; if (!user) return
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).maybeSingle()
    setRole((su?.role || 'staff') as StaffRole)
    const { data: venue } = await supabase.from('venues').select('id').eq('slug', 'bigbamboo').single()
    setVenueId(venue?.id || null)
    await load(venue?.id || null)
    setLoading(false)
  }
  async function load(vid: string | null) {
    if (!vid) return
    const monday = weekStartOf(today())
    const [{ data: a }, { data: m }, { data: tpl }, { data: wk }] = await Promise.all([
      ops().from('v_cash_balances').select('*').eq('venue_id', vid),
      ops().from('cash_movements').select('id, occurred_at, account_id, amount, type, group_id, bag_id, person, note').eq('venue_id', vid).order('occurred_at', { ascending: true }).limit(500),
      ops().from('float_template').select('weekday, amount, active').eq('venue_id', vid).order('weekday'),
      ops().from('float_week').select('*').eq('venue_id', vid).eq('week_start', monday).maybeSingle(),
    ])
    const accts2 = (a as Acct[]) || []
    setAccts(accts2); setMoves((m as Mv[]) || []); setTemplate((tpl as Tpl[]) || [])
    setWeek((wk as Week) || null)
    if (wk) {
      const { data: bg } = await ops().from('float_bag').select('*').eq('week_id', (wk as Week).id).order('business_date')
      setBags((bg as Bag[]) || [])
    } else setBags([])
    if (!tab && accts2.length) setTab(accts2.find(x => x.kind === 'safe')?.account_id || accts2[0].account_id)

    // history: recent closed weeks + their bags
    const { data: hw } = await ops().from('float_week').select('*').eq('venue_id', vid).eq('status', 'closed').order('week_start', { ascending: false }).limit(8)
    setHistWeeks((hw as Week[]) || [])
    const ids = ((hw as Week[]) || []).map(w => w.id)
    if (ids.length) {
      const { data: hb } = await ops().from('float_bag').select('*').in('week_id', ids).order('business_date')
      setHistBags((hb as Bag[]) || [])
    } else setHistBags([])

    // latest saved denomination count + float recipe
    const [{ data: sc }, { data: rc }] = await Promise.all([
      ops().from('cash_count').select('denoms').eq('venue_id', vid).eq('context', 'safe_count').order('counted_at', { ascending: false }).limit(1).maybeSingle(),
      ops().from('cash_count').select('denoms').eq('venue_id', vid).eq('context', 'float_recipe').order('counted_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    const toStr = (d: any) => { const o: Record<string, string> = {}; if (d) for (const k of Object.keys(d)) o[k] = String(d[k]); return o }
    if (sc?.denoms) setSafeCount(toStr(sc.denoms))
    if (rc?.denoms) setRecipe(toStr(rc.denoms))
  }

  const num = (s: string) => Number((s || '').replace(/[^\d-]/g, '')) || 0
  const safe = accts.find(a => a.kind === 'safe')
  const till = accts.find(a => a.kind === 'till')
  const acctName = (id: string) => accts.find(a => a.account_id === id)?.name || '—'
  const isSuper = role === 'super_admin'
  const canOp = !!role && canManageRecipes(role) // manager or above runs daily + weekly ops

  // bag contents = what cash is physically in the bag right now
  const bagContents = (b: Bag) => b.status === 'returned' ? Number(b.counted || 0) : Number(b.built_amount)
  const activeBags = bags.filter(b => b.status !== 'deposited')
  const inBags = activeBags.reduce((s, b) => s + bagContents(b), 0)
  const bagsInSafe = activeBags.filter(b => b.location === 'safe').reduce((s, b) => s + bagContents(b), 0)
  const loose = (safe?.balance || 0) - bagsInSafe
  const totalOnHand = (safe?.balance || 0) + (till?.balance || 0)
  const bagOut = activeBags.find(b => b.status === 'out')

  const statement = useMemo(() => {
    const rows = moves.filter(m => m.account_id === tab)
    let bal = 0
    const withBal = rows.map(m => { bal += Number(m.amount); return { ...m, balance: bal } })
    return withBal.reverse()
  }, [moves, tab])

  // ───────────────────────────── operating-day template ─────────────────────────────
  async function saveTpl(weekday: number, patch: Partial<Tpl>) {
    const cur = template.find(t => t.weekday === weekday) || { weekday, amount: 0, active: false }
    await ops().from('float_template').upsert({ venue_id: venueId, weekday, amount: cur.amount, active: cur.active, ...patch }, { onConflict: 'venue_id,weekday' })
    await load(venueId)
  }
  const tpl = (wd: number) => template.find(t => t.weekday === wd) || { weekday: wd, amount: 0, active: false }
  const openDays = template.filter(t => t.active && Number(t.amount) > 0).sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7))

  // ───────────────────────────── build the week ─────────────────────────────
  const buildTotal = openDays.reduce((s, d) => s + (num(buildOverride[d.weekday] || '') || Number(d.amount)), 0)
  async function buildWeek() {
    if (!venueId) return
    if (week) { setMsg('This week is already built.'); return }
    if (openDays.length === 0) { setMsg('Turn on operating days and set their floats first (Operating days).'); return }
    const monday = weekStartOf(today())
    const { data: wk, error } = await ops().from('float_week').insert({ venue_id: venueId, week_start: monday, built_total: buildTotal, created_by: role }).select('*').single()
    if (error) { setMsg(error.message); return }
    const rows = openDays.map(d => ({
      venue_id: venueId, week_id: (wk as Week).id, business_date: dateForWeekday(monday, d.weekday),
      weekday: d.weekday, label: WD_LONG[d.weekday], built_amount: num(buildOverride[d.weekday] || '') || Number(d.amount), status: 'pending', location: 'safe',
    }))
    const { error: e2 } = await ops().from('float_bag').insert(rows)
    if (e2) { setMsg(e2.message); return }
    setBuildOverride({}); setMsg(`✓ Built ${rows.length} bags for the week (${vnd(buildTotal)}). They sit in the Safe until used.`); await load(venueId)
  }

  async function addBag() {
    if (!venueId || !week) return
    const amt = num(addAmt); if (!amt) { setMsg('Enter the extra bag amount'); return }
    const d = addDate || today()
    const { error } = await ops().from('float_bag').insert({
      venue_id: venueId, week_id: week.id, business_date: d, weekday: weekdayOf(d),
      label: addLabel.trim() || 'Extra float', built_amount: amt, status: 'pending', location: 'safe',
    })
    if (error) { setMsg(error.message); return }
    setAddDate(''); setAddLabel(''); setAddAmt(''); setShowAdd(false); setMsg('✓ Extra bag added.'); await load(venueId)
  }

  // ───────────────────────────── daily: take to till / return ─────────────────────────────
  async function takeToTill(b: Bag) {
    if (!venueId || !safe || !till) return
    if (bagOut) { setMsg(`Return ${bagOut.label || 'the open bag'} before taking another to the till.`); return }
    const g = crypto.randomUUID()
    const { error } = await ops().from('cash_movements').insert([
      { venue_id: venueId, account_id: safe.account_id, amount: -Number(b.built_amount), type: 'bag_out', group_id: g, bag_id: b.id, person: takePerson[b.id]?.trim() || null, note: `${b.label} float to till` },
      { venue_id: venueId, account_id: till.account_id, amount: Number(b.built_amount), type: 'bag_out', group_id: g, bag_id: b.id, person: takePerson[b.id]?.trim() || null, note: `${b.label} float from safe` },
    ])
    if (error) { setMsg(error.message); return }
    await ops().from('float_bag').update({ status: 'out', location: 'till', person: takePerson[b.id]?.trim() || null, opened_at: new Date().toISOString() }).eq('id', b.id)
    setMsg(null); await load(venueId)
  }
  const ri = (id: string) => retInputs[id] || { counted: '', pos: '', person: '' }
  function setRi(id: string, patch: any) { setRetInputs(p => ({ ...p, [id]: { ...ri(id), ...patch } })) }

  async function returnBag(b: Bag) {
    if (!venueId || !safe || !till) return
    const inp = ri(b.id); const counted = num(inp.counted)
    if (!counted) { setMsg('Enter the counted total for ' + (b.label || b.business_date)); return }
    const pos = inp.pos === '' ? null : num(inp.pos)
    const sales = counted - Number(b.built_amount)
    const over = pos == null ? null : counted - (Number(b.built_amount) + pos)
    if (sales !== 0) await ops().from('cash_movements').insert({ venue_id: venueId, account_id: till.account_id, amount: sales, type: 'cash_sale', bag_id: b.id, note: `Cash sales ${b.business_date}` })
    const g = crypto.randomUUID()
    await ops().from('cash_movements').insert([
      { venue_id: venueId, account_id: till.account_id, amount: -counted, type: 'bag_in', group_id: g, bag_id: b.id, note: `${b.label} returned to safe` },
      { venue_id: venueId, account_id: safe.account_id, amount: counted, type: 'bag_in', group_id: g, bag_id: b.id, note: `${b.label} into safe` },
    ])
    await ops().from('float_bag').update({ status: 'returned', location: 'safe', counted, sales, pos_cash: pos, over_short: over, person: inp.person.trim() || b.person, closed_at: new Date().toISOString() }).eq('id', b.id)
    setMsg(over == null ? `✓ ${b.label} returned — ${vnd(sales)} cash sales banked into the bag.` : over === 0 ? `✓ ${b.label} balanced exactly vs POS.` : `${b.label} returned — ${over > 0 ? 'over' : 'short'} ${vnd(Math.abs(over))} vs POS.`)
    await load(venueId)
  }

  // ───────────────────────────── deposit & close week ─────────────────────────────
  async function closeWeek() {
    if (!venueId || !week) return
    const stillOut = activeBags.some(b => b.status === 'out')
    if (stillOut) { setMsg('Return the bag that is still in the till before closing the week.'); return }
    if (!confirm(`Close this week? The ${activeBags.length} bags (${vnd(inBags)}) empty back into the Safe as loose cash, ready to deposit at the bank and rebuild next week.`)) return
    await ops().from('float_bag').update({ status: 'deposited' }).eq('week_id', week.id).neq('status', 'deposited')
    await ops().from('float_week').update({ status: 'closed', deposited_total: inBags, closed_at: new Date().toISOString() }).eq('id', week.id)
    setMsg(`✓ Week closed. ${vnd(inBags)} is now loose in the Safe — bank it (Bank deposit) and build next week's floats.`)
    await load(venueId)
  }

  // ───────────────────────────── generic movement ─────────────────────────────
  async function record() {
    if (!venueId || !safe) return
    const a = num(mvAmt); if (!a) { setMsg('Enter an amount'); return }
    let rows: any[] = []
    if (mvType === 'drop') { if (!till) return; const g = crypto.randomUUID(); rows = [{ account_id: till.account_id, amount: -Math.abs(a), type: 'drop', group_id: g, note: mvNote.trim() || 'Till → Safe' }, { account_id: safe.account_id, amount: Math.abs(a), type: 'drop', group_id: g, note: mvNote.trim() || 'Till → Safe' }] }
    else if (mvType === 'deposit') { rows = [{ account_id: safe.account_id, amount: -Math.abs(a), type: 'deposit', note: mvNote.trim() || 'Bank deposit' }] }
    else if (mvType === 'bank_in') { rows = [{ account_id: safe.account_id, amount: Math.abs(a), type: 'bank_in', note: mvNote.trim() || 'Cash from bank' }] }
    else if (mvType === 'expense') { if (!mvAcct) { setMsg('Pick which account it came out of'); return } rows = [{ account_id: mvAcct, amount: -Math.abs(a), type: 'expense', note: mvNote.trim() || 'Cash expense' }] }
    else if (mvType === 'adjust') { if (!isSuper) { setMsg('Adjustments are super-admin only.'); return } if (!mvAcct) { setMsg('Pick which account'); return } rows = [{ account_id: mvAcct, amount: a, type: 'adjust', note: mvNote.trim() || 'Adjustment' }] }
    else if (mvType === 'refund') {
      if (!till) return
      const day = today()
      const { error: e1 } = await ops().from('cash_movements').insert({ venue_id: venueId, account_id: till.account_id, amount: -Math.abs(a), type: 'refund', note: mvNote.trim() || 'Cash refund' })
      if (e1) { setMsg(e1.message); return }
      // lower that day's net sales — kept on a separate 'other_pos' row so the nightly Square sync won't overwrite it
      const { data: ex } = await ops().from('sales_daily').select('refunds').eq('venue_id', venueId).eq('occurred_on', day).eq('source', 'other_pos').maybeSingle()
      if (ex) await ops().from('sales_daily').update({ refunds: Number(ex.refunds || 0) + Math.abs(a) }).eq('venue_id', venueId).eq('occurred_on', day).eq('source', 'other_pos')
      else await ops().from('sales_daily').insert({ venue_id: venueId, occurred_on: day, source: 'other_pos', gross: 0, refunds: Math.abs(a) })
      setMvAmt(''); setMvNote(''); setMsg('✓ Refund recorded — cash out of the Till and net sales reduced.'); await load(venueId)
      return
    }
    const { error } = await ops().from('cash_movements').insert(rows.map(r => ({ venue_id: venueId, ...r })))
    if (error) { setMsg(error.message); return }
    setMvAmt(''); setMvNote(''); setMsg(null); await load(venueId)
  }

  // ───────────────────────────── super-admin corrections ─────────────────────────────
  async function setBalance() {
    if (!venueId || !tab || !isSuper) return
    const target = num(setBal); const cur = accts.find(a => a.account_id === tab)?.balance || 0
    const delta = target - cur
    if (delta === 0) { setMsg('Already at that amount.'); return }
    const { error } = await ops().from('cash_movements').insert({ venue_id: venueId, account_id: tab, amount: delta, type: 'adjust', note: 'Set balance (count)' })
    if (error) { setMsg(error.message); return }
    setSetBal(''); setMsg(`✓ ${acctName(tab)} set to ${vnd(target)}.`); await load(venueId)
  }
  function startEdit(m: Mv) { setEditId(m.id); setEAmt(String(Math.abs(Number(m.amount)))); setENote(m.note || ''); setMsg(null) }
  async function saveEdit(m: Mv) {
    const A = num(eAmt); if (!A) { setMsg('Enter an amount'); return }
    const signed = (Number(m.amount) < 0 ? -1 : 1) * Math.abs(A)
    await ops().from('cash_movements').update({ amount: signed, note: eNote.trim() || null }).eq('id', m.id)
    if (m.group_id) await ops().from('cash_movements').update({ amount: -signed, note: eNote.trim() || null }).eq('group_id', m.group_id).neq('id', m.id)
    setEditId(null); await load(venueId)
  }
  async function delMove(m: Mv) {
    if (!confirm('Delete this movement?')) return
    if (m.group_id) await ops().from('cash_movements').delete().eq('group_id', m.group_id)
    else await ops().from('cash_movements').delete().eq('id', m.id)
    await load(venueId)
  }
  async function delBag(b: Bag) {
    if (!confirm(`Delete the ${b.label} bag and its cash movements? (super-admin)`)) return
    await ops().from('cash_movements').delete().eq('bag_id', b.id)
    await ops().from('float_bag').delete().eq('id', b.id)
    await load(venueId)
  }
  async function resetWeek() {
    if (!week || !confirm('Reset this week — delete every bag and all their cash movements for the week? This cannot be undone. (super-admin)')) return
    for (const b of bags) await ops().from('cash_movements').delete().eq('bag_id', b.id)
    await ops().from('float_week').delete().eq('id', week.id)
    setMsg('Week reset.'); await load(venueId)
  }

  // ───────────────────────────── denominations + float builder ─────────────────────────────
  const safeCountDenoms: Denoms = NOTES.reduce((o, n) => ({ ...o, [n]: num(safeCount[n] || '') }), {})
  const recipeDenoms: Denoms = NOTES.reduce((o, n) => ({ ...o, [n]: num(recipe[n] || '') }), {})
  const safeCountTotal = denomTotal(safeCountDenoms)
  const recipeTotal = denomTotal(recipeDenoms)
  const bagsToBuild = num(nBags) || openDays.length
  const safeRecorded = safe?.balance || 0
  const countDiff = safeCountTotal - safeRecorded

  async function saveSafeCount() {
    if (!venueId) return
    await ops().from('cash_count').insert({ venue_id: venueId, context: 'safe_count', denoms: safeCountDenoms, total: safeCountTotal, person: role })
    setMsg(`✓ Safe count saved (${vnd(safeCountTotal)}).${countDiff !== 0 ? ` That is ${countDiff > 0 ? 'over' : 'under'} the recorded balance by ${vnd(Math.abs(countDiff))}.` : ''}`)
  }
  async function saveRecipe() {
    if (!venueId) return
    await ops().from('cash_count').insert({ venue_id: venueId, context: 'float_recipe', denoms: recipeDenoms, total: recipeTotal })
    setMsg(`✓ Float recipe saved — ${vnd(recipeTotal)} per bag.`)
  }
  async function setSafeToCount() {
    if (!venueId || !safe || !isSuper) return
    if (countDiff === 0) { setMsg('Safe already matches the count.'); return }
    await ops().from('cash_movements').insert({ venue_id: venueId, account_id: safe.account_id, amount: countDiff, type: 'adjust', note: `Set Safe to counted (${vnd(safeCountTotal)})` })
    setMsg(`✓ Safe corrected to the counted ${vnd(safeCountTotal)}.`); await load(venueId)
  }
  const histByWeek = (wid: string) => histBags.filter(b => b.week_id === wid)

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>
  if (!canOp) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Cash management is for managers and above.</div>
  const locked = (t: string) => t === 'bag_out' || t === 'bag_in' || t === 'float_issue' || t === 'float_return'
  const statusChip = (s: string) => s === 'pending' ? { t: 'in safe', c: 'var(--text-muted,#999)' } : s === 'out' ? { t: 'in till', c: 'var(--accent,#e87830)' } : s === 'returned' ? { t: 'back in safe', c: '#548235' } : { t: 'deposited', c: 'var(--text-muted,#bbb)' }

  return (
    <div style={{ maxWidth: 880 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600 }}>Cash management</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 18 }}>
        Each weekday is a float bag that lives in the Safe. Take a bag to the till for the day, count it back in at close — its takings stay in the bag. At week's end, deposit the lot and build fresh bags. {isSuper ? 'You are super-admin: you can build, run, deposit, and correct anything.' : 'You can build and run the week; only super-admin can edit or delete history.'}
      </div>

      {/* summary */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <Card label="Total on hand" value={vnd(totalOnHand)} accent />
        <Card label="Safe" value={vnd(safe?.balance || 0)} />
        <Card label="Till (active)" value={vnd(till?.balance || 0)} />
        <Card label="In float bags" value={vnd(inBags)} />
        <Card label="Loose (not bagged)" value={vnd(loose)} warn={loose < 0} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted,#aaa)', marginBottom: 20 }}>
        Total = Safe + Till. “In float bags” and “Loose” are how the Safe splits up. {loose < 0 && <b style={{ color: 'var(--burgundy,#7b2d3a)' }}>Loose is negative — bring cash in from the bank to fund the bags.</b>}
      </div>

      {/* THIS WEEK */}
      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          <div style={hdr}>This week — float bags <span style={tagAcct}>accounting</span></div>
          <div style={{ fontSize: 12, color: 'var(--text-muted,#999)' }}>week of {weekStartOf(today())}</div>
        </div>

        {!week && (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary,#555)', marginBottom: 10 }}>
              No bags built for this week yet. Operating days: {openDays.length ? openDays.map(d => WD[d.weekday]).join(', ') : <i>none set</i>}.
            </div>
            {openDays.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px,1fr))', gap: 8, marginBottom: 10 }}>
                {openDays.map(d => (
                  <div key={d.weekday}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted,#999)', marginBottom: 3 }}>{WD[d.weekday]}</div>
                    <input inputMode="numeric" defaultValue={String(d.amount)} onChange={e => setBuildOverride(p => ({ ...p, [d.weekday]: e.target.value }))} style={{ ...inp, width: '100%' }} />
                  </div>
                ))}
              </div>
            )}
            <div style={row}>
              <button onClick={buildWeek} style={btn} disabled={!openDays.length}>Build week — {vnd(buildTotal)}</button>
              <span style={{ fontSize: 12, color: 'var(--text-muted,#999)' }}>Pulls from loose Safe cash. Adjust a day above for events/busier nights.</span>
            </div>
          </div>
        )}

        {week && (
          <div>
            <div style={{ display: 'grid', gap: 8 }}>
              {bags.map(b => {
                const chip = statusChip(b.status); const isToday = b.business_date === today()
                return (
                  <div key={b.id} style={{ border: '1px solid var(--border,#eee)', borderRadius: 8, padding: '10px 12px', background: isToday ? 'var(--bg-sidebar,#fafafa)' : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                      <div style={{ width: 150 }}>
                        <b>{b.label}</b> <span style={{ fontSize: 11, color: 'var(--text-muted,#999)' }}>{b.business_date.slice(5)}</span>
                        <div style={{ fontSize: 11, color: chip.c, fontWeight: 600 }}>{chip.t}</div>
                      </div>
                      <div style={{ fontSize: 13, minWidth: 110 }}>float <b>{vnd(b.built_amount)}</b></div>

                      {b.status === 'pending' && (
                        <>
                          <input value={takePerson[b.id] || ''} onChange={e => setTakePerson(p => ({ ...p, [b.id]: e.target.value }))} style={{ ...inp, width: 110 }} placeholder="who (opt)" />
                          <button onClick={() => takeToTill(b)} style={btn}>Take to till →</button>
                        </>
                      )}
                      {b.status === 'out' && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input inputMode="numeric" value={ri(b.id).pos} onChange={e => setRi(b.id, { pos: e.target.value })} style={{ ...inp, width: 120 }} placeholder="POS cash (opt)" />
                          <input inputMode="numeric" value={ri(b.id).counted} onChange={e => setRi(b.id, { counted: e.target.value })} style={{ ...inp, width: 130 }} placeholder="counted total" />
                          <button onClick={() => returnBag(b)} style={btn}>Count & return →</button>
                          {ri(b.id).counted !== '' && <span style={{ fontSize: 12, color: 'var(--text-muted,#777)' }}>sales {vnd(num(ri(b.id).counted) - Number(b.built_amount))}{ri(b.id).pos !== '' && <> · vs POS <b>{vnd(num(ri(b.id).counted) - (Number(b.built_amount) + num(ri(b.id).pos)))}</b></>}</span>}
                        </div>
                      )}
                      {b.status === 'returned' && (
                        <span style={{ fontSize: 13, color: 'var(--text-secondary,#555)' }}>
                          counted <b>{vnd(b.counted)}</b> · sales {vnd(b.sales)}{b.over_short != null && <> · <span style={{ color: !b.over_short ? '#548235' : 'var(--burgundy,#7b2d3a)' }}>{!b.over_short ? 'balanced' : `${b.over_short > 0 ? 'over' : 'short'} ${vnd(Math.abs(b.over_short))}`}</span></>}
                          {b.person ? ` · ${b.person}` : ''}
                        </span>
                      )}
                      {isSuper && b.status !== 'deposited' && <button onClick={() => delBag(b)} style={{ ...btnLink, marginLeft: 'auto' }} title="Delete bag (super-admin)">×</button>}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ ...row, marginTop: 12 }}>
              <button onClick={() => setShowAdd(s => !s)} style={{ ...btnLink, fontWeight: 600, color: 'var(--accent,#e87830)' }}>{showAdd ? 'Cancel' : '+ Add an extra / event bag'}</button>
              <div style={{ flex: 1 }} />
              <button onClick={closeWeek} style={{ ...btn, background: 'var(--burgundy,#7b2d3a)' }}>Deposit & close week</button>
              {isSuper && <button onClick={resetWeek} style={{ ...btnLink, color: 'var(--burgundy,#7b2d3a)' }}>Reset week</button>}
            </div>
            {showAdd && (
              <div style={{ ...row, marginTop: 8 }}>
                <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} style={{ ...inp, width: 150 }} />
                <input value={addLabel} onChange={e => setAddLabel(e.target.value)} style={{ ...inp, width: 150 }} placeholder="label (e.g. Event)" />
                <input inputMode="numeric" value={addAmt} onChange={e => setAddAmt(e.target.value)} style={{ ...inp, width: 120 }} placeholder="amount" />
                <button onClick={addBag} style={btn}>Add bag</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* operating days */}
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={hdr}>Operating days &amp; default floats <span style={tagAcct}>accounting</span></div>
          <button onClick={() => setShowTpl(s => !s)} style={{ ...btnLink, fontWeight: 600, color: 'var(--accent,#e87830)' }}>{showTpl ? 'Hide' : 'Edit'}</button>
        </div>
        {!showTpl && <div style={{ fontSize: 13, color: 'var(--text-secondary,#555)', marginTop: 4 }}>Open: {openDays.length ? openDays.map(d => `${WD[d.weekday]} ${vnd(d.amount)}`).join(' · ') : <i>none — turn days on to build a week</i>}</div>}
        {showTpl && (
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {[1, 2, 3, 4, 5, 6, 0].map(wd => {
              const t = tpl(wd)
              return (
                <div key={wd} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, width: 110, fontSize: 14 }}>
                    <input type="checkbox" checked={!!t.active} onChange={e => saveTpl(wd, { active: e.target.checked })} /> {WD_LONG[wd]}
                  </label>
                  <input inputMode="numeric" defaultValue={String(t.amount)} onBlur={e => saveTpl(wd, { amount: num(e.target.value) })} style={{ ...inp, width: 140 }} placeholder="float amount" disabled={!t.active} />
                  {!t.active && <span style={{ fontSize: 12, color: 'var(--text-muted,#bbb)' }}>closed</span>}
                </div>
              )
            })}
            <div style={{ fontSize: 11, color: 'var(--text-muted,#999)', marginTop: 4 }}>Turn a day on and set its standard float. As you grow from 2–3 to 5–6 days, just switch more days on.</div>
          </div>
        )}
      </div>

      {/* denominations + float builder */}
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={hdr}>Count notes &amp; build floats <span style={tagAcct}>accounting</span></div>
          <button onClick={() => setShowDenom(s => !s)} style={{ ...btnLink, fontWeight: 600, color: 'var(--accent,#e87830)' }}>{showDenom ? 'Hide' : 'Open'}</button>
        </div>
        {!showDenom && <div style={{ fontSize: 13, color: 'var(--text-secondary,#555)', marginTop: 4 }}>Counted safe: <b>{vnd(safeCountTotal)}</b> · per-bag recipe: <b>{vnd(recipeTotal)}</b></div>}
        {showDenom && (
          <div style={{ marginTop: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, maxWidth: 560 }}>
              <thead><tr style={{ background: 'var(--bg-sidebar,#fafafa)' }}>
                <th style={th}>Note</th>
                <th style={{ ...th, textAlign: 'right' }}>In safe (qty)</th>
                <th style={{ ...th, textAlign: 'right' }}>= value</th>
                <th style={{ ...th, textAlign: 'right' }}>Per bag (qty)</th>
                <th style={{ ...th, textAlign: 'right' }}>Need ×{bagsToBuild}</th>
                <th style={{ ...th, textAlign: 'right' }}>Short</th>
              </tr></thead>
              <tbody>
                {NOTES.map(n => {
                  const inSafe = num(safeCount[n] || ''); const per = num(recipe[n] || ''); const need = per * bagsToBuild
                  const short = Math.max(0, need - inSafe)
                  return (
                    <tr key={n} style={{ borderTop: '1px solid var(--border,#eee)' }}>
                      <td style={td}>{vnd(n)}</td>
                      <td style={{ ...td, textAlign: 'right' }}><input inputMode="numeric" value={safeCount[n] || ''} onChange={e => setSafeCount(p => ({ ...p, [n]: e.target.value }))} style={{ ...inp, width: 70, textAlign: 'right', padding: '5px 7px' }} /></td>
                      <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted,#999)' }}>{inSafe ? vnd(n * inSafe) : ''}</td>
                      <td style={{ ...td, textAlign: 'right' }}><input inputMode="numeric" value={recipe[n] || ''} onChange={e => setRecipe(p => ({ ...p, [n]: e.target.value }))} style={{ ...inp, width: 60, textAlign: 'right', padding: '5px 7px' }} /></td>
                      <td style={{ ...td, textAlign: 'right' }}>{need || ''}</td>
                      <td style={{ ...td, textAlign: 'right', color: short ? 'var(--burgundy,#7b2d3a)' : 'var(--text-muted,#bbb)', fontWeight: short ? 600 : 400 }}>{short || ''}</td>
                    </tr>
                  )
                })}
                <tr style={{ borderTop: '2px solid var(--border,#ddd)', fontWeight: 600 }}>
                  <td style={td}>Total</td>
                  <td style={{ ...td, textAlign: 'right' }}></td>
                  <td style={{ ...td, textAlign: 'right' }}>{vnd(safeCountTotal)}</td>
                  <td style={{ ...td, textAlign: 'right' }}></td>
                  <td style={{ ...td, textAlign: 'right' }}>{vnd(recipeTotal * bagsToBuild)}</td>
                  <td style={{ ...td, textAlign: 'right' }}></td>
                </tr>
              </tbody>
            </table>

            <div style={{ ...row, marginTop: 10 }}>
              <span style={{ fontSize: 13 }}>Recorded Safe <b>{vnd(safeRecorded)}</b> · counted <b>{vnd(safeCountTotal)}</b> · <span style={{ color: !countDiff ? '#548235' : 'var(--burgundy,#7b2d3a)' }}>{!countDiff ? 'matches' : `${countDiff > 0 ? 'over' : 'short'} ${vnd(Math.abs(countDiff))}`}</span></span>
            </div>
            <div style={{ ...row, marginTop: 8 }}>
              <button onClick={saveSafeCount} style={btn}>Save safe count</button>
              <button onClick={saveRecipe} style={{ ...btn, background: 'var(--text-secondary,#666)' }}>Save float recipe</button>
              {isSuper && <button onClick={setSafeToCount} style={{ ...btn, background: 'var(--burgundy,#7b2d3a)' }}>Set Safe to count</button>}
              <span style={{ fontSize: 13, color: 'var(--text-muted,#777)', display: 'flex', alignItems: 'center', gap: 6 }}>bags to build <input inputMode="numeric" value={nBags} onChange={e => setNBags(e.target.value)} style={{ ...inp, width: 56, padding: '5px 7px' }} placeholder={String(openDays.length)} /></span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted,#999)', marginTop: 8 }}>
              Set the note mix that makes one float bag (small notes for change), then count what is in the safe. “Short” shows how many of each note to draw from the bank to build {bagsToBuild} bag{bagsToBuild === 1 ? '' : 's'}. Counting the safe also reconciles it against the recorded balance.
            </div>
          </div>
        )}
      </div>

      {/* history */}
      {histWeeks.length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={hdr}>Past weeks</div>
            <button onClick={() => setShowHist(s => !s)} style={{ ...btnLink, fontWeight: 600, color: 'var(--accent,#e87830)' }}>{showHist ? 'Hide' : 'Show'}</button>
          </div>
          {showHist && histWeeks.map(w => {
            const bs = histByWeek(w.id)
            const sales = bs.reduce((s, b) => s + Number(b.sales || 0), 0)
            return (
              <div key={w.id} style={{ borderTop: '1px solid var(--border,#eee)', padding: '10px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <b style={{ fontSize: 14 }}>Week of {w.week_start}</b>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary,#555)' }}>built {vnd(w.built_total)} · sales {vnd(sales)} · deposited {vnd(w.deposited_total)}</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 6 }}>
                  <thead><tr style={{ color: 'var(--text-muted,#999)' }}>
                    <th style={{ ...th, padding: '4px 8px' }}>Day</th><th style={{ ...th, padding: '4px 8px', textAlign: 'right' }}>Float</th><th style={{ ...th, padding: '4px 8px', textAlign: 'right' }}>Counted</th><th style={{ ...th, padding: '4px 8px', textAlign: 'right' }}>Sales</th><th style={{ ...th, padding: '4px 8px', textAlign: 'right' }}>Over/short</th>
                  </tr></thead>
                  <tbody>
                    {bs.map(b => (
                      <tr key={b.id} style={{ borderTop: '1px solid var(--border,#f0f0f0)' }}>
                        <td style={{ ...td, padding: '5px 8px' }}>{b.label} <span style={{ color: 'var(--text-muted,#aaa)' }}>{b.business_date.slice(5)}</span></td>
                        <td style={{ ...td, padding: '5px 8px', textAlign: 'right' }}>{vnd(b.built_amount)}</td>
                        <td style={{ ...td, padding: '5px 8px', textAlign: 'right' }}>{b.counted != null ? vnd(b.counted) : '—'}</td>
                        <td style={{ ...td, padding: '5px 8px', textAlign: 'right' }}>{vnd(b.sales)}</td>
                        <td style={{ ...td, padding: '5px 8px', textAlign: 'right', color: !b.over_short ? 'var(--text-muted,#aaa)' : 'var(--burgundy,#7b2d3a)' }}>{b.over_short != null ? (b.over_short ? vnd(b.over_short) : 'ok') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {/* record a movement */}
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={hdr}>Record a movement</div>
        <div style={row}>
          <select value={mvType} onChange={e => setMvType(e.target.value)} style={{ ...inp, width: 220 }}>
            <option value="drop">Cash drop (Till → Safe)</option>
            <option value="bank_in">Bank cash in (bank → Safe)</option>
            <option value="deposit">Bank deposit (Safe → bank)</option>
            <option value="expense">Cash expense (out)</option>
            <option value="refund">Cash refund (out of Till)</option>
            {isSuper && <option value="adjust">Adjust (+/−) — super-admin</option>}
          </select>
          {(mvType === 'expense' || mvType === 'adjust') && (
            <select value={mvAcct} onChange={e => setMvAcct(e.target.value)} style={{ ...inp, width: 110 }}>
              <option value="">account…</option>{accts.map(a => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}
            </select>
          )}
          <input value={mvNote} onChange={e => setMvNote(e.target.value)} style={{ ...inp, flex: 1, minWidth: 90 }} placeholder="note (what / who)" />
          <input inputMode="numeric" value={mvAmt} onChange={e => setMvAmt(e.target.value)} style={{ ...inp, width: 130 }} placeholder={mvType === 'adjust' ? 'amount (+/−)' : 'amount'} />
          <button onClick={record} style={btn}>Record</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted,#999)', marginTop: 8 }}>
          {mvType === 'drop' && 'Moves cash from the Till into the Safe — total on hand unchanged.'}
          {mvType === 'bank_in' && 'Cash brought from the bank into the Safe — use this to fund floats. Raises cash on hand.'}
          {mvType === 'deposit' && 'Cash leaves the Safe to the bank — lowers cash on hand. Use after closing a week to bank the takings.'}
          {mvType === 'expense' && 'Cash paid out of an account. (Tracks cash only — log P&L expenses in Add Purchase.)'}
          {mvType === 'refund' && 'Refund a customer in cash from the Till — also lowers today’s net sales in the P&L.'}
          {mvType === 'adjust' && 'Correct a balance. Super-admin only.'}
        </div>
      </div>

      {msg && <div style={{ fontSize: 13, marginBottom: 12, color: msg.startsWith('✓') ? '#548235' : 'var(--burgundy, #7b2d3a)' }}>{msg}</div>}

      {/* statement */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {accts.map(a => (
          <button key={a.account_id} onClick={() => { setTab(a.account_id); setSetBal('') }} style={{ ...tabBtn, ...(tab === a.account_id ? tabActive : {}) }}>{a.name} statement</button>
        ))}
      </div>
      <div style={{ ...row, marginBottom: 10, padding: '10px 12px', background: 'var(--bg-sidebar,#fafafa)', borderRadius: 8 }}>
        <span style={{ fontSize: 13 }}>{acctName(tab)} now: <b>{vnd(accts.find(a => a.account_id === tab)?.balance || 0)}</b></span>
        {isSuper ? <>
          <span style={{ fontSize: 12, color: 'var(--text-muted,#999)' }}>— count it and correct it:</span>
          <input inputMode="numeric" value={setBal} onChange={e => setSetBal(e.target.value)} style={{ ...inp, width: 150 }} placeholder="actual amount" />
          <button onClick={setBalance} style={btn}>Set balance</button>
        </> : <span style={{ fontSize: 12, color: 'var(--text-muted,#bbb)' }}>— corrections are super-admin only</span>}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ background: 'var(--bg-sidebar,#fafafa)' }}>
          <th style={th}>When</th><th style={th}>Description</th><th style={{ ...th, textAlign: 'right' }}>In</th><th style={{ ...th, textAlign: 'right' }}>Out</th><th style={{ ...th, textAlign: 'right' }}>Balance</th><th style={th}></th>
        </tr></thead>
        <tbody>
          {statement.length === 0 && <tr><td colSpan={6} style={{ padding: 12, color: 'var(--text-muted,#999)' }}>No movements yet for {acctName(tab)}.</td></tr>}
          {statement.map(m => editId === m.id ? (
            <tr key={m.id} style={{ borderTop: '1px solid var(--border,#eee)', background: 'var(--bg-sidebar,#fafafa)' }}>
              <td style={td}>{new Date(m.occurred_at).toLocaleDateString()}</td>
              <td style={td}><input value={eNote} onChange={e => setENote(e.target.value)} style={{ ...inp, width: '92%' }} /></td>
              <td colSpan={2} style={{ ...td, textAlign: 'right' }}><input inputMode="numeric" value={eAmt} onChange={e => setEAmt(e.target.value)} style={{ ...inp, width: 120, textAlign: 'right' }} /></td>
              <td style={td}></td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}><button onClick={() => saveEdit(m)} style={btnLink}>Save</button><button onClick={() => setEditId(null)} style={btnLink}>Cancel</button></td>
            </tr>
          ) : (
            <tr key={m.id} style={{ borderTop: '1px solid var(--border,#eee)' }}>
              <td style={td}>{new Date(m.occurred_at).toLocaleDateString()}</td>
              <td style={td}>{TYPE_LABEL[m.type] || m.type}{m.note ? ` · ${m.note}` : ''}</td>
              <td style={{ ...td, textAlign: 'right', color: '#548235' }}>{Number(m.amount) > 0 ? vnd(m.amount) : ''}</td>
              <td style={{ ...td, textAlign: 'right', color: 'var(--burgundy,#7b2d3a)' }}>{Number(m.amount) < 0 ? vnd(Math.abs(Number(m.amount))) : ''}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{vnd((m as any).balance)}</td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {!isSuper || locked(m.type) ? <span style={{ fontSize: 11, color: 'var(--text-muted,#bbb)' }}>{locked(m.type) ? 'auto' : ''}</span> : <>
                  <button onClick={() => startEdit(m)} style={btnLink}>Edit</button>
                  <button onClick={() => delMove(m)} style={btnLink}>×</button>
                </>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Card({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="card" style={{ padding: '12px 16px', minWidth: 140, border: accent ? '1px solid var(--accent,#e87830)' : '1px solid var(--border,#e5e5e5)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted,#999)' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4, color: warn ? 'var(--burgundy,#7b2d3a)' : 'inherit' }}>{value}</div>
    </div>
  )
}

const hdr = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 10 }
const tagAcct = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: 'var(--accent,#e87830)', border: '1px solid var(--accent,#e87830)', borderRadius: 6, padding: '1px 6px', marginLeft: 8 }
const row = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }
const inp = { padding: '9px 11px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg-input, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const }
const th = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td = { padding: '9px 12px', color: 'var(--text, #333)' }
const btn = { padding: '9px 14px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }
const btnLink = { padding: '2px 6px', background: 'transparent', color: 'var(--text-muted, #999)', border: 'none', cursor: 'pointer', fontSize: 14 }
const tabBtn = { padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border,#e5e5e5)', color: 'var(--text-secondary,#666)' }
const tabActive = { background: 'var(--accent,#e87830)', color: '#fff', borderColor: 'var(--accent,#e87830)' }
