export interface PricePlan {
  id: string;
  name: string;
  currency: string;
  adultMinor: number;
  childMinor: number;
  infantMinor: number;
}

export interface ActivitySchedule {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedSeats: number;
  isBookable?: boolean;
}
export interface ActivityVariant { id: string; name: string; description?: string | null; isActive: boolean; }
export interface ActivityBooking { id: string; reference: string; status: string; customerName: string; totalMinor: number; currency: string; createdAt: string; schedule: { startsAt: string }; }

export interface Activity {
  id: string;
  name: string;
  slug: string;
  summary: string;
  description?: string;
  destination: string;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  destinationId?: string | null;
  timezone: string;
  durationMinutes: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt?: string | null;
  updatedAt: string;
  pricePlans: PricePlan[];
  schedules: ActivitySchedule[];
  minAge?: number | null;
  maxAge?: number | null;
  accessibility?: string | null;
  cancellationPolicy?: string | null;
  meetingPoint?: string | null;
  pickupOptions?: string[];
  inclusions?: string[];
  exclusions?: string[];
  images?: Array<{ url: string }>;
  variants?: ActivityVariant[];
  cancellationRules?: Array<{ id: string; hoursBefore: number; refundPercent: number }>;
  bookings?: ActivityBooking[];
  auditHistory?: Array<{ id: string; action: string; createdAt: string }>;
}
