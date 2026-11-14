import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import FilePreviewDialog from './FilePreviewDialog';

vi.mock('../api', () => ({ api: { blob: vi.fn() } }));

// Match ThemePicker's jsdom shims: opening a native dialog exposes its contents.
if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

const file = { id: 'bank-proof-42', originalName: 'Bank proof.pdf', mimeType: 'application/pdf' };
const previewUrl = 'blob:http://localhost/bank-proof-42';
const createObjectURL = vi.fn<(blob: Blob) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  createObjectURL.mockReturnValue(previewUrl);
  // Preserve URL construction while supplying jsdom's missing object URL APIs.
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  });
  vi.mocked(api.blob).mockReturnValue(new Promise<Blob>(() => {}));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('FilePreviewDialog', () => {
  it('opens an accessible in-page dialog and loads a PDF through api.blob without a popup', async () => {
    const request = deferred<Blob>();
    const blob = new Blob(['PDF document'], { type: 'application/pdf' });
    vi.mocked(api.blob).mockReturnValueOnce(request.promise);
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null);

    render(<FilePreviewDialog file={file} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: file.originalName });
    expect(dialog).toBeVisible();
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByRole('status')).toHaveTextContent('Loading document…');
    expect(api.blob).toHaveBeenCalledExactlyOnceWith('/files/bank-proof-42/content');
    expect(screen.queryByTitle(`Preview of ${file.originalName}`)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download' })).not.toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();

    await act(async () => { request.resolve(blob); });

    const frame = screen.getByTitle(`Preview of ${file.originalName}`);
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', previewUrl);
    expect(dialog).toContainElement(frame);
    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(blob);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const download = screen.getByRole('link', { name: 'Download' });
    expect(download).toHaveAttribute('href', previewUrl);
    expect(download).toHaveAttribute('download', file.originalName);
    expect(download).not.toHaveAttribute('target', '_blank');
    expect(openWindow).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'uses the blob image MIME over PDF metadata', blobType: 'image/png', mimeType: 'application/pdf', image: true },
    { name: 'uses the blob PDF MIME over image metadata', blobType: 'application/pdf', mimeType: 'image/png', image: false },
    { name: 'uses image metadata when the blob has no MIME', blobType: '', mimeType: 'image/jpeg', image: true },
    { name: 'defaults to a PDF iframe when neither source has a MIME', blobType: '', mimeType: undefined, image: false },
  ])('$name', async ({ blobType, mimeType, image }) => {
    const blob = new Blob(['document'], { type: blobType });
    vi.mocked(api.blob).mockResolvedValueOnce(blob);

    render(<FilePreviewDialog file={{ ...file, mimeType }} onClose={vi.fn()} />);

    const preview = image
      ? await screen.findByRole('img', { name: file.originalName })
      : await screen.findByTitle(`Preview of ${file.originalName}`);
    expect(preview.tagName).toBe(image ? 'IMG' : 'IFRAME');
    expect(preview).toHaveAttribute('src', previewUrl);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    if (image) expect(screen.queryByTitle(`Preview of ${file.originalName}`)).not.toBeInTheDocument();
    else expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it.each([
    { reason: new Error('403 Forbidden'), message: '403 Forbidden' },
    { reason: 'network unavailable', message: 'Could not load this document. Try again.' },
  ])('shows "$message" and recovers through retry', async ({ reason, message }) => {
    const retry = deferred<Blob>();
    vi.mocked(api.blob).mockRejectedValueOnce(reason).mockReturnValueOnce(retry.promise);
    render(<FilePreviewDialog file={file} onClose={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download' })).not.toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry preview' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading document…');
    expect(api.blob).toHaveBeenCalledTimes(2);
    expect(api.blob).toHaveBeenLastCalledWith('/files/bank-proof-42/content');

    await act(async () => { retry.resolve(new Blob(['recovered'], { type: 'application/pdf' })); });

    expect(screen.getByTitle(`Preview of ${file.originalName}`)).toHaveAttribute('src', previewUrl);
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('href', previewUrl);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it.each(['close button', 'backdrop', 'native cancel'] as const)('closes via %s and revokes the URL when the parent removes it', async (method) => {
    vi.mocked(api.blob).mockResolvedValueOnce(new Blob(['PDF'], { type: 'application/pdf' }));
    const onClose = vi.fn();
    function Parent() {
      const [open, setOpen] = useState(true);
      return open ? <FilePreviewDialog file={file} onClose={() => { onClose(); setOpen(false); }} /> : null;
    }
    const { unmount } = render(<Parent />);
    await screen.findByTitle(`Preview of ${file.originalName}`);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    if (method === 'close button') fireEvent.click(screen.getByRole('button', { name: 'Close document preview' }));
    else if (method === 'backdrop') fireEvent.click(screen.getByRole('dialog'));
    else {
      // jsdom does not synthesize the native cancel event from an Escape keypress.
      const cancel = new Event('cancel', { cancelable: true });
      fireEvent(screen.getByRole('dialog'), cancel);
      expect(cancel.defaultPrevented).toBe(true);
    }

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(previewUrl);
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog open when its content is clicked', async () => {
    vi.mocked(api.blob).mockResolvedValueOnce(new Blob(['image'], { type: 'image/png' }));
    const onClose = vi.fn();
    render(<FilePreviewDialog file={file} onClose={onClose} />);

    fireEvent.click(await screen.findByRole('img', { name: file.originalName }));
    fireEvent.click(screen.getByRole('heading', { name: file.originalName }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('revokes the loaded object URL on direct unmount', async () => {
    vi.mocked(api.blob).mockResolvedValueOnce(new Blob(['PDF'], { type: 'application/pdf' }));
    const { unmount } = render(<FilePreviewDialog file={file} onClose={vi.fn()} />);
    await screen.findByTitle(`Preview of ${file.originalName}`);

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(previewUrl);
  });

  it.each(['resolve', 'reject'] as const)('ignores a fetch that %ss after unmount without allocating a URL', async (outcome) => {
    const request = deferred<Blob>();
    vi.mocked(api.blob).mockReturnValueOnce(request.promise);
    const onClose = vi.fn();
    const { unmount } = render(<FilePreviewDialog file={file} onClose={onClose} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    unmount();

    await act(async () => {
      if (outcome === 'resolve') request.resolve(new Blob(['late PDF'], { type: 'application/pdf' }));
      else request.reject(new Error('late failure'));
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('revokes the previous preview and loads the replacement file', async () => {
    const replacement = deferred<Blob>();
    const replacementUrl = 'blob:http://localhost/replacement';
    vi.mocked(api.blob).mockResolvedValueOnce(new Blob(['PDF'], { type: 'application/pdf' })).mockReturnValueOnce(replacement.promise);
    createObjectURL.mockReturnValueOnce(previewUrl).mockReturnValueOnce(replacementUrl);
    const onClose = vi.fn();
    const { rerender, unmount } = render(<FilePreviewDialog file={file} onClose={onClose} />);
    await screen.findByTitle(`Preview of ${file.originalName}`);
    const nextFile = { id: 'replacement', originalName: 'Identity.png', mimeType: 'image/png' };

    rerender(<FilePreviewDialog file={nextFile} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: nextFile.originalName })).toBeVisible();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByTitle(`Preview of ${file.originalName}`)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download' })).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(previewUrl);
    expect(api.blob).toHaveBeenLastCalledWith('/files/replacement/content');

    await act(async () => { replacement.resolve(new Blob(['image'], { type: 'image/png' })); });

    expect(screen.getByRole('img', { name: nextFile.originalName })).toHaveAttribute('src', replacementUrl);
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('download', nextFile.originalName);
    unmount();
    expect(revokeObjectURL.mock.calls).toEqual([[previewUrl], [replacementUrl]]);
  });

  it('ignores an older file response that arrives after the replacement preview', async () => {
    const oldRequest = deferred<Blob>();
    const currentBlob = new Blob(['current image'], { type: 'image/png' });
    vi.mocked(api.blob).mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce(currentBlob);
    const onClose = vi.fn();
    const { rerender } = render(<FilePreviewDialog file={file} onClose={onClose} />);
    const nextFile = { id: 'current', originalName: 'Current.png', mimeType: 'image/png' };
    rerender(<FilePreviewDialog file={nextFile} onClose={onClose} />);
    await screen.findByRole('img', { name: nextFile.originalName });

    await act(async () => { oldRequest.resolve(new Blob(['outdated PDF'], { type: 'application/pdf' })); });

    expect(screen.getByRole('img', { name: nextFile.originalName })).toHaveAttribute('src', previewUrl);
    expect(screen.queryByTitle(`Preview of ${file.originalName}`)).not.toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(currentBlob);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});
