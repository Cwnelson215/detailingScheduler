import { db } from "@/db";
import { promoCodes, referralTokens } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DiscountManager } from "@/components/admin/discount-manager";

export const dynamic = "force-dynamic";

export default async function AdminDiscountsPage() {
  const allCodes = await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));

  // Referral program overview (read-only): how many 15% credits have been earned and redeemed.
  const [refStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      available: sql<number>`coalesce(sum(case when ${referralTokens.status} = 'available' then 1 else 0 end), 0)::int`,
      applied: sql<number>`coalesce(sum(case when ${referralTokens.status} = 'applied' then 1 else 0 end), 0)::int`,
    })
    .from(referralTokens);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Discounts</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Promo codes</h2>
        <p className="text-sm text-muted-foreground">
          Codes customers enter at booking. Set a max-use count to cap it (e.g. 10% off for the
          first 5 customers). The same-day 20% and referral 15% are automatic and don&apos;t need a
          code.
        </p>
        <DiscountManager initialCodes={allCodes} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Referral credits</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">15% referral program</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-8 text-sm">
            <Stat label="Earned" value={refStats?.total ?? 0} />
            <Stat label="Available" value={refStats?.available ?? 0} />
            <Stat label="Redeemed" value={refStats?.applied ?? 0} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-muted-foreground">{label}</p>
    </div>
  );
}
