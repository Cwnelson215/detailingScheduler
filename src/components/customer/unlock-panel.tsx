"use client";

import { useState } from "react";
import { ManagePanel } from "@/components/customer/manage-panel";
import { ChatBox } from "@/components/chat/chat-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The booking data ManagePanel needs, minus the Job ID — which is the secret the customer
// must supply here. The view page never sends the Job ID to the browser.
type BookingDetails = {
  serviceId: number;
  status: string;
  appointmentDate: string;
  appointmentTime: string; // HH:MM
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
};

type Step = "locked" | "jobId" | "code" | "unlocked";

export function UnlockPanel({ booking }: { booking: BookingDetails }) {
  const [step, setStep] = useState<Step>("locked");
  const [jobIdInput, setJobIdInput] = useState("");
  // The normalized Job ID returned by verify-code, used to address the manage/chat APIs.
  const [jobId, setJobId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobIdInput.trim())}/request-code`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "Request failed.");
      }
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobIdInput.trim())}/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "Invalid or expired code.");
      }
      setJobId(typeof data?.jobId === "string" ? data.jobId : jobIdInput.trim());
      setStep("unlocked");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "unlocked") {
    return (
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-foreground">Manage</h2>
          <ManagePanel booking={{ ...booking, jobId }} />
        </section>
        <section>
          <h2 className="mb-3 text-xl font-semibold text-foreground">Messages</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Questions about your appointment? Message us here — we&apos;ll reply in real time.
          </p>
          <ChatBox
            self="customer"
            historyUrl={`/api/jobs/${jobId}/messages`}
            sendUrl={`/api/jobs/${jobId}/messages`}
            streamUrl={`/api/jobs/${jobId}/messages/stream`}
          />
        </section>
      </div>
    );
  }

  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold text-foreground">Make changes or message us</h2>
      {step === "locked" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            To reschedule, cancel, edit your details, or message us, enter your Job ID — we&apos;ll
            email a one-time code to confirm it&apos;s you.
          </p>
          <Button variant="outline" onClick={() => setStep("jobId")}>
            Unlock changes
          </Button>
        </div>
      )}

      {step === "jobId" && (
        <form onSubmit={requestCode} className="max-w-sm space-y-4">
          <div>
            <Label htmlFor="jobId">Job ID</Label>
            <Input
              id="jobId"
              value={jobIdInput}
              onChange={(e) => setJobIdInput(e.target.value)}
              placeholder="ABCD-2345"
              autoComplete="off"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Find this in your confirmation email.
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <Button type="submit" disabled={busy || !jobIdInput.trim()}>
              {busy ? "Sending..." : "Email me a code"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setStep("locked")} disabled={busy}>
              Back
            </Button>
          </div>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verifyCode} className="max-w-sm space-y-4">
          <p className="text-sm text-muted-foreground">
            We emailed a 6-digit code to the address on your booking. Enter it below.
          </p>
          <div>
            <Label htmlFor="code">Verification code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              placeholder="123456"
              autoComplete="one-time-code"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <Button type="submit" disabled={busy || code.trim().length !== 6}>
              {busy ? "Verifying..." : "Unlock changes"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStep("jobId");
                setCode("");
                setError("");
              }}
              disabled={busy}
            >
              Back
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
