"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { formatPhone } from "@/lib/format";

type Initial = { name: string; address: string; phone: string };

export function BusinessInfoForm({ initial }: { initial: Initial }) {
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address);
  const [phone, setPhone] = useState(initial.phone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/business-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address, phone }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.error?.fieldErrors) {
          const first = Object.values(data.error.fieldErrors).flat()[0];
          setError(typeof first === "string" ? first : "Validation failed");
        } else {
          setError(typeof data?.error === "string" ? data.error : "Failed to save business info");
        }
        return;
      }

      setSuccess(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Business Info</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="biz-name">Business name</Label>
            <Input
              id="biz-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="biz-address">Address</Label>
            <Textarea
              id="biz-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Street address&#10;City, ST ZIP"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="biz-phone">Phone</Label>
            <Input
              id="biz-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              maxLength={50}
              placeholder="(555) 123-4567"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">Business info saved.</p>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
