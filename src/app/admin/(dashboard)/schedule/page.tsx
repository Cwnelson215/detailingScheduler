import { db } from "@/db";
import { businessHours, blockedDates } from "@/db/schema";
import { asc } from "drizzle-orm";
import { ScheduleManager } from "@/components/admin/schedule-manager";

export const dynamic = "force-dynamic";

export default async function AdminSchedulePage() {
  const hours = await db
    .select()
    .from(businessHours)
    .orderBy(asc(businessHours.dayOfWeek));

  const blocked = await db
    .select()
    .from(blockedDates)
    .orderBy(asc(blockedDates.date));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Schedule Management</h1>
      <ScheduleManager initialHours={hours} initialBlockedDates={blocked} />
    </div>
  );
}
