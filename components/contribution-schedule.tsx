'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Download, Pause, Play, ShieldCheck } from 'lucide-react';
import type { Basket, Mode } from '@/lib/domain/types';
import { calendarEvent, nextFutureReview, occurrenceId, scheduleDate, scheduleLocalTime, type ScheduleCadence } from '@/lib/domain/contribution-schedules';
import { formatUsdc, parseBudget, parsePercent, validatePlan } from '@/lib/domain/math';
import { parseSavedBasket } from '@/lib/domain/storage';

type SavedReminder = { id: string; basket: Basket; mode: Mode; cadence: ScheduleCadence; timezone: string; nextDueAt: string; paused: boolean; planVersion: number; cloudId?: string };
type CloudReminder = { id: string; budget_raw: string; allocations: { mint: string; bps: string }[]; cadence: ScheduleCadence; timezone: string; next_due_at: string; paused: boolean; plan_version: number };
const storageKey = 'lotline:contribution-schedule:v2';

function readReminder(raw: string | null): SavedReminder | null {
  try {
    const value = JSON.parse(raw ?? 'null') as SavedReminder | null;
    if (!value || !/^[a-zA-Z0-9-]{1,64}$/.test(value.id) || !['live', 'example'].includes(value.mode) || !['weekly', 'monthly'].includes(value.cadence) || typeof value.paused !== 'boolean' || !Number.isInteger(value.planVersion) || value.planVersion < 1 || !Number.isFinite(Date.parse(value.nextDueAt))) return null;
    const basket = parseSavedBasket(value.basket);
    if (!basket || !validatePlan(basket).valid) return null;
    scheduleLocalTime(new Date(value.nextDueAt), value.timezone);
    return { ...value, basket };
  } catch { return null; }
}

