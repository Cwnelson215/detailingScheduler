import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDuration } from "@/lib/utils";
import { Clock } from "lucide-react";
import type { ServiceCategory } from "@/components/service-category-card";

export function FeaturedServiceCard({ category }: { category: ServiceCategory }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-8 sm:p-10">
        <h4 className="text-2xl font-bold sm:text-3xl">{category.category}</h4>
        <p className="mt-3 text-muted-foreground">{category.description}</p>

        <div className="mt-6 divide-y border-t border-b">
          {category.variants.map((v) => (
            <div key={v.id} className="flex items-center gap-4 py-3">
              {v.label && <span className="font-medium">{v.label}</span>}
              <span className="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {formatDuration(v.durationMins)}
              </span>
              <span className="w-20 text-right text-lg font-semibold">
                {formatCurrency(v.priceCents)}
              </span>
            </div>
          ))}
        </div>

        <Link
          href="/booking"
          className="mt-8 inline-flex w-full items-center justify-center rounded-md bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Book Now
        </Link>
      </CardContent>
    </Card>
  );
}
