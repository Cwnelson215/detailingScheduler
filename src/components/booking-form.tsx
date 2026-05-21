"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDuration } from "@/lib/utils";
import { CalendarPicker } from "@/components/calendar-picker";
import { TimeSlotPicker } from "@/components/time-slot-picker";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

interface Service {
  id: number;
  name: string;
  description: string;
  durationMins: number;
  priceCents: number;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

const steps = ["Service", "Date", "Time", "Details", "Review"];

export function BookingForm({ services }: { services: Service[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    vehicleYear: "",
    vehicleMake: "",
    vehicleModel: "",
    notes: "",
  });

  useEffect(() => {
    if (selectedDate && selectedService) {
      setLoadingSlots(true);
      setSelectedTime("");
      fetch(`/api/availability?date=${selectedDate}&serviceId=${selectedService.id}`)
        .then((r) => r.json())
        .then((data) => setSlots(data))
        .finally(() => setLoadingSlots(false));
    }
  }, [selectedDate, selectedService]);

  const canNext = () => {
    switch (step) {
      case 0: return !!selectedService;
      case 1: return !!selectedDate;
      case 2: return !!selectedTime;
      case 3:
        return (
          form.customerName &&
          form.customerEmail &&
          form.customerPhone &&
          form.vehicleYear &&
          form.vehicleMake &&
          form.vehicleModel
        );
      default: return true;
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: selectedService!.id,
          appointmentDate: selectedDate,
          appointmentTime: selectedTime,
          ...form,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(typeof data.error === "string" ? data.error : "Failed to create booking");
        return;
      }

      const booking = await res.json();
      router.push(`/confirmation?id=${booking.id}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimeDisplay = (time: string) => {
    const [h, m] = time.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${display}:${m} ${ampm}`;
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
                i <= step
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </div>
            <span className="text-sm hidden sm:inline">{s}</span>
            {i < steps.length - 1 && (
              <div className={`w-8 h-px ${i < step ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
      {/* Step 0: Select Service */}
      {step === 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Select a Service</h2>
          <div className="grid gap-3">
            {services.map((service) => (
              <Card
                key={service.id}
                className={`cursor-pointer transition-colors ${
                  selectedService?.id === service.id
                    ? "border-primary ring-2 ring-primary/20"
                    : "hover:border-primary/50"
                }`}
                onClick={() => setSelectedService(service)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{service.name}</p>
                    <p className="text-sm text-muted-foreground">{service.description}</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="font-semibold">{formatCurrency(service.priceCents)}</p>
                    <p className="text-sm text-muted-foreground">{formatDuration(service.durationMins)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Select Date */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Choose a Date</h2>
          <CalendarPicker
            selected={selectedDate}
            onSelect={(date) => setSelectedDate(date)}
          />
        </div>
      )}

      {/* Step 2: Select Time */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Choose a Time</h2>
          {loadingSlots ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <TimeSlotPicker
              slots={slots}
              selected={selectedTime}
              onSelect={setSelectedTime}
            />
          )}
        </div>
      )}

      {/* Step 3: Customer Details */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Your Information</h2>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.customerEmail}
                  onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.customerPhone}
                  onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="year">Vehicle Year</Label>
                <Input
                  id="year"
                  value={form.vehicleYear}
                  onChange={(e) => setForm({ ...form, vehicleYear: e.target.value })}
                  placeholder="2024"
                  maxLength={4}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="make">Make</Label>
                <Input
                  id="make"
                  value={form.vehicleMake}
                  onChange={(e) => setForm({ ...form, vehicleMake: e.target.value })}
                  placeholder="Toyota"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={form.vehicleModel}
                  onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })}
                  placeholder="Camry"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Any special requests or details about your vehicle..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Review */}
      {step === 4 && selectedService && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Review Your Booking</h2>
          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service</span>
                <span className="font-medium">{selectedService.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price</span>
                <span className="font-medium">{formatCurrency(selectedService.priceCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time</span>
                <span className="font-medium">{formatTimeDisplay(selectedTime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium">{formatDuration(selectedService.durationMins)}</span>
              </div>
              <hr />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{form.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium">{form.customerEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span className="font-medium">{form.customerPhone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vehicle</span>
                <span className="font-medium">{form.vehicleYear} {form.vehicleMake} {form.vehicleModel}</span>
              </div>
              {form.notes && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Notes</span>
                  <span className="font-medium max-w-xs text-right">{form.notes}</span>
                </div>
              )}
            </CardContent>
          </Card>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 flex justify-between border-t border-border pt-6">
        <Button
          variant="outline"
          onClick={() => setStep(step - 1)}
          disabled={step === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        {step < 4 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirm Booking
          </Button>
        )}
      </div>
      </div>
    </div>
  );
}
