"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";

interface PromoCode {
  id: number;
  code: string;
  description: string;
  percentOff: number;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
  expiresAt: string | null;
}

const emptyForm = {
  code: "",
  description: "",
  percentOff: 10,
  maxUses: "" as string, // "" = unlimited
  expiresAt: "" as string, // "" = never
  isActive: true,
};

export function DiscountManager({ initialCodes }: { initialCodes: PromoCode[] }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const { confirm, dialog } = useConfirm();

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (c: PromoCode) => {
    setEditing(c);
    setForm({
      code: c.code,
      description: c.description,
      percentOff: c.percentOff,
      maxUses: c.maxUses == null ? "" : String(c.maxUses),
      expiresAt: c.expiresAt ?? "",
      isActive: c.isActive,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const payload = {
        code: form.code,
        description: form.description,
        percentOff: form.percentOff,
        maxUses: form.maxUses === "" ? null : parseInt(form.maxUses) || null,
        expiresAt: form.expiresAt === "" ? null : form.expiresAt,
        isActive: form.isActive,
      };
      const res = editing
        ? await fetch(`/api/admin/promo-codes/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/promo-codes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(typeof data?.error === "string" ? data.error : "Couldn't save the code.");
        return;
      }
      toast.success(editing ? "Promo code updated." : "Promo code created.");
      setDialogOpen(false);
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm({
      title: "Delete this promo code?",
      description: "Bookings that already used it keep their discounted price.",
      confirmLabel: "Delete code",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/promo-codes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Couldn't delete the code. Please try again.");
      return;
    }
    toast.success("Promo code deleted.");
    router.refresh();
  };

  const handleToggle = async (c: PromoCode) => {
    const res = await fetch(`/api/admin/promo-codes/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    if (!res.ok) {
      toast.error("Couldn't update the code. Please try again.");
      return;
    }
    toast.success(c.isActive ? "Code deactivated." : "Code activated.");
    router.refresh();
  };

  return (
    <>
      <Button onClick={openCreate}>
        <Plus className="h-4 w-4 mr-2" />
        Add Promo Code
      </Button>

      <div className="grid gap-4">
        {initialCodes.map((c) => {
          const exhausted = c.maxUses != null && c.usedCount >= c.maxUses;
          return (
            <Card key={c.id} className={!c.isActive ? "opacity-60" : ""}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-semibold tracking-wide">{c.code}</p>
                    <Badge variant="secondary">{c.percentOff}% off</Badge>
                    {!c.isActive && <Badge variant="secondary">Inactive</Badge>}
                    {exhausted && <Badge variant="secondary">Used up</Badge>}
                  </div>
                  {c.description && (
                    <p className="text-sm text-muted-foreground mt-1">{c.description}</p>
                  )}
                  <p className="text-sm mt-1">
                    Used {c.usedCount}
                    {c.maxUses != null ? ` / ${c.maxUses}` : " (unlimited)"}
                    {c.expiresAt ? ` · Expires ${c.expiresAt}` : ""}
                  </p>
                </div>
                <div className="flex gap-2 ml-4">
                  <Button variant="ghost" size="sm" onClick={() => handleToggle(c)}>
                    {c.isActive ? "Deactivate" : "Activate"}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {initialCodes.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No promo codes yet. Create one (e.g. 10% off, limited to 5 uses) to get started.
          </p>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Promo Code" : "Create Promo Code"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="LAUNCH10"
              />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="10% off for the first 5 customers"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Percent off (%)</Label>
                <Input
                  type="number"
                  value={form.percentOff}
                  onChange={(e) => setForm({ ...form, percentOff: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Max uses (blank = unlimited)</Label>
                <Input
                  type="number"
                  value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                  placeholder="5"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Expires on (blank = never)</Label>
              <Input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Active
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading || !form.code}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Save Changes" : "Create Code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}
