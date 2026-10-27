import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SharedDatePicker } from './SharedDatePicker';

describe('SharedDatePicker', () => {
  it('opens the month/year calendar and returns an ISO date', () => {
    const onChange = vi.fn();
    render(<SharedDatePicker value="2026-10-01" onChange={onChange} placeholder="Start Date" />);

    fireEvent.click(screen.getByRole('button', { name: '01-10-2026' }));

    expect(screen.getByRole('dialog', { name: 'Start Date calendar' })).toBeInTheDocument();
    expect(screen.getByLabelText('Start Date month')).toHaveValue('9');
    expect(screen.getByLabelText('Start Date year')).toHaveValue('2026');

    fireEvent.click(screen.getByRole('button', { name: '15' }));
    expect(onChange).toHaveBeenCalledWith('2026-10-15');
  });

  it('blocks dates outside min and max bounds', () => {
    render(<SharedDatePicker value="2026-10-15" onChange={vi.fn()} min="2026-10-10" max="2026-10-20" placeholder="Service date" />);

    fireEvent.click(screen.getByRole('button', { name: '15-10-2026' }));

    const calendarDays = screen.getByRole('dialog').querySelectorAll('.shared-date-picker-grid button');
    const dayBeforeMinimum = Array.from(calendarDays).find((button) => button.textContent === '9' && !button.classList.contains('is-outside'));
    expect(dayBeforeMinimum).toBeDisabled();
  });
});
