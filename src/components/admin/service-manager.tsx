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
import { formatCurrency, formatDuration } from "@/lib/utils";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";

interface Service {
  id: number;
  name: string;
  description: string;
  durationMins: number;
  priceCents: number;
  isActive: boolean;
  sortOrder: number;
}

const emptyForm = {
  name: "",
  description: "",
  durationMins: 60,
  priceCents: 0,
  isActive: true,
  sortOrder: 0,
};

export function ServiceManager({ initialServices }: { initialServices: Service[] }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, sortOrder: initialServices.length });
    setDialogOpen(true);
  };

  const openEdit = (s: Service) => {
    setEditing(s);
    setForm({
      name: s.name,
      description: s.description,
      durationMins: s.durationMins,
      priceCents: s.priceCents,
      isActive: s.isActive,
      sortOrder: s.sortOrder,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setLoading(true);
    if (editing) {
      await fetch(`/api/services/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    setLoading(false);
    setDialogOpen(false);
    router.refresh();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this service? Existing bookings will keep their reference.")) return;
    await fetch(`/api/services/${id}`, { method: "DELETE" });
    router.refresh();
  };

  const handleToggle = async (s: Service) => {
    await fetch(`/api/services/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !s.isActive }),
    });
    router.refresh();
  };

  return (
    <>
      <Button onClick={openCreate}>
        <Plus className="h-4 w-4 mr-2" />
        Add Service
      </Button>

      <div className="grid gap-4">
        {initialServices.map((s) => (
          <Card key={s.id} className={!s.isActive ? "opacity-60" : ""}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{s.name}</p>
                  {!s.isActive && <Badge variant="secondary">Inactive</Badge>}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
                <p className="text-sm mt-1">
                  {formatCurrency(s.priceCents)} · {formatDuration(s.durationMins)} · Order: {s.sortOrder}
                </p>
              </div>
              <div className="flex gap-2 ml-4">
                <Button variant="ghost" size="sm" onClick={() => handleToggle(s)}>
                  {s.isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {initialServices.length === 0 && (
          <p className="text-muted-foreground text-sm">No services yet. Create one to get started.</p>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Service" : "Create Service"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  value={form.durationMins}
                  onChange={(e) => setForm({ ...form, durationMins: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Price ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={(form.priceCents / 100).toFixed(2)}
                  onChange={(e) =>
                    setForm({ ...form, priceCents: Math.round(parseFloat(e.target.value || "0") * 100) })
                  }
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading || !form.name}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Save Changes" : "Create Service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
