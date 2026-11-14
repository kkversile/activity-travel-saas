import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../../api';
import { ItinerarySection } from './ExperienceStep';

afterEach(() => vi.restoreAllMocks());
it('persists edited stops through the wizard save handler without refreshing away content edits', async () => {
  const request = vi.spyOn(api, 'request').mockResolvedValue([]);
  const dirty = vi.fn(); const refresh = vi.fn();
  let save: (() => Promise<boolean>) | null = null;
  render(<ItinerarySection revisionId="revision-1" locked={false} onRefresh={refresh} onError={vi.fn()} onContentDirty={dirty} onRegisterContentSave={(handler) => { save = handler; }} />);
  await screen.findByText('No itinerary stops yet. Add only supplier-confirmed stops.');
  fireEvent.click(screen.getByRole('button', { name: '+ Add stop' }));
  fireEvent.change(screen.getByPlaceholderText('Meeting point or attraction'), { target: { value: 'Temple entrance' } });
  expect(dirty).toHaveBeenCalled();
  await act(async () => { expect(await save!()).toBe(true); });
  expect(request).toHaveBeenCalledWith('/vendor/itinerary/revision-1', expect.objectContaining({ method: 'PUT', body: expect.stringContaining('Temple entrance') }));
  expect(refresh).not.toHaveBeenCalled();
});
it('prevents navigation when saving the itinerary fails', async () => {
  const request = vi.spyOn(api, 'request').mockResolvedValue([]);
  const error = vi.fn(); let save: (() => Promise<boolean>) | null = null;
  render(<ItinerarySection revisionId="revision-2" locked={false} onRefresh={vi.fn()} onError={error} onRegisterContentSave={(handler) => { save = handler; }} />);
  await waitFor(() => expect(screen.getByText('No itinerary stops yet. Add only supplier-confirmed stops.')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: '+ Add stop' }));
  fireEvent.change(screen.getByPlaceholderText('Meeting point or attraction'), { target: { value: 'Market stop' } });
  request.mockRejectedValueOnce(new Error('Save failed'));
  await act(async () => { expect(await save!()).toBe(false); });
  expect(error).toHaveBeenCalledWith('Save failed');
});
