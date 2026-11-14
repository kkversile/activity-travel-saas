import { money } from './Ui';

export type PayoutAttempt = {
  id: string;
  attemptNumber: number;
  status: string;
  amount: string | number;
  currency: string;
  externalReference?: string | null;
  failureReason?: string | null;
  occurredAt?: string;
};

export default function PayoutAttemptHistory({ attempts = [] }: { attempts?: PayoutAttempt[] }) {
  if (!attempts.length) return null;
  return <details className="payout-attempt-history">
    <summary>Attempt history ({attempts.length})</summary>
    <ol>{[...attempts].sort((a, b) => a.attemptNumber - b.attemptNumber).map((attempt) => <li key={attempt.id}>
      <strong>Attempt {attempt.attemptNumber} · {attempt.status.replaceAll('_', ' ')}</strong>
      <span>{money(attempt.amount, attempt.currency)}</span>
      {attempt.occurredAt && <time dateTime={attempt.occurredAt}>{new Date(attempt.occurredAt).toLocaleString()}</time>}
      {attempt.externalReference && <span>Reference: {attempt.externalReference}</span>}
      {attempt.failureReason && <p>{attempt.failureReason}</p>}
    </li>)}</ol>
  </details>;
}
