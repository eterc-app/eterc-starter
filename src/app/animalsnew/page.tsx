"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Database, Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export default function AnimalsnewPage() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/cms/items/animalsnew");
      if (!res.ok) throw new Error("Failed to load records");
      const json = await res.json();
      setItems(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error loading records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/v1/cms/items/animalsnew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to create record");
      }
      toast.success("Record created successfully");
      setCreateOpen(false);
      setFormData({});
      await loadItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create record");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: unknown) => {
    if (!confirm("Are you sure you want to delete this record?")) return;
    try {
      const res = await fetch(`/api/v1/cms/items/animalsnew/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete record");
      toast.success("Record deleted");
      await loadItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete record");
    }
  };

  const filtered = items.filter((item) => {
    if (!search.trim()) return true;
    return Object.values(item).some((val) =>
      String(val ?? "").toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="mx-auto min-h-screen max-w-6xl p-6 sm:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ArrowLeft className="size-3.5" /> Home
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Animalsnew</h1>
            <Badge variant="secondary">{items.length} records</Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/admin/data?collection=animalsnew" target="_blank" rel="noreferrer" className="gap-1.5">
              <Database className="size-4" />
              Open Data Studio
            </a>
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="size-4" />
            New Record
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search animalsnew..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="ghost" size="icon" onClick={() => void loadItems()} disabled={loading} title="Refresh">
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Id</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="w-16 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    <Loader2 className="size-5 animate-spin mx-auto mb-2" />
                    Loading records...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No records found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item, idx) => (
                  <TableRow key={String(item["id"] ?? idx)}>
                    <TableCell className="font-mono text-xs">{String(item["id"] ?? "-")}</TableCell>
                    <TableCell className="font-mono text-xs">{String(item["title"] ?? "-")}</TableCell>
                    <TableCell className="font-mono text-xs">{String(item["status"] ?? "-")}</TableCell>
                    <TableCell className="font-mono text-xs">{String(item["created_at"] ?? "-")}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(item["id"])}
                        title="Delete"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Animalsnew</DialogTitle>
            <DialogDescription>
              Create a new entry in the animalsnew table via the CMS API.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Title *</label>
              <Input
                type="text"
                placeholder="Enter title"
                value={String(formData["title"] ?? "")}
                onChange={(e) => setFormData((prev) => ({ ...prev, "title": e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Status *</label>
              <Input
                type="text"
                placeholder="Enter status"
                value={String(formData["status"] ?? "")}
                onChange={(e) => setFormData((prev) => ({ ...prev, "status": e.target.value }))}
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin mr-1.5" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
