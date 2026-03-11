import cron from "node-cron";
import pool from "../db/pool.js";
import { sendEmail } from "./emailService.js";
import { followUpEmailTemplate } from "../utils/emailTemplates.js";

// Cron expression for follow-up processing.
// Default: every minute. Set FOLLOWUP_CRON in .env to change.
const FOLLOWUP_CRON = process.env.FOLLOWUP_CRON || "*/1 * * * *"; // every minute
let followUpJob = null;

export async function processDueFollowUps() {
  const client = await pool.connect();
  try {
    const now = new Date();

    const dueLeadsQuery = `
      SELECT
        ld.*,
        u.email AS assignee_email,
        u.username AS assignee_name,
        l.name AS list_name,
        l.owner_id AS list_owner_id,
        owner.email AS owner_email,
        owner.username AS owner_name
      FROM leads ld
      INNER JOIN lists l ON ld.list_id = l.id
      LEFT JOIN users u ON ld.assigned_to = u.id
      LEFT JOIN users owner ON l.owner_id = owner.id
      WHERE ld.follow_up_date IS NOT NULL
        AND ld.follow_up_date <= NOW()
        AND (ld.assigned_to IS NOT NULL OR l.owner_id IS NOT NULL)
      ORDER BY ld.follow_up_date ASC
      LIMIT 50
    `;

    const { rows: dueLeads } = await client.query(dueLeadsQuery);

    if (!dueLeads || dueLeads.length === 0) {
        console.log(`[followupService] No leads due for follow-up at ${now.toISOString()}`);
      return;
    }

    console.log(`[followupService] Found ${dueLeads.length} leads due for follow-up.`);
    // Get admin emails once (cached per run)
    const adminResult = await client.query(`SELECT email FROM users WHERE role = 'admin' AND is_active = true`);
    const adminEmails = adminResult.rows.map(r => r.email).filter(Boolean);

    for (const lead of dueLeads) {
      const to = lead.assignee_email || lead.owner_email;
      if (!to) {
        console.warn(
          `[followupService] Skipping lead ${lead.id} because there is no assignee or owner email.`
        );
        continue;
      }

      const ccList = new Set();
      if (lead.owner_email) ccList.add(lead.owner_email);
      adminEmails.forEach(email => ccList.add(email));

      const cc = Array.from(ccList).filter(Boolean);

      const subject = `Follow-up reminder: ${lead.fname || "Lead"} ${lead.lname || ""}`;
      const text = `Hello ${lead.assignee_name || "Team"},

This is a reminder to follow up with the lead:

Name: ${lead.fname || ""} ${lead.lname || ""}
Email: ${lead.email || "N/A"}
Mobile: ${lead.mobile || "N/A"}
List: ${lead.list_name || "N/A"}

Follow-up notes:
${lead.follow_up_notes || "(none)"}

Scheduled follow-up date: ${lead.follow_up_date}

Please take the necessary action.

Thanks,
Vespera System
`;

      try {
        const html = followUpEmailTemplate({
          assigneeName: lead.assignee_name,
          leadName: `${lead.fname || ""} ${lead.lname || ""}`.trim(),
          leadEmail: lead.email,
          leadMobile: lead.mobile,
          listName: lead.list_name,
          followUpDate: lead.follow_up_date,
          followUpNotes: lead.follow_up_notes,
          followUpCount: lead.follow_up_count,
          repeatFollowUp: lead.repeat_follow_up,
          repeatInterval: lead.repeat_interval,
        });

        await sendEmail({
          to,
          cc: cc.length ? cc : undefined,
          subject,
          text,
          html,
        });

        // Update lead to avoid sending again
        await client.query(
          `
            UPDATE leads
            SET
              follow_up_count = COALESCE(follow_up_count, 0) + 1,
              follow_up_date = CASE
                WHEN repeat_follow_up AND repeat_interval IS NOT NULL THEN follow_up_date + repeat_interval
                ELSE NULL
              END
            WHERE id = $1
          `,
          [lead.id]
        );

        console.log(`✅ Follow-up email sent for lead ${lead.id}`);
      } catch (err) {
        console.error(`❌ Failed to send follow-up email for lead ${lead.id}:`, err.message || err);
      }
    }
  } finally {
    client.release();
  }
}

export function startFollowUpScheduler(cronExpression = FOLLOWUP_CRON) {
  if (followUpJob) return;

  if (!cron.validate(cronExpression)) {
    console.warn(
      `[followupService] Invalid cron expression "${cronExpression}". Scheduler will not start.`
    );
    return;
  }

  followUpJob = cron.schedule(cronExpression, () => {
    console.log(`[followupService] Running scheduled follow-up check at ${new Date().toISOString()}`);
    processDueFollowUps().catch((err) => {
      console.error("[followupService] Error processing follow-ups:", err);
    });
  });

  followUpJob.start();
  console.log(`✅ Follow-up scheduler started (cron: ${cronExpression})`);
}

export function stopFollowUpScheduler() {
  if (!followUpJob) return;
  followUpJob.stop();
  followUpJob = null;
  console.log("🛑 Follow-up scheduler stopped");
}
