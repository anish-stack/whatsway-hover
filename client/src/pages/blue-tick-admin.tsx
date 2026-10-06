import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, ExternalLink } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loading } from "@/components/ui/loading";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const STATUS_VARIANT: Record<string, any> = {
  draft: "secondary",
  submitted: "warning",
  in_review: "warning",
  approved: "success",
  rejected: "destructive",
  withdrawn: "secondary",
};

const FILTERS = ["", "submitted", "in_review", "approved", "rejected"];

export default function BlueTickAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [metaIds, setMetaIds] = useState<Record<string, string>>({});

  const { data: rows, isLoading } = useQuery<any[]>({
    queryKey: ["/api/blue-tick/admin/all", filter],
    queryFn: async () => {
      const url = filter
        ? `/api/blue-tick/admin/all?status=${filter}`
        : "/api/blue-tick/admin/all";
      const res = await apiRequest("GET", url);
      const json = await res.json();
      return json.data || [];
    },
  });

  const setStatus = async (id: string, status: string) => {
    try {
      await apiRequest("PUT", `/api/blue-tick/${id}/status`, {
        status,
        reviewNotes: notes[id] || undefined,
        metaSubmissionId: metaIds[id] || undefined,
      });
      toast({ title: `Marked ${status.replace("_", " ")}` });
      queryClient.invalidateQueries({ queryKey: ["/api/blue-tick/admin/all"] });
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <>
        <Header title="Green tick review" subtitle="Verification applications" />
        <div className="p-6">
          <Loading />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Green tick review" subtitle="Verification applications" />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {f ? f.replace("_", " ") : "All"}
            </button>
          ))}
        </div>

        {!rows?.length ? (
          <Card>
            <CardContent className="p-10 text-center">
              <BadgeCheck className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                Nothing in this queue.
              </p>
            </CardContent>
          </Card>
        ) : (
          rows.map((row) => {
            const app = row.application;
            return (
              <Card key={app.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
                    <span>{app.displayName}</span>
                    <Badge variant={STATUS_VARIANT[app.status] || "secondary"}>
                      {app.status.replace("_", " ")}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                    <div>
                      <span className="text-muted-foreground">Account: </span>
                      {row.username} ({row.email})
                    </div>
                    <div>
                      <span className="text-muted-foreground">Legal name: </span>
                      {app.legalBusinessName || "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Website: </span>
                      {app.website || "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">WABA: </span>
                      {app.wabaId || "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Category: </span>
                      {app.businessCategory || "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Country: </span>
                      {app.country || "—"}
                    </div>
                  </div>

                  {!!app.supportingLinks?.length && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-muted-foreground">
                        Press coverage
                      </p>
                      <div className="mt-1.5 space-y-1">
                        {app.supportingLinks.map((link: string, i: number) => (
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
                    </div>
                  )}

                  {app.justification && (
                    <div className="mt-4 rounded-xl bg-muted p-3 text-sm">
                      {app.justification}
                    </div>
                  )}

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Input
                      placeholder="Meta submission ID (optional)"
                      value={metaIds[app.id] ?? app.metaSubmissionId ?? ""}
                      onChange={(e) => setMetaIds({ ...metaIds, [app.id]: e.target.value })}
                    />
                  </div>

                  <Textarea
                    className="mt-3"
                    rows={2}
                    placeholder="Review notes shown to the client"
                    value={notes[app.id] ?? app.reviewNotes ?? ""}
                    onChange={(e) => setNotes({ ...notes, [app.id]: e.target.value })}
                  />

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setStatus(app.id, "in_review")}>
                      Mark in review
                    </Button>
                    <Button size="sm" onClick={() => setStatus(app.id, "approved")}>
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setStatus(app.id, "rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
