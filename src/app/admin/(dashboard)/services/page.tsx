import { db } from "@/db";
import { services } from "@/db/schema";
import { asc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDuration } from "@/lib/utils";
import { ServiceManager } from "@/components/admin/service-manager";

export const dynamic = "force-dynamic";

export default async function AdminServicesPage() {
  const allServices = await db
    .select()
    .from(services)
    .orderBy(asc(services.sortOrder));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Services</h1>
      <ServiceManager initialServices={allServices} />
    </div>
  );
}