export function ContributionSchedule({ basket, mode, onReview }: { basket: Basket; mode: Mode; onReview?: (basket: Basket, mode: Mode, occurrence: string) => void }) {
  const [cadence, setCadence] = useState<ScheduleCadence>('monthly');
  const [start, setStart] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [saved, setSaved] = useState<SavedReminder | null>(null);
  const [initialPaused, setInitialPaused] = useState(false);
  const [savingCloud, setSavingCloud] = useState(false);
  const [status, setStatus] = useState('');
  const [cloudReminders, setCloudReminders] = useState<CloudReminder[]>([]);
  const [now, setNow] = useState(0);

  function applyReminder(reminder: SavedReminder) {
    setSaved(reminder); setCadence(reminder.cadence); setTimezone(reminder.timezone);
    setStart(scheduleLocalTime(new Date(reminder.nextDueAt), reminder.timezone));
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      setTimezone(zone); setStart(scheduleLocalTime(new Date(Date.now() + 86_400_000), zone)); setNow(Date.now());
      try {
        const reminder = readReminder(localStorage.getItem(storageKey));
        if (reminder) applyReminder(reminder);
        else {
          const previous = JSON.parse(localStorage.getItem('lotline:contribution-schedule') ?? 'null') as { cadence?: string; start?: string; paused?: boolean } | null;
          if (previous?.cadence === 'weekly' || previous?.cadence === 'monthly') setCadence(previous.cadence);
          if (previous?.start && scheduleDate(previous.start, zone)) setStart(previous.start);
          if (typeof previous?.paused === 'boolean') setInitialPaused(previous.paused);
          if (previous) setStatus('Your previous cadence and date are restored. Save a review reminder to attach the current amount and split.');
        }
      } catch { /* Device storage can be unavailable. */ }
    });
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    const sync = (event: StorageEvent) => { if (event.key === storageKey) { const reminder = readReminder(event.newValue); if (reminder) applyReminder(reminder); } };
    window.addEventListener('storage', sync);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('storage', sync); };
  }, []);

  const plan = useMemo(() => validatePlan(basket), [basket]);
  const due = useMemo(() => scheduleDate(start, timezone), [start, timezone]);
  const isDue = Boolean(saved && !saved.paused && Date.parse(saved.nextDueAt) <= now);
  const changed = Boolean(saved && (JSON.stringify(saved.basket) !== JSON.stringify(basket) || mode !== saved.mode || saved.cadence !== cadence || saved.nextDueAt !== due?.toISOString()));

  function persist(reminder: SavedReminder) {
    try { localStorage.setItem(storageKey, JSON.stringify(reminder)); applyReminder(reminder); return true; }
    catch { setStatus('This browser could not save the reminder. Export the calendar event or enable device storage.'); return false; }
  }

  function saveLocal(): SavedReminder | null {
    if (!plan.valid || !due) return null;
    const reminder: SavedReminder = { id: saved?.id ?? crypto.randomUUID(), basket: structuredClone(basket), mode, cadence, timezone, nextDueAt: due.toISOString(), paused: saved?.paused ?? initialPaused, planVersion: (saved?.planVersion ?? 0) + (changed || !saved ? 1 : 0), ...(saved?.cloudId ? { cloudId: saved.cloudId } : {}) };
    if (!persist(reminder)) return null;
    setStatus(`Review reminder saved on this device. Plan version ${reminder.planVersion}; no purchase is scheduled.`);
    return reminder;
  }

  function downloadCalendar() {
    if (!saved) return;
    const ics = calendarEvent({ id: saved.id, name: `Lotline ${saved.cadence} contribution review`, timezone: saved.timezone, nextDueAt: saved.nextDueAt });
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `lotline-${saved.cadence}-contribution.ics`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function saveCloud() {
    if (mode === 'example' || !plan.valid || !due || savingCloud) return;
    const reminder = saveLocal(); if (!reminder) return;
    setSavingCloud(true);
    try {
      const sessionResponse = await fetch('/api/auth/session', { cache: 'no-store' });
      const session = await sessionResponse.json() as { state?: string };
      if (!sessionResponse.ok || session.state !== 'signed-in') { setStatus('Sign in to sync this reminder across devices. Your device copy is saved.'); return; }
      const response = await fetch('/api/contribution-schedules', { method: reminder.cloudId ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: reminder.cloudId ?? reminder.id, name: 'Lotline contribution review', budgetRaw: parseBudget(reminder.basket.budget).toString(), allocations: reminder.basket.items.map(item => ({ mint: item.mint, bps: parsePercent(item.percent).toString() })), cadence: reminder.cadence, timezone: reminder.timezone, nextDueAt: reminder.nextDueAt, paused: reminder.paused }) });
      const data = await response.json() as { state?: string; message?: string; schedule?: CloudReminder };
      if (!response.ok || data.state !== 'success' || !data.schedule) throw new Error(data.message ?? 'The reminder could not be synced.');
      const latest = readReminder(localStorage.getItem(storageKey));
      if (latest && JSON.stringify(latest) !== JSON.stringify(reminder)) {
        // Another tab may have edited the reminder while this request was in flight.
        // Keep those device edits; the response only acknowledges the sent snapshot.
        persist({ ...latest, ...(latest.id === reminder.id ? { cloudId: data.schedule.id } : {}) });
        setStatus('The earlier snapshot synced. Newer device edits are preserved; sync again to save them to your account.');
      } else {
        persist({ ...reminder, cloudId: data.schedule.id, planVersion: data.schedule.plan_version });
        setStatus('Reminder synced to your account. Future changes update this same reminder.');
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Cloud sync is unavailable; this device reminder is still saved.'); }
    finally { setSavingCloud(false); }
  }

  async function loadCloud() {
    setSavingCloud(true);
    try {
      const response = await fetch('/api/contribution-schedules', { cache: 'no-store' });
      const data = await response.json() as { state?: string; message?: string; schedules?: CloudReminder[] };
      if (!response.ok || data.state !== 'success' || !data.schedules) throw new Error(data.message ?? 'Sign in to load your account reminders.');
      setCloudReminders(data.schedules); setStatus(data.schedules.length ? 'Choose an account reminder to restore its saved amount and split.' : 'Your account has no saved reminders yet.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Account reminders are unavailable.'); }
    finally { setSavingCloud(false); }
  }

  function restoreCloud(value: string) {
    const reminder = cloudReminders.find(item => item.id === value); if (!reminder) return;
    try {
      const restored = readReminder(JSON.stringify({ id: reminder.id, cloudId: reminder.id, basket: { version: 1, budget: formatUsdc(reminder.budget_raw), items: reminder.allocations.map(item => ({ mint: item.mint, percent: `${BigInt(item.bps) / 100n}.${(BigInt(item.bps) % 100n).toString().padStart(2, '0')}` })) }, mode: 'live', cadence: reminder.cadence, timezone: reminder.timezone, nextDueAt: reminder.next_due_at, paused: reminder.paused, planVersion: reminder.plan_version }));
      if (!restored) throw new Error('This account reminder has an invalid saved split.');
      persist(restored); setStatus('Account reminder restored. Load its saved split when you are ready to review.');
    } catch { setStatus('This account reminder could not be restored. Your current plan is unchanged.'); }
  }

  return <section className="schedule-card" aria-labelledby="schedule-heading">
    <div className="schedule-heading"><div><div className="panel-kicker">05 <span /> KEEP THE PLAN ALIVE</div><h2 id="schedule-heading">A reminder, never an auto-trade.</h2></div><CalendarClock size={18} /></div>
    <p>{mode === 'example' ? 'Practice a review cadence with synthetic figures.' : 'Save a review date and an exact copy of this split.'} Each contribution needs fresh estimates, a new review and your wallet approval.</p>
    <div className="schedule-fields"><label><span>Cadence</span><select disabled={savingCloud} value={cadence} onChange={event => setCadence(event.target.value as ScheduleCadence)}><option value="monthly">Monthly</option><option value="weekly">Weekly</option></select></label><label><span>Next review</span><input disabled={savingCloud} type="datetime-local" value={start} onChange={event => setStart(event.target.value)} /></label></div>
    <p>Review timezone: {timezone}. Calendar export adds one review; advance the next date after reviewing. No missed purchases accumulate.</p>
    {start && !due && <p role="status">Choose a valid local time. This timezone may skip that time during a daylight-saving change.</p>}
    {saved && <div className="schedule-status"><span className={saved.paused ? 'paused' : ''}>{saved.paused ? <Pause size={13} /> : <Play size={13} />}{saved.paused ? 'Paused' : isDue ? 'Your contribution review is due' : 'Review reminder active'}</span><time dateTime={saved.nextDueAt}>{new Date(saved.nextDueAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short', timeZone: saved.timezone })}</time></div>}
    {saved && <p>Saved plan v{saved.planVersion}: {saved.basket.budget} USDC across {saved.basket.items.length} assets · {saved.mode === 'example' ? 'Example' : 'Live'}.{changed ? ' Your current edits are not in this saved reminder.' : ''}</p>}
    <div className="schedule-actions">
      <button type="button" className="button secondary" onClick={() => saveLocal()} disabled={!plan.valid || !due || savingCloud}>{saved ? 'Save reminder changes' : 'Save review reminder'}</button>
      {saved && <>
        <button type="button" className="button secondary" disabled={savingCloud} onClick={() => { if (persist({ ...saved, paused: !saved.paused })) setStatus('Device reminder updated. Sync account to apply this change on other devices.'); }}>{saved.paused ? <><Play size={14} />Resume reminder</> : <><Pause size={14} />Pause reminder</>}</button>
        <button type="button" className="button secondary" onClick={downloadCalendar}><Download size={14} />Add to calendar</button>
        <button type="button" className="button secondary" disabled={savingCloud || saved.paused || !onReview} onClick={() => { onReview?.(structuredClone(saved.basket), saved.mode, occurrenceId(saved.id, saved.nextDueAt)); setStatus('Saved split loaded. Check the amount and request fresh estimates before reviewing a purchase.'); }}>Review saved split</button>
        <button type="button" className="button secondary" disabled={savingCloud || saved.paused} onClick={() => { try { persist({ ...saved, nextDueAt: nextFutureReview(saved.nextDueAt, saved.cadence, saved.timezone, new Date()).toISOString() }); setStatus('Moved to the next future review. No catch-up purchase was created.'); } catch { setStatus('Choose a new future review date.'); } }}>Schedule next review</button>
      </>}
      {mode !== 'example' && <><button type="button" className="button secondary" onClick={() => void saveCloud()} disabled={!plan.valid || !due || savingCloud}>{savingCloud ? 'Syncing…' : 'Sync account'}</button><button type="button" className="button secondary" onClick={() => void loadCloud()} disabled={savingCloud}>Load account reminders</button></>}
    </div>
    {cloudReminders.length > 0 && <div className="schedule-fields"><label><span>Account reminder</span><select disabled={savingCloud} defaultValue="" onChange={event => restoreCloud(event.target.value)}><option value="" disabled>Choose a saved reminder</option>{cloudReminders.map(reminder => <option key={reminder.id} value={reminder.id}>{formatUsdc(reminder.budget_raw)} USDC · {reminder.cadence} · {reminder.next_due_at.slice(0, 10)}</option>)}</select></label></div>}
    {status && <p className="schedule-cloud-status" role="status">{status}</p>}
    <div className="schedule-note"><ShieldCheck size={13} />The reminder saves your amount and split on this device. Calendar export contains a review date, never a wallet address, quote or signing permission.</div>
  </section>;
}
