import { apiRequest } from "./apiClient";

export type DashboardSummary = {
  publishedActivities: number;
  openBookings: number;
  upcomingSchedules: number;
  seatsAvailable: number;
  confirmedRevenueMinor: number;
  generatedAt: string;
};

export function getDashboardSummary() {
  return apiRequest<DashboardSummary>("/dashboard/summary");
}
