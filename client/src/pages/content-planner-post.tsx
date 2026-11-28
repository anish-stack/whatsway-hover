import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { PostComposer } from "@/components/social/PostComposer";
import { j, type Mode, type Platform, type Post } from "@/components/social/planner-shared";

/**
 * Full-page post editor.
 *   /content-planner/new?date=ISO&mode=instagram|facebook|both&platform=instagram&account=<id>&back=/instagram
 *   /content-planner/post/:id?back=/content-planner
 */
export default function ContentPlannerPostPage() {
  const [, navigate] = useLocation();
  const [isEdit, params] = useRoute("/content-planner/post/:id");
  const q = new URLSearchParams(window.location.search);
  const back = q.get("back") && q.get("back")!.startsWith("/") ? q.get("back")! : "/content-planner";
  const id = isEdit ? params!.id : null;

  const post = useQuery<{ data: Post }>({
    queryKey: ["/api/social/posts", "one", id],
    queryFn: () => j("GET", `/api/social/posts/${id}`),
    enabled: !!id,
    retry: false,
  });

  const date = q.get("date") ? new Date(q.get("date")!) : null;
  const mode = (["instagram", "facebook", "both"].includes(q.get("mode") || "") ? q.get("mode") : "instagram") as Mode;
  const platform = q.get("platform") as Platform | null;
  const account = platform && q.get("account") ? { platform, id: q.get("account")! } : null;
  const close = () => navigate(back);

  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title={id ? "Edit post" : "Create post"} subtitle="Instagram and Facebook — schedule, publish now or save a draft" />
      <main className="mx-auto w-full max-w-[1400px] space-y-4 p-4 sm:p-6 lg:p-8">
        <Button variant="ghost" className="-ml-2" onClick={close}><ArrowLeft className="mr-1.5 h-4 w-4" />Back to calendar</Button>
        {id && post.isLoading ? <Loader2 className="h-5 w-5 animate-spin" />
          : id && post.error ? <p className="text-sm text-destructive">{(post.error as any).message}</p>
            : <PostComposer key={id || "new"} post={id ? post.data?.data : null} defaultDate={date} defaultMode={mode} defaultAccount={account} onClose={close} />}
      </main>
    </div>
  );
}
