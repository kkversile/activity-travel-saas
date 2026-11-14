import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api';

export default function FilePreviewDialog({ file, onClose }: { file: { id: string; originalName: string; mimeType?: string }; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [preview, setPreview] = useState<{ url: string; mimeType: string } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    element?.showModal();
    return () => {
      if (element?.open) element.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let url = '';
    setPreview(null);
    setError('');
    api.blob(`/files/${file.id}/content`).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setPreview({ url, mimeType: blob.type || file.mimeType || 'application/pdf' });
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not load this document. Try again.');
    });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [file.id, file.mimeType, attempt]);

  return <dialog ref={dialog} className="doc-preview onboarding-document-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="panel-head"><h3 id={titleId}>{file.originalName}</h3><div className="doc-preview-actions">{preview && <a className="btn small" href={preview.url} download={file.originalName}>Download</a>}<button type="button" className="btn small" onClick={onClose}>Close document preview</button></div></div>
    {error ? <div className="empty"><p role="alert">{error}</p><button type="button" className="btn" onClick={() => setAttempt(value => value + 1)}>Retry preview</button></div> : !preview ? <div className="empty" role="status">Loading document…</div> : preview.mimeType.startsWith('image/') ? <img src={preview.url} alt={file.originalName} /> : <iframe title={`Preview of ${file.originalName}`} src={preview.url} />}
  </dialog>;
}
