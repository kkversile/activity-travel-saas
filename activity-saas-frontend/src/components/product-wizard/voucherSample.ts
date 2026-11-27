import type { WizardSnapshot } from './types';

const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
function dateOnly(value?: string | null) {
  const day = value?.slice(0, 10) || '';
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day ? day : '';
}

export function voucherSample(snapshot: WizardSnapshot, now = new Date()) {
  const option = snapshot.variants.find(variant => variant.status === 'ACTIVE');
  const detailed = snapshot.schedules.filter(schedule => schedule.variantId === option?.id && (schedule.status === 'ACTIVE' || schedule.status === 'DRAFT'));
  const nested = (option?.schedules || []).filter(schedule => !snapshot.schedules.some(full => full.id === schedule.id));
  const dates = [...detailed, ...nested].flatMap(schedule => {
    const from = dateOnly(schedule.effectiveFrom);
    const to = dateOnly(schedule.effectiveTo);
    if (!from || (schedule.effectiveTo && !to)) return [];
    let today: string;
    try { today = new Intl.DateTimeFormat('en-CA', { timeZone: schedule.timezone || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
    catch { today = now.toISOString().slice(0, 10); }
    const candidate = new Date(`${from > today ? from : today}T12:00:00Z`);
    const days = schedule.operatingDays?.map(day => day.slice(0, 3).toUpperCase()) || [];
    for (let count = 0; count < 7; count++) {
      const day = candidate.toISOString().slice(0, 10);
      if (to && day >= to) return [];
      if (!days.length || days.includes(weekdays[candidate.getUTCDay()])) return [day];
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
    return [];
  }).sort();
  const ticketNames = option?.ticketTypes?.filter(ticket => ticket.name.trim()).sort((a, b) => a.rank - b.rank).map(ticket => ticket.name.trim()) || [];
  return {
    optionName: option?.name || 'Your bookable option',
    dateLabel: dates.length ? `Example activity date: ${new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${dates[0]}T12:00:00Z`))}` : 'Activity date selected when booking',
    ticketLabel: option?.unitRows?.length ? `Unit: ${option.unitRows[0].name}` : ticketNames.length ? `Ticket types: ${ticketNames.join(', ')}` : 'Ticket selection shown when configured',
  };
}
