import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDuration } from "@/lib/utils";
import { Clock } from "lucide-react";

export interface ServiceVariant {
  id: number;
  label: string | null;
  durationMins: number;
  priceCents: number;
}

export interface ServiceCategory {
  category: string;
  description: string;
  variants: ServiceVariant[];
}

export function ServiceCategoryCard({ category }: { category: ServiceCategory }) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-lg">{category.category}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <p className="text-sm text-muted-foreground">{category.description}</p>
        <div className="mt-4 space-y-2 border-t pt-4 text-sm">
          {category.variants.map((v) => (
            <div key={v.id} className="flex items-center gap-3">
              {v.label && <span className="font-medium">{v.label}</span>}
              <span className="ml-auto flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatDuration(v.durationMins)}
              </span>
              <span className="w-16 text-right font-semibold">
                {formatCurrency(v.priceCents)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
