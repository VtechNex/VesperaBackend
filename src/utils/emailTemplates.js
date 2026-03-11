export function followUpEmailTemplate({
  assigneeName,
  leadName,
  leadEmail,
  leadMobile,
  listName,
  followUpDate,
  followUpNotes,
  followUpCount,
  repeatFollowUp,
  repeatInterval,
}) {
  const formattedDate = followUpDate
    ? new Date(followUpDate).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "(not set)";

  const noteHtml = followUpNotes
    ? `<p style="margin:0;font-size:14px;color:#333;white-space:pre-wrap;">${followUpNotes
        .replace(/\n/g, "<br />")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</p>`
    : "<p style=\"margin:0;font-size:14px;color:#333;\">(No follow-up notes provided)</p>";

  return `
    <div style="font-family:system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#111;">
      <div style="max-width:600px;margin:auto;padding:24px;background:#f6f7fb;border:1px solid #e1e3e8;border-radius:10px;">
        <h2 style="margin:0 0 16px;font-size:20px;color:#0b2b4f;">Follow-up reminder</h2>
        <p style="margin:0 0 18px;font-size:15px;color:#333;">Hi <strong>${assigneeName || "there"}</strong>,</p>

        <p style="margin:0 0 24px;font-size:14px;color:#4b4f60;">
          This is a reminder to follow up with the lead below. Please take the necessary action.
        </p>

        <div style="background:#fff;border:1px solid #e1e3e8;border-radius:8px;padding:16px;">
          <h3 style="margin:0 0 12px;font-size:16px;color:#0b2b4f;">Lead details</h3>
          <table style="width:100%;font-size:14px;color:#333;line-height:1.4;">
            <tr><td style="padding:4px 0;font-weight:600;">Name:</td><td style="padding:4px 0;">${leadName || "—"}</td></tr>
            <tr><td style="padding:4px 0;font-weight:600;">Email:</td><td style="padding:4px 0;">${leadEmail || "—"}</td></tr>
            <tr><td style="padding:4px 0;font-weight:600;">Mobile:</td><td style="padding:4px 0;">${leadMobile || "—"}</td></tr>
            <tr><td style="padding:4px 0;font-weight:600;">List:</td><td style="padding:4px 0;">${listName || "—"}</td></tr>
            <tr><td style="padding:4px 0;font-weight:600;">Scheduled follow-up:</td><td style="padding:4px 0;">${formattedDate}</td></tr>
            <tr><td style="padding:4px 0;font-weight:600;">Follow-ups sent:</td><td style="padding:4px 0;">${followUpCount ?? 0}</td></tr>
            <tr><td style="padding:4px 0;font-weight:600;">Repeat:</td><td style="padding:4px 0;">${repeatFollowUp ? `Yes (every ${repeatInterval || "—"})` : "No"}</td></tr>
          </table>

          <div style="margin-top:16px;">
            <h4 style="margin:0 0 8px;font-size:15px;color:#0b2b4f;">Follow-up notes</h4>
            ${noteHtml}
          </div>
        </div>

        <p style="margin:24px 0 0;font-size:12px;color:#6b7280;">This email was generated automatically by Vespera.</p>
      </div>
    </div>
  `;
}
