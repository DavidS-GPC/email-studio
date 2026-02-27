import { prisma } from "@/lib/prisma";

type TemplateSeed = {
  name: string;
  description: string;
  subject: string;
  html: string;
};

const defaultTemplates: TemplateSeed[] = [
  {
    name: "Sleek Product Launch",
    description: "Modern gradient hero with CTA block and feature grid.",
    subject: "We just launched something big 🚀",
    html: `
      <div style="margin:0;padding:24px;background:#f4f7fb;font-family:Segoe UI,Arial,sans-serif;">
        <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #d8e1f0;box-shadow:0 16px 42px rgba(15,23,42,.12);">
          <div style="padding:44px;background:linear-gradient(135deg,#0f172a,#2563eb);color:#fff;">
            <div style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.88;">New release</div>
            <div style="margin-top:12px;font-size:34px;line-height:1.2;font-weight:800;">Launch your next campaign with confidence</div>
            <div style="margin-top:12px;font-size:16px;line-height:1.7;opacity:.92;">Powerful workflows, instant updates, and polished messaging in one place.</div>
            <div style="margin-top:24px;">
              <a href="https://example.com" style="display:inline-block;padding:13px 24px;background:#fff;color:#0f172a;text-decoration:none;border-radius:999px;font-weight:700;">Explore now</a>
            </div>
          </div>

          <div style="padding:30px 30px 10px;color:#0f172a;">
            <div style="font-size:22px;font-weight:800;">Why teams love it</div>
            <div style="margin-top:10px;font-size:15px;line-height:1.7;color:#536279;">Designed for speed and clarity, without sacrificing enterprise-grade polish.</div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:12px 24px 28px;">
            <div style="padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;">
              <div style="font-size:15px;font-weight:700;color:#0f172a;">Smart audiences</div>
              <div style="margin-top:8px;font-size:14px;line-height:1.6;color:#64748b;">Target the exact contacts you need.</div>
            </div>
            <div style="padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;">
              <div style="font-size:15px;font-weight:700;color:#0f172a;">Design freedom</div>
              <div style="margin-top:8px;font-size:14px;line-height:1.6;color:#64748b;">Craft high-impact branded email visuals.</div>
            </div>
            <div style="padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;">
              <div style="font-size:15px;font-weight:700;color:#0f172a;">Clear reporting</div>
              <div style="margin-top:8px;font-size:14px;line-height:1.6;color:#64748b;">Track delivery success at contact level.</div>
            </div>
          </div>

          <div style="padding:0 24px 24px;color:#64748b;font-size:12px;line-height:1.5;">
            This message was sent from a no-reply address. Please do not reply directly to this email.
          </div>
        </div>
      </div>
    `.trim(),
  },
  {
    name: "Executive Alert Bulletin",
    description: "Clean corporate alert style for urgent operational updates.",
    subject: "Important service alert",
    html: `
      <div style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;">
        <div style="max-width:660px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
          <div style="padding:20px 28px;background:#0b1324;color:#fff;font-size:15px;font-weight:700;">Global Technology Notifications</div>
          <div style="padding:28px 28px 14px;color:#0f172a;font-size:34px;font-weight:800;line-height:1.2;">Service Alert</div>

          <div style="padding:0 28px;">
            <div style="padding:14px 16px;border-left:4px solid #2563eb;background:#eff6ff;color:#1e3a8a;border-radius:6px;">
              <div style="font-size:16px;line-height:1.65;">A temporary disruption has been identified with Microsoft 365 logins. Our team is actively resolving it.</div>
            </div>
          </div>

          <div style="padding:16px 28px 8px;color:#334155;font-size:16px;line-height:1.75;">Please review the details below and share internally as needed. We’ll continue providing live updates until full resolution.</div>

          <div style="padding:16px 28px 30px;">
            <a href="https://status.example.com" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">View live status</a>
          </div>

          <div style="padding:0 28px 24px;color:#64748b;font-size:12px;line-height:1.5;">
            This message was sent from a no-reply address. Please do not reply directly to this email.
          </div>
        </div>
      </div>
    `.trim(),
  },
  {
    name: "Promo Spotlight",
    description: "Sleek sales campaign layout with image-first storytelling.",
    subject: "A special offer picked for you",
    html: `
      <div style="margin:0;padding:24px;background:#eef2f7;font-family:Segoe UI,Arial,sans-serif;">
        <div style="max-width:660px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #d8e2ef;box-shadow:0 14px 35px rgba(15,23,42,.10);">
          <img src="https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1280&q=80" alt="Promo" style="display:block;width:100%;height:260px;object-fit:cover;" />

          <div style="padding:32px;">
            <div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#52627a;">Limited-time campaign</div>
            <div style="margin-top:10px;font-size:32px;line-height:1.2;font-weight:800;color:#0f172a;">Upgrade your setup with premium savings</div>
            <div style="margin-top:12px;font-size:16px;line-height:1.7;color:#4b5c73;">Deliver standout experiences with a premium platform tailored to fast-moving teams.</div>
            <div style="margin-top:24px;">
              <a href="https://example.com/offer" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:13px 24px;border-radius:999px;font-weight:700;">Claim Offer</a>
            </div>
          </div>

          <div style="padding:0 32px 24px;color:#64748b;font-size:12px;line-height:1.5;">
            This message was sent from a no-reply address. Please do not reply directly to this email.
          </div>
        </div>
      </div>
    `.trim(),
  },
];

export async function ensureDefaultTemplates() {
  for (const seed of defaultTemplates) {
    const existing = await prisma.emailTemplate.findFirst({
      where: { name: seed.name },
    });

    if (existing) {
      continue;
    }

    await prisma.emailTemplate.create({
      data: {
        name: seed.name,
        subject: seed.subject,
        description: seed.description,
        html: seed.html,
      },
    });
  }
}
