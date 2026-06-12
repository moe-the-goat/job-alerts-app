import { createAdminClient } from "@/lib/supabase/admin";
import {
  approveRequest,
  hashToken,
  rejectRequest,
  type AccessRequestRow,
} from "@/lib/access-requests";

/**
 * One-click Approve/Reject endpoint for the links in the admin notification
 * email. The link carries a random token; we match its sha256 against the
 * stored hash, then run the shared decision logic. Returns a tiny HTML page
 * (this is opened in a browser from the email, not called by JS).
 *
 * No login required: knowledge of the unguessable per-request token IS the
 * authorization (same model as the email feedback links). The token is
 * single-use in effect — once the request leaves 'pending', re-clicking is a
 * harmless no-op.
 */

function page(title: string, body: string, color = "#0e1116"): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title></head>
    <body style="font-family:system-ui,sans-serif;background:${color};color:#e6edf3;
      display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;">
      <div style="max-width:420px;padding:32px;text-align:center;">
        <h1 style="font-size:20px;margin:0 0 8px;">${title}</h1>
        <p style="color:#9aa7b4;line-height:1.5;margin:0;">${body}</p>
      </div>
    </body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const action = url.searchParams.get("action") ?? "";

  if (!token || (action !== "approve" && action !== "reject")) {
    return page("Invalid link", "This decision link is malformed.");
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return page("Unavailable", "The server isn't configured to process this yet.");
  }

  const { data: reqRow } = await admin
    .from("access_requests")
    .select("id, email, first_name, last_name, status, note, created_at")
    .eq("decision_token_hash", hashToken(token))
    .maybeSingle<AccessRequestRow>();

  if (!reqRow) {
    return page("Link not found", "This request no longer exists or the link is wrong.");
  }

  if (reqRow.status !== "pending") {
    return page(
      "Already decided",
      `This request was already <b>${reqRow.status}</b>.`,
    );
  }

  const result =
    action === "approve"
      ? await approveRequest(reqRow)
      : await rejectRequest(reqRow);

  if (!result.ok) {
    return page("Something went wrong", result.error ?? "Please try the /admin page.");
  }

  if (action === "approve") {
    return page(
      "Approved ✓",
      `${reqRow.first_name} has been approved and emailed an invite to set up their account.`,
    );
  }
  return page(
    "Rejected",
    `${reqRow.first_name}'s request was declined and they've been notified.`,
  );
}
