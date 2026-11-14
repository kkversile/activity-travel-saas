import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ProductRevision } from '../../api';
import { MediaSection } from './ExperienceStep';

const revision = { id: 'draft-media', media: [] } as unknown as ProductRevision;
beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:selected-photo') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function imageDimensions(width: number, height: number) {
  vi.stubGlobal('Image', class {
    naturalWidth = width; naturalHeight = height; onload?: () => void;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  });
}
function renderMedia() {
  const refresh = vi.fn().mockResolvedValue(undefined);
  render(<MediaSection revision={revision} locked={false} onRefresh={refresh} onError={vi.fn()} />);
  const input = document.querySelector('input[type="file"]')!;
  return { input, refresh };
}
describe('Activity photo upload', () => {
  it('rejects unsupported and undersized files before contacting the API', async () => {
    const request = vi.spyOn(api, 'request');
    const { input } = renderMedia();
    fireEvent.change(input, { target: { files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] } });
    expect(screen.getByRole('alert')).toHaveTextContent('JPEG, PNG or WebP');
    fireEvent.change(input, { target: { files: [new File(['small'], 'small.jpg', { type: 'image/jpeg' })] } });
    expect(screen.getByRole('alert')).toHaveTextContent('between 1 and 10 MB');
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeDisabled();
    expect(request).not.toHaveBeenCalled();
  });
  it('reports actual dimensions and rejects a photo below the server minimum', async () => {
    imageDimensions(800, 600);
    const { input } = renderMedia();
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(1024 * 1024)], 'small-dimensions.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('800 × 600 px');
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeDisabled();
  });
  it('retains a qualifying photo after a server failure so the vendor can retry', async () => {
    imageDimensions(1600, 1200);
    const request = vi.spyOn(api, 'request').mockRejectedValueOnce(new Error('Upload interrupted')).mockResolvedValueOnce({} as never);
    const { input, refresh } = renderMedia();
    const file = new File([new Uint8Array(1024 * 1024)], 'original.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText(/Ready to upload/);
    fireEvent.click(screen.getByRole('button', { name: 'Upload image' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Upload interrupted');
    expect(screen.getByRole('img', { name: 'Selected upload preview' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upload image' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const options = request.mock.calls[1][1] as { body: FormData };
    expect(options.body.get('file')).toBe(file);
    expect(screen.queryByRole('img', { name: 'Selected upload preview' })).not.toBeInTheDocument();
  });
});
