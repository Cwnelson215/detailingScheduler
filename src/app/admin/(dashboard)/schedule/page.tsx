import { db } from "@/db";
import { businessHours, availableDates } from "@/db/schema";
import { asc } from "drizzle-orm";
import { ScheduleManager } from "@/components/admin/schedule-manager";

export const dynamic = "force-dynamic";

export default async function AdminSchedulePage() {
  const hours = await db
    .select()
    .from(businessHours)
    .orderBy(asc(businessHours.dayOfWeek));

  const available = await db
    .select()
    .from(availableDates)
    .orderBy(asc(availableDates.date));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Schedule Management</h1>
      <ScheduleManager initialHours={hours} initialAvailableDates={available} />
    </div>
  );
}
