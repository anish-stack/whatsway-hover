import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Server, Edit, RefreshCw, CheckCircle, Plus, Trash2, Wifi, WifiOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Loading } from "@/components/ui/loading";
import StorageSettingsModal, {
  PROVIDER_LABELS,
  type StorageProvider,
} from "../modals/StorageSettingsModal";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";

interface StorageConfig {
  id: string;
  provider: StorageProvider;
  spaceName: string;
  endpoint?: string | null;
  region?: string | null;
  accessKey?: string;
  secretKey?: string;
  publicUrl?: string | null;
  isActive?: boolean;
  updatedAt?: string;
}

type Status = "online" | "offline" | "testing";

export default function StorageSettings(): JSX.Element {
  const [modal, setModal] = useState<{ open: boolean; data?: StorageConfig; provider?: StorageProvider }>({ open: false });
  const [status, setStatus] = useState<Record<string, Status>>({});
  const { toast } = useToast();
  const { user } = useAuth();
  const isDemo = user?.username === "demoadmin" || user?.username === "demouser";

  const { data: configs = [], isLoading, refetch } = useQuery<StorageConfig[]>({
    queryKey: ["/api/storage-settings"],
    queryFn: () =>
      fetch("/api/storage-settings").then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      }),
    retry: 1,
  });

  const list = Array.isArray(configs) ? configs : [];
  const configured = new Set(list.map((c) => c.provider));
  const missingProviders = (Object.keys(PROVIDER_LABELS) as StorageProvider[]).filter((p) => !configured.has(p));

  const test = async (c: StorageConfig) => {
    setStatus((s) => ({ ...s, [c.id]: "testing" }));
    try {
      const res = await apiRequest("POST", "/api/storage-settings/test", { id: c.id });
      const data = await res.json();
      setStatus((s) => ({ ...s, [c.id]: data.success ? "online" : "offline" }));
      toast({
        title: data.success ? "Connection online" : "Connection failed",
        description: data.success ? PROVIDER_LABELS[c.provider] : data.error,
        variant: data.success ? "default" : "destructive",
      });
    } catch {
      setStatus((s) => ({ ...s, [c.id]: "offline" }));
    }
  };

  const activate = async (c: StorageConfig) => {
    await apiRequest("POST", `/api/storage-settings/${c.id}/activate`);
    refetch();
  };

  const remove = async (c: StorageConfig) => {
    if (!window.confirm(`Delete ${PROVIDER_LABELS[c.provider]} config?`)) return;
    await apiRequest("DELETE", `/api/storage-settings/${c.id}`);
    refetch();
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex justify-center py-8">
          <Loading />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="flex items-center">
              <Server className="w-5 h-5 mr-2" />
              <span className="text-xl sm:text-2xl">Storage</span>
            </CardTitle>
            {missingProviders.length > 0 && (
              <Button
                size="sm"
                disabled={isDemo}
                onClick={() => setModal({ open: true, provider: missingProviders[0] })}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Provider
              </Button>
            )}
          </div>
          <CardDescription className="mt-2">
            Add keys for S3, Cloudflare R2 or Cloudinary. The active provider is used for uploads. If none is active,
            the first provider with keys is used. No keys = local disk.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {list.length === 0 && (
            <p className="text-sm text-muted-foreground">No storage configured. Files are saved on local disk.</p>
          )}

          {list.map((c) => {
            const st = status[c.id];
            return (
              <div key={c.id} className="border border-border rounded-lg p-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{PROVIDER_LABELS[c.provider] || c.provider}</h3>
                    <Badge variant={c.isActive ? "outline" : "secondary"} className={c.isActive ? "text-green-600" : ""}>
                      {c.isActive && <CheckCircle className="w-3 h-3 mr-1" />}
                      {c.isActive ? "Active" : "Inactive"}
                    </Badge>
                    {st && st !== "testing" && (
                      <Badge variant={st === "online" ? "default" : "destructive"}>
                        {st === "online" ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
                        {st}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!c.isActive && (
                      <Button size="sm" variant="outline" disabled={isDemo} onClick={() => activate(c)}>
                        Set Active
                      </Button>
                    )}
                    <Button size="sm" variant="outline" disabled={st === "testing"} onClick={() => test(c)}>
                      <RefreshCw className={`w-4 h-4 mr-1 ${st === "testing" ? "animate-spin" : ""}`} />
                      Test
                    </Button>
                    <Button size="sm" onClick={() => setModal({ open: true, data: c })}>
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" disabled={isDemo} onClick={() => remove(c)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <div>
                    {c.provider === "cloudinary" ? "Cloud" : "Bucket"}:{" "}
                    <span className="text-foreground">{c.spaceName}</span>
                  </div>
                  {c.region && <div>Region: <span className="text-foreground">{c.region}</span></div>}
                  {c.endpoint && <div className="break-all md:col-span-2">Endpoint: <span className="text-foreground">{c.endpoint}</span></div>}
                  {c.publicUrl && <div className="break-all md:col-span-2">Public URL: <span className="text-foreground">{c.publicUrl}</span></div>}
                  <div>Keys: ••••••••</div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <StorageSettingsModal
        open={modal.open}
        onOpenChange={(open) => setModal((m) => ({ ...m, open }))}
        existingData={modal.data}
        defaultProvider={modal.provider}
        onSuccess={() => {
          setModal({ open: false });
          refetch();
        }}
      />
    </div>
  );
}
