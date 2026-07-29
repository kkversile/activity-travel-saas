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
}

export interface Activity {
  id: string;
  name: string;
  slug: string;
  summary: string;
  destination: string;
  durationMinutes: number;
  pricePlans: PricePlan[];
  schedules: ActivitySchedule[];
}
