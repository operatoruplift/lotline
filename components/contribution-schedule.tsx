'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Download, Pause, Play, ShieldCheck } from 'lucide-react';
import type { Basket, Mode } from '@/lib/domain/types';
import { calendarEvent, type ScheduleCadence } from '@/lib/domain/contribution-schedules';
import { parseBudget, parsePercent, validatePlan } from '@/lib/domain/math';

export function ContributionSchedule({ basket, mode }: { basket: Basket; mode: Mode }) {
  const [cadence, setCadence] = useState<ScheduleCadence>('monthly');
  const [start, setStart] = useState('');
  const [paused, setPaused] = useState(false);
  const [savingCloud, setSavingCloud] = useState(false);
  const [cloudStatus, setCloudStatus] = useState('');
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = JSON.parse(localStorage.getItem('lotline:contribution-schedule') ?? 'null') as { cadence?: ScheduleCadence; start?: string; paused?: boolean } | null;
        if (saved?.cadence === 'weekly' || saved?.cadence === 'monthly') setCadence(saved.cadence);
        if (saved?.start && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(saved.start)) setStart(saved.start);
        else setStart(new Date(Date.now() + 86_400_000).toISOString().slice(0, 16));
        if (typeof saved?.paused === 'boolean') setPaused(saved.paused);
      } catch { /* A blocked or corrupt local schedule does not affect the plan. */ }
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!start) return;
    try { localStorage.setItem('lotline:contribution-schedule', JSON.stringify({ cadence, start, paused })); } catch { /* Local schedule persistence is optional. */ }
  }, [cadence, paused, start]);
  const plan = useMemo(() => validatePlan(basket), [basket]);
  const due = useMemo(() => { if (!start) return null; const parsed = new Date(start); return Number.isFinite(parsed.getTime()) ? parsed : null; }, [start]);

  function downloadCalendar() {
    if (!plan.valid || !due) return;
    const ics = calendarEvent({ id: `lotline-${cadence}-${due.toISOString().slice(0, 10)}`, name: 'Lotline contribution review', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', nextDueAt: due.toISOString() });
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `lotline-${cadence}-contribution.ics`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function saveCloud() {
    if (mode === 'example' || !plan.valid || !due || savingCloud) return;
    setSavingCloud(true); setCloudStatus('');
    try {
      const sessionResponse = await fetch('/api/auth/session', { cache: 'no-store' });
      const session = await sessionResponse.json() as { state?: string };
      if (!sessionResponse.ok || session.state !== 'signed-in') { setCloudStatus('Sign in to sync this reminder across devices.'); return; }
      const response = await fetch('/api/contribution-schedules', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Lotline contribution review', budgetRaw: parseBudget(basket.budget).toString(), allocations: basket.items.map(item => ({ mint: item.mint, bps: parsePercent(item.percent).toString() })), cadence, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', nextDueAt: due.toISOString(), paused }) });
      const data = await response.json() as { state?: string; message?: string };
      setCloudStatus(response.ok && data.state === 'success' ? 'Reminder synced to your account.' : data.message ?? 'The reminder could not be synced.');
    } catch { setCloudStatus('Cloud sync is unavailable; this device reminder is still saved.'); }
    finally { setSavingCloud(false); }
  }

  return <section className="schedule-card" aria-labelledby="schedule-heading"><div className="schedule-heading"><div><div className="panel-kicker">05 <span /> KEEP THE PLAN ALIVE</div><h2 id="schedule-heading">A reminder, never an auto-trade.</h2></div><CalendarClock size={18} /></div><p>{mode === 'example' ? 'Practice a review cadence with synthetic figures.' : 'Save a review date for this split.'} Lotline pauses by default and never signs or submits a scheduled purchase for you.</p><div className="schedule-fields"><label><span>Cadence</span><select value={cadence} onChange={event => setCadence(event.target.value as ScheduleCadence)}><option value="monthly">Monthly</option><option value="weekly">Weekly</option></select></label><label><span>First review</span><input type="datetime-local" value={start} onChange={event => setStart(event.target.value)} /></label></div><div className="schedule-status"><span className={paused ? 'paused' : ''}>{paused ? <Pause size={13} /> : <Play size={13} />}{paused ? 'Paused' : 'Review reminder active'}</span>{due ? <time dateTime={due.toISOString()}>Next review {due.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time> : <span>Choose a first review date</span>}</div><div className="schedule-actions"><button type="button" className="button secondary" onClick={() => setPaused(value => !value)}>{paused ? <><Play size={14} />Resume reminder</> : <><Pause size={14} />Pause reminder</>}</button><button type="button" className="button secondary" onClick={downloadCalendar} disabled={!plan.valid || !due}><Download size={14} />Add to calendar</button>{mode !== 'example' && <button type="button" className="button secondary" onClick={() => void saveCloud()} disabled={!plan.valid || !due || savingCloud}>{savingCloud ? 'Syncing…' : 'Sync account'}</button>}</div>{cloudStatus && <p className="schedule-cloud-status" role="status">{cloudStatus}</p>}<div className="schedule-note"><ShieldCheck size={13} />Calendar export contains the plan snapshot only. It never includes a wallet address or signing permission.</div></section>;
}
