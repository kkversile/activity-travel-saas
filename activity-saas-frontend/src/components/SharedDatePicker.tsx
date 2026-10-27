import { useEffect, useMemo, useRef, useState } from 'react';

type SharedDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  ariaInvalid?: boolean;
};

const MONTHS = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2020, month, 1)));
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

function toIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function displayDate(value: string) {
  const date = parseDate(value);
  return date ? `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}` : '';
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function isBefore(value: string, other?: string) {
  return Boolean(other && value < other);
}

function isAfter(value: string, other?: string) {
  return Boolean(other && value > other);
}

export function SharedDatePicker({ value, onChange, min, max, disabled = false, placeholder = 'Select date', id, ariaLabel, ariaInvalid = false }: SharedDatePickerProps) {
  const selected = parseDate(value);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthStart(selected || parseDate(min) || new Date()));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const next = parseDate(value) || parseDate(min);
    if (next) setMonth(monthStart(next));
  }, [value, min]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const minYear = parseDate(min)?.getFullYear() ?? currentYear - 2;
    const maxYear = parseDate(max)?.getFullYear() ?? currentYear + 8;
    const start = Math.min(minYear, selected?.getFullYear() ?? currentYear) - 1;
    const end = Math.max(maxYear, selected?.getFullYear() ?? currentYear) + 1;
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [max, min, selected]);

  const days = useMemo(() => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const previousDays = new Date(month.getFullYear(), month.getMonth(), 0).getDate();
    return Array.from({ length: 42 }, (_, index) => {
      const dayOffset = index - firstDay;
      const day = dayOffset < 0 ? previousDays + dayOffset + 1 : dayOffset >= daysInMonth ? dayOffset - daysInMonth + 1 : dayOffset + 1;
      const date = new Date(month.getFullYear(), month.getMonth() + (dayOffset < 0 ? -1 : dayOffset >= daysInMonth ? 1 : 0), day);
      return { date, outside: date.getMonth() !== month.getMonth() };
    });
  }, [month]);

  const choose = (date: Date) => {
    const next = toIso(date);
    if (isBefore(next, min) || isAfter(next, max)) return;
    onChange(next);
    setOpen(false);
  };

  return <div className="shared-date-picker" ref={rootRef}>
    <button
      type="button"
      id={id}
      className={`shared-date-picker-trigger${!value ? ' is-empty' : ''}${ariaInvalid ? ' is-invalid' : ''}`}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid || undefined}
      aria-haspopup="dialog"
      aria-expanded={open}
      disabled={disabled}
      onClick={() => setOpen((current) => !current)}
    >
      <svg className="shared-date-picker-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span>{displayDate(value) || placeholder}</span>
    </button>
    {open && <div className="shared-date-picker-popover" role="dialog" aria-label={`${ariaLabel || placeholder} calendar`}>
      <div className="shared-date-picker-toolbar">
        <strong>{placeholder}</strong>
        <div className="shared-date-picker-selects">
          <select aria-label={`${placeholder} month`} value={month.getMonth()} onChange={(event) => setMonth(new Date(month.getFullYear(), Number(event.target.value), 1))}>
            {MONTHS.map((label, index) => <option key={label} value={index}>{label}</option>)}
          </select>
          <select aria-label={`${placeholder} year`} value={month.getFullYear()} onChange={(event) => setMonth(new Date(Number(event.target.value), month.getMonth(), 1))}>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
      </div>
      <div className="shared-date-picker-heading">
        <button type="button" aria-label="Previous month" onClick={() => setMonth((current) => addMonths(current, -1))}>‹</button>
        <strong>{MONTHS[month.getMonth()]} {month.getFullYear()}</strong>
        <button type="button" aria-label="Next month" onClick={() => setMonth((current) => addMonths(current, 1))}>›</button>
      </div>
      <div className="shared-date-picker-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="shared-date-picker-grid">{days.map(({ date, outside }) => {
        const dateValue = toIso(date);
        const blocked = outside || isBefore(dateValue, min) || isAfter(dateValue, max);
        return <button type="button" key={dateValue} className={`${selected && dateValue === value ? 'is-selected ' : ''}${outside ? 'is-outside ' : ''}${blocked ? 'is-disabled' : ''}`} disabled={blocked} onClick={() => choose(date)}>{date.getDate()}</button>;
      })}</div>
    </div>}
  </div>;
}
