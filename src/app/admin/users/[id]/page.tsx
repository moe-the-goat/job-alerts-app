import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadUserDetail } from "../../_lib/user-detail";
import { UserDetailView } from "../../_components/user-detail";

export const metadata: Metadata = {
  title: "User · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Same gate as /admin — only the configured admin reaches this.
  const adminUserId = process.env.ADMIN_USER_ID;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!adminUserId || user.id !== adminUserId) redirect("/dashboard");

  const { id } = await params;
  if (!UUID_RE.test(id)) redirect("/admin?tab=analytics");

  const detail = await loadUserDetail(id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link
        href="/admin?tab=analytics"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to analytics
      </Link>
      <UserDetailView detail={detail} />
    </div>
  );
}
