import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";

export type StorageProvider = "s3" | "r2" | "cloudinary" | "digitalocean";

export const PROVIDER_LABELS: Record<StorageProvider, string> = {
  s3: "Amazon S3",
  r2: "Cloudflare R2",
  cloudinary: "Cloudinary",
  digitalocean: "DigitalOcean Spaces",
};

interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  required?: boolean;
}

const FIELDS: Record<StorageProvider, FieldDef[]> = {
  s3: [
    { key: "spaceName", label: "Bucket Name", required: true },
    { key: "region", label: "Region", placeholder: "ap-south-1", required: true },
    { key: "accessKey", label: "Access Key ID", required: true },
    { key: "secretKey", label: "Secret Access Key", secret: true, required: true },
    { key: "endpoint", label: "Custom Endpoint (optional)" },
    { key: "publicUrl", label: "Public / CDN URL (optional)" },
  ],
  r2: [
    { key: "spaceName", label: "Bucket Name", required: true },
    { key: "endpoint", label: "Account ID or S3 API endpoint", placeholder: "https://<accountid>.r2.cloudflarestorage.com", required: true },
    { key: "accessKey", label: "Access Key ID", required: true },
    { key: "secretKey", label: "Secret Access Key", secret: true, required: true },
    { key: "publicUrl", label: "Public URL (r2.dev or custom domain — needed so WhatsApp can fetch media)", placeholder: "https://pub-xxxx.r2.dev", required: true },
  ],
  cloudinary: [
    { key: "spaceName", label: "Cloud Name", required: true },
    { key: "accessKey", label: "API Key", required: true },
    { key: "secretKey", label: "API Secret", secret: true, required: true },
  ],
  digitalocean: [
    { key: "spaceName", label: "Space Name", required: true },
    { key: "endpoint", label: "Endpoint", placeholder: "https://blr1.digitaloceanspaces.com", required: true },
    { key: "region", label: "Region", placeholder: "blr1" },
    { key: "accessKey", label: "Access Key", required: true },
    { key: "secretKey", label: "Secret Key", secret: true, required: true },
  ],
};

interface Props {
  open: boolean;
  onOpenChange: (val: boolean) => void;
  existingData?: any;
  defaultProvider?: StorageProvider;
  onSuccess: () => void;
}

const emptyForm = (provider: StorageProvider, data?: any) => ({
  id: data?.id || "",
  provider,
  spaceName: data?.spaceName || "",
  endpoint: data?.endpoint || "",
  region: data?.region || "",
  accessKey: data?.accessKey || "",
  secretKey: data?.secretKey || "",
  publicUrl: data?.publicUrl || "",
  isActive: data?.isActive || false,
});

export default function StorageSettingsModal({
  open,
  onOpenChange,
  existingData,
  defaultProvider = "s3",
  onSuccess,
}: Props) {
  const provider: StorageProvider = existingData?.provider || defaultProvider;
  const [form, setForm] = useState(emptyForm(provider, existingData));
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (open) setForm(emptyForm(provider, existingData));
  }, [open, existingData, provider]);

  const handleChange = (key: string, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const changeProvider = (p: StorageProvider) =>
    setForm((prev) => ({ ...emptyForm(p), isActive: prev.isActive }));

  const fields = FIELDS[form.provider];
  const missing = fields.some((f) => f.required && !(form as any)[f.key]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/storage-settings/update", form);
      if (!res.ok) throw new Error("Failed to update");
      toast({ title: "Updated", description: "Storage configuration saved." });
      onSuccess();
      onOpenChange(false);
    } catch {
      toast({
        title: "Error",
        description: "Failed to update storage.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isDemo = user?.username === "demoadmin" || user?.username === "demouser";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Storage Configuration</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Label>Provider</Label>
          <Select
            value={form.provider}
            onValueChange={(v) => changeProvider(v as StorageProvider)}
            disabled={!!existingData?.id}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PROVIDER_LABELS) as StorageProvider[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label>{f.label}</Label>
              <Input
                type={f.secret ? "password" : "text"}
                placeholder={f.placeholder}
                value={(form as any)[f.key]}
                onChange={(e) => handleChange(f.key, e.target.value)}
              />
            </div>
          ))}

          <div className="flex items-center justify-between mt-3">
            <Label>Active Storage</Label>
            <Switch
              checked={form.isActive}
              onCheckedChange={(val) => handleChange("isActive", val)}
            />
          </div>
        </div>

        <div className="flex justify-end mt-6 space-x-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || missing || isDemo}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
