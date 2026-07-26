import { MailWarning } from "lucide-react";

/**
 * Asks the user to rescue our sender from their spam folder.
 *
 * Why this exists: the setup code is delivered by Supabase's mailer, which
 * reaches inboxes reliably — but every ongoing email (the daily job digest, the
 * whole point of the product) is sent from our own address, which is prone to
 * spam filtering. Before, users were forced to dig our approval email out of
 * spam to sign up at all, and marking it "not spam" trained their provider as a
 * side effect. Now that setup no longer requires that, nothing teaches their
 * inbox to trust us — so their daily jobs would silently land in spam and they'd
 * conclude the product doesn't work. This asks explicitly for that one action,
 * at the moment they still have their mail open.
 */
export function DeliverabilityNotice({
  senderEmail,
  className,
}: {
  senderEmail?: string;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex items-start gap-2.5 rounded-lg border border-[var(--highlight-400)]/40",
        "bg-[var(--highlight-400)]/10 px-3.5 py-3 text-left",
        className ?? "",
      ].join(" ")}
    >
      <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-[var(--highlight-600)]" />
      <div className="text-[13px] leading-relaxed text-[var(--text-primary)]">
        <p className="font-medium">One important step — do this now</p>
        <p className="mt-1 text-[var(--text-secondary)]">
          Your daily job matches are emailed
          {senderEmail ? (
            <>
              {" "}
              from{" "}
              <span className="font-mono text-[12px] text-[var(--text-primary)]">
                {senderEmail}
              </span>
            </>
          ) : (
            " from us"
          )}
          , and that first message often lands in <strong>spam</strong>. Open
          your spam or junk folder, find it, and mark it{" "}
          <strong>&ldquo;Not spam&rdquo;</strong> (and add the address to your
          contacts).
        </p>
        <p className="mt-1.5 text-[var(--text-tertiary)]">
          Skip this and your job emails may keep going to spam — you&rsquo;d
          never see them.
        </p>
      </div>
    </div>
  );
}
