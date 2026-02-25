import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDuration } from "@/lib/utils";
import { Clock, DollarSign } from "lucide-react";

interface ServiceCardProps {
  service: {
    id: number;
    name: string;
    description: string;
    durationMins: number;
    priceCents: number;
  };
}

export function ServiceCard({ service }: ServiceCardProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-lg">{service.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <p className="text-sm text-muted-foreground flex-1">{service.description}</p>
        <div className="mt-4 flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-4 w-4" />
            {formatDuration(service.durationMins)}
          </span>
          <span className="flex items-center gap-1 font-semibold">
            <DollarSign className="h-4 w-4" />
            {formatCurrency(service.priceCents)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
