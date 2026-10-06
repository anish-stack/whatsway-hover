import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Plus, Send, Trash2, Link2, ExternalLink } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/ui/loading";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Application {
  id: string;
  displayName: string;
  legalBusinessName: string | null;
  website: string | null;
  businessCategory: string | null;
  country: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  supportingLinks: string[] | null;
  justification: string | null;
  status: string;
  reviewNotes: string | null;
  submittedAt: string | null;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, any> = {
  draft: "secondary",
  submitted: "warning",
  in_review: "warning",
  approved: "success",
  rejected: "destructive",
  withdrawn: "secondary",
};

const EMPTY = {
  displayName: "",
  legalBusinessName: "",
  website: "",
  businessCategory: "",
  country: "",
  contactEmail: "",
  contactPhone: "",
  wabaId: "",
  phoneNumberId: "",
  supportingLinks: "",
  justification: "",
};

export default function BlueTickPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: applications, isLoading } = useQuery<Application[]>({
    queryKey: ["/api/blue-tick"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/blue-tick");
      const json = await res.json();
      return json.data || [];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/blue-tick"] });

  const payload = () => ({
    ...form,
    supportingLinks: form.supportingLinks
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  });

  const save = async () => {
    setBusy(true);
    try {
      if (editing) {
        await apiRequest("PUT", `/api/blue-tick/${editing}`, payload());
        toast({ title: "Application updated" });
      } else {
        await apiRequest("POST", "/api/blue-tick", payload());
        toast({ title: "Draft created" });
      }
      setForm({ ...EMPTY });
      setEditing(null);
      setShowForm(false);
      refresh();
    } catch (error: any) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const submit = async (id: string) => {
    try {
      await apiRequest("POST", `/api/blue-tick/${id}/submit`, {});
      toast({
        title: "Submitted for review",
        description: "The platform team will take it forward with Meta.",
      });
      refresh();
    } catch (error: any) {
      toast({ title: "Not ready yet", description: error.message, variant: "destructive" });
    }
  };

  const remove = async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/blue-tick/${id}`);
      refresh();
      toast({ title: "Application deleted" });
    } catch (error: any) {
      toast({ title: "Could not delete", description: error.message, variant: "destructive" });
    }
  };

  const startEdit = (app: Application) => {
    setEditing(app.id);
    setShowForm(true);
    setForm({
      displayName: app.displayName || "",
      legalBusinessName: app.legalBusinessName || "",
      website: app.website || "",
      businessCategory: app.businessCategory || "",
      country: app.country || "",
      contactEmail: app.contactEmail || "",
      contactPhone: app.contactPhone || "",
      wabaId: app.wabaId || "",
      phoneNumberId: app.phoneNumberId || "",
      supportingLinks: (app.supportingLinks || []).join("\n"),
      justification: app.justification || "",
    });
  };

  if (isLoading) {
    return (
      <>
        <Header title="Green tick" subtitle="Official business account verification" />
        <div className="p-6">
          <Loading />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Green tick" subtitle="Official business account verification" />

      <div className="space-y-6 p-4 sm:p-6">
        <Card>
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex gap-3">
                <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold">What Meta looks for</p>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    A verified business on Facebook Business Manager, a display name that
                    matches your brand, a live website, and press coverage of your brand on
                    sites you do not own. Fill this in and submit; the platform team takes
                    it forward and records the outcome here.
                  </p>
                </div>
              </div>
              {!showForm && (
                <Button
                  className="gap-2"
                  onClick={() => {
                    setForm({ ...EMPTY });
                    setEditing(null);
                    setShowForm(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  New application
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {showForm && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {editing ? "Edit application" : "New application"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Display name <span className="text-[var(--bad)]">*</span>
                  </label>
                  <Input
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    placeholder="How your brand appears in WhatsApp"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Legal business name <span className="text-[var(--bad)]">*</span>
                  </label>
                  <Input
                    value={form.legalBusinessName}
                    onChange={(e) => setForm({ ...form, legalBusinessName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Website <span className="text-[var(--bad)]">*</span>
                  </label>
                  <Input
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    placeholder="https://"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    WABA ID <span className="text-[var(--bad)]">*</span>
                  </label>
                  <Input
                    value={form.wabaId}
                    onChange={(e) => setForm({ ...form, wabaId: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Phone number ID</label>
                  <Input
                    value={form.phoneNumberId}
                    onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Business category</label>
                  <Input
                    value={form.businessCategory}
                    onChange={(e) => setForm({ ...form, businessCategory: e.target.value })}
                    placeholder="Retail, healthcare, education…"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Country</label>
                  <Input
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Contact email</label>
                  <Input
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Contact phone</label>
                  <Input
                    value={form.contactPhone}
                    onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                  <Link2 className="h-3.5 w-3.5" />
                  Press / news links <span className="text-[var(--bad)]">*</span>
                </label>
                <Textarea
                  rows={4}
                  value={form.supportingLinks}
                  onChange={(e) => setForm({ ...form, supportingLinks: e.target.value })}
                  placeholder={"One URL per line\nhttps://news-site.com/article-about-your-brand"}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Coverage on sites you do not own. This is the part most applications fail
                  on.
                </p>
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-sm font-medium">Why you qualify</label>
                <Textarea
                  rows={3}
                  value={form.justification}
                  onChange={(e) => setForm({ ...form, justification: e.target.value })}
                />
              </div>

              <div className="mt-5 flex gap-2">
                <Button onClick={save} disabled={busy || !form.displayName}>
                  {busy ? "Saving…" : editing ? "Save changes" : "Create draft"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowForm(false);
                    setEditing(null);
                    setForm({ ...EMPTY });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Your applications</CardTitle>
          </CardHeader>
          <CardContent>
            {!applications?.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No applications yet.
              </p>
            ) : (
              <div className="space-y-3">
                {applications.map((app) => (
                  <div key={app.id} className="rounded-2xl border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{app.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {app.legalBusinessName || "No legal name"} ·{" "}
                          {app.website || "No website"}
                        </p>
                      </div>
                      <Badge variant={STATUS_VARIANT[app.status] || "secondary"}>
                        {app.status.replace("_", " ")}
                      </Badge>
                    </div>

                    {!!app.supportingLinks?.length && (
                      <div className="mt-3 space-y-1">
                        {app.supportingLinks.map((link, i) => (
                          <a
                            key={i}
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {link}
                          </a>
                        ))}
                      </div>
                    )}

                    {app.reviewNotes && (
                      <div className="mt-3 rounded-xl bg-muted p-3 text-sm">
                        <p className="text-xs font-semibold text-muted-foreground">
                          Review notes
                        </p>
                        <p className="mt-1">{app.reviewNotes}</p>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {["draft", "rejected"].includes(app.status) && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => startEdit(app)}>
                            Edit
                          </Button>
                          <Button size="sm" className="gap-1.5" onClick={() => submit(app.id)}>
                            <Send className="h-3.5 w-3.5" />
                            Submit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5"
                            onClick={() => remove(app.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-[var(--bad)]" />
                            Delete
                          </Button>
                        </>
                      )}
                      {app.submittedAt && (
                        <span className="self-center text-xs text-muted-foreground">
                          Submitted {new Date(app.submittedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
