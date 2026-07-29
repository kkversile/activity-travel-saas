import type { Activity } from "@/types/activity";

function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency
  }).format(minor / 100);
}

export function ActivityCard({ activity }: { activity: Activity }) {
  const firstPrice = activity.pricePlans[0];
  const nextSchedule = activity.schedules[0];

  return (
    <article className="card">
      <span className="destination">{activity.destination}</span>
      <h2>{activity.name}</h2>
      <p>{activity.summary}</p>

      <div className="meta">
        <span>{Math.round(activity.durationMinutes / 60)} hours</span>
        {firstPrice ? (
          <span>From {formatMoney(firstPrice.adultMinor, firstPrice.currency)}</span>
        ) : (
          <span>Pricing unavailable</span>
        )}
      </div>

      <div className="schedule">
        {nextSchedule
          ? `Next departure: ${new Date(nextSchedule.startsAt).toLocaleString("en-IN")}`
          : "No future departures"}
      </div>
    </article>
  );
}
