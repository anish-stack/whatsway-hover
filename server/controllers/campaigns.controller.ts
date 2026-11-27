/**
 * ============================================================
 *  © 2026 Hover Business Services LLP — a brand of Hover Business Services LLP
 * Original Author: BTPL Engineering Team
 * Website: https://hoverbusinessservices.com
 * Contact: info@hovermedia.in
 *
  
 *
  
 * ============================================================
 */

import { asyncHandler } from "../utils/async-handler";
import { DiployError, asyncHandler as _dHandler, diployLogger, HTTP_STATUS } from "@diploy/core";
import { storage } from "../storage";
import { z } from "zod";
import type { Contact } from "@shared/schema";
import { randomUUID } from "crypto";
import { WhatsAppApiService } from "../services/whatsapp-api";
import { MessageQueueService } from "../services/message-queue";
import { addBulkMessagesToBullQueue, isBullQueueAvailable, ensureBullProducer } from '../services/bull-queue';
import { triggerNotification, NOTIFICATION_EVENTS } from "../services/notification.service";
import { db, dbRead } from "../db";
import { channels, messageQueue, users } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { parseMessagingTier } from "../utils/messaging-tiers";
import { ensureOtpButton, isAuthTemplate } from "../utils/auth-template";
import { ensureFlowButton } from "../utils/flow-template";
import { fetchLiveTemplate, mergeLiveTemplate, reconcileComponents, templateVarKeys, textParam } from "../utils/template-params";
import {
  checkCampaignReadiness,
  checkCampaignRowReadiness,
  resolveOwnerId,
} from "../services/meta-billing/readiness.service";

/** Owner (tenant) id for readiness; null for superadmin (skips subscription/ownership). */
async function readinessOwner(user: { id: string; role: string } | undefined): Promise<string | null> {
  if (!user) return null;
  if (user.role === "superadmin") return null;
  return resolveOwnerId(user.id);
}

function notReady(res: any, readiness: any) {
  return res.status(409).json({
    error: readiness.blockingReason || "WhatsApp account is not ready to send campaigns.",
    code: "WHATSAPP_NOT_READY",
    readiness,
  });
}

export { parseMessagingTier };

// async function notifyCampaignCompletion(campaignId: string) {
//   try {
//     const campaign = await storage.getCampaign(campaignId);
//     if (!campaign || !campaign.channelId) return;

//     const channel = await dbRead.select().from(channels).where(eq(channels.id, campaign.channelId)).limit(1);
//     const channelName = channel[0]?.name || "Unknown";
//     if (!channel[0]?.createdBy) return;
//     const ownerId = channel[0].createdBy;
//     const ownerAndTeam = await dbRead.select().from(users).where(eq(users.id, ownerId));
//     const teamMembers = await dbRead.select().from(users).where(eq(users.createdBy, ownerId));
//     const allUsers = [...ownerAndTeam, ...teamMembers];
//     const targetUserIds = [...new Set(allUsers.map((u) => u.id))];
//     if (targetUserIds.length === 0) return;

//     const hasFailed = (campaign.failedCount || 0) > (campaign.sentCount || 0);
//     const eventType = hasFailed ? NOTIFICATION_EVENTS.CAMPAIGN_FAILED : NOTIFICATION_EVENTS.CAMPAIGN_COMPLETED;

//     await triggerNotification(eventType, {
//       campaignName: campaign.name || "Untitled Campaign",
//       totalSent: String(campaign.sentCount || 0),
//       deliveredCount: String((campaign.sentCount || 0) - (campaign.failedCount || 0)),
//       failedCount: String(campaign.failedCount || 0),
//       errorMessage: hasFailed ? "Some messages could not be delivered" : "",
//       channelName,
//     }, targetUserIds, campaign.channelId || undefined);
//   } catch (err) {
//     console.error("Error sending campaign completion notification:", err);
//   }
// }



const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || "v25.0";

const variableValueSchema = z.union([
  z.object({
    type: z.enum(["firstName", "lastName", "fullName", "phone", "custom"]),
    value: z.string().optional(),
  }),
  z.string(),
]).transform(val => {
  if (typeof val === "string") {
    // If it's a simple string, treat it as a custom type with that value
    // or if it matches a known type, use that type.
    const knownTypes = ["firstName", "lastName", "fullName", "phone", "custom"];
    if (knownTypes.includes(val)) {
      return { type: val as any, value: "" };
    }
    return { type: "custom" as const, value: val };
  }
  return val;
});

const buttonMappingSchema = z.record(z.union([
  z.object({
    type: z.string().optional(),
    value: z.string().optional(),
  }),
  z.string(),
]).transform(val => {
  if (typeof val === "string") {
    return { type: "custom", value: val };
  }
  return val;
}));

const variableMappingSchema = z.object({
  buttons: buttonMappingSchema.optional(),
  headerVars: z.record(variableValueSchema).optional(),
  uploadedMediaId: z.string().optional(),
  headerType: z.string().optional(),
  expirationTimeMs: z.number().optional(),
  carouselCardMediaIds: z.record(z.string()).optional(),
  carouselCards: z.array(z.object({
    bodyVars: z.record(variableValueSchema).optional(),
    buttons: z.array(z.record(variableValueSchema)).optional(),
  })).optional(),
}).catchall(variableValueSchema);

const createCampaignSchema = z.object({
  channelId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  campaignType: z.enum(["contacts", "csv", "api"]),
  type: z.enum(["marketing", "transactional"]),
  apiType: z.enum(["cloud_api", "marketing_messages", "mm_lite"]),
  templateId: z.string(),
  templateName: z.string(),
  templateLanguage: z.string(),
  variableMapping: variableMappingSchema.optional(),
  status: z.string(),
  scheduledAt: z
    .string()
    .datetime({ offset: true, message: "scheduledAt must be a valid ISO 8601 datetime string with a timezone offset (e.g. 2026-04-08T09:30:00.000Z). Bare local datetime strings are not accepted." })
    .nullable(),
  contactGroups: z.array(z.string()).optional(),
  csvData: z.array(z.any()).optional(),
  recipientCount: z.number(),
  autoRetry: z.boolean().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(["paused", "sending"], {
    errorMap: () => ({ message: "Status must be 'paused' or 'sending'. Use other endpoints for draft/active/completed transitions." }),
  }),
});


async function ownedCampaign(req: any, res: any) {
  const c = await storage.getCampaign(req.params.id);
  const owner = await readinessOwner(req.user);
  if (c && owner) {
    const ch = c.channelId ? await storage.getChannel(c.channelId) : undefined;
    if (!ch || ch.createdBy !== owner) { res.status(404).json({ error: "Campaign not found" }); return null; }
  }
  if (!c) { res.status(404).json({ error: "Campaign not found" }); return null; }
  return c;
}

function cloneCampaignFields(src: any, over: Record<string, any>) {
  return {
    channelId: src.channelId, name: src.name, description: src.description, campaignType: src.campaignType,
    type: src.type, apiType: src.apiType, templateId: src.templateId, templateName: src.templateName,
    templateLanguage: src.templateLanguage, variableMapping: src.variableMapping || {},
    contactGroups: src.contactGroups || [], csvData: [], recipientCount: src.recipientCount || 0,
    scheduledAt: null, ...over,
  };
}

export const campaignsController = {
  // Get all campaigns
  getCampaignsOLL: asyncHandler(async (req, res) => {
    const channelId = req.headers["x-channel-id"] as string;
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const user = (req.session as any)?.user;

    if (channelId) {
      if (user && user.role !== 'superadmin') {
        const ownerId = user.role === 'team' ? user.createdBy : user.id;
        const channels = await storage.getChannelsByUserId(ownerId);

        const channelIds = channels.map((ch: any) => ch.id);
        if (!channelIds.includes(channelId)) {
          return res.status(403).json({ error: 'Access denied to this channel' });
        }
      }
      const campaigns = await storage.getCampaignsByChannel(channelId, page, limit);
      res.json(campaigns);
    } else if (user && user.role === 'superadmin') {
      const campaigns = await storage.getCampaigns(page, limit);
      res.json(campaigns);
    } else {
      const ownerId = user?.role === 'team' ? user?.createdBy : user?.id;
      if (!ownerId) return res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      const channels = await storage.getChannelsByUserId(ownerId);
      if (channels.length === 0) return res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      const campaigns = await storage.getCampaignsByChannel(channels[0].id, page, limit);
      res.json(campaigns);
    }
  }),


  getCampaigns: asyncHandler(async (req, res) => {
    const channelId = req.headers["x-channel-id"] as string;
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const user = (req.session as any)?.user;

    let campaigns: any;

    if (channelId) {
      if (user && user.role !== 'superadmin') {
        const ownerId = user.role === 'team' ? user.createdBy : user.id;
        const channels = await storage.getChannelsByUserId(ownerId);
        const channelIds = channels.map((ch: any) => ch.id);
        if (!channelIds.includes(channelId)) {
          return res.status(403).json({ error: 'Access denied to this channel' });
        }
      }
      campaigns = await storage.getCampaignsByChannel(channelId, page, limit);
    } else if (user && user.role === 'superadmin') {
      campaigns = await storage.getCampaigns(page, limit);
    } else {
      const ownerId = user?.role === 'team' ? user?.createdBy : user?.id;
      if (!ownerId) return res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      const channels = await storage.getChannelsByUserId(ownerId);
      if (channels.length === 0) return res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      campaigns = await storage.getCampaignsByChannel(channels[0].id, page, limit);
    }

    // ✅ Sirf yahan stats calculate karo — ALL campaigns se (data array mein poora data nahi, 
    // toh allData alag fetch karo only for stats)
    const allData: any[] = campaigns.data || [];
    
    // Agar pagination hai aur total > limit, toh stats ke liye ek baar full fetch
    const total = campaigns.total || campaigns.pagination?.total || 0;
    let statsSource = allData;
    
    if (total > limit) {
      // Sirf stats ke liye full list fetch (no pagination)
      let fullCampaigns: any;
      if (channelId) {
        fullCampaigns = await storage.getCampaignsByChannel(channelId, 1, total);
      } else if (user?.role === 'superadmin') {
        fullCampaigns = await storage.getCampaigns(1, total);
      } else {
        const ownerId = user?.role === 'team' ? user?.createdBy : user?.id;
        const channels = await storage.getChannelsByUserId(ownerId);
        fullCampaigns = await storage.getCampaignsByChannel(channels[0].id, 1, total);
      }
      statsSource = fullCampaigns?.data || allData;
    }

    const stats = {
  totalCampaigns: total,
  activeCampaigns: statsSource.filter((c: any) => c.status === 'active').length,
  totalRecipients: statsSource.reduce((sum: number, c: any) => sum + (Number(c.recipientCount) || 0), 0),
  totalSent:       statsSource.reduce((sum: number, c: any) => sum + (Number(c.sentCount) || 0), 0),
  totalDelivered:  statsSource.reduce((sum: number, c: any) => sum + (Number(c.deliveredCount) || 0), 0),
  totalRead:       statsSource.reduce((sum: number, c: any) => sum + (Number(c.readCount) || 0), 0),
  totalFailed:     statsSource.reduce((sum: number, c: any) => sum + (Number(c.failedCount) || 0), 0),
};

    res.json({ ...campaigns, stats });
  }),

  // Get campaign by ID
  getCampaign: asyncHandler(async (req, res) => {
    const campaign = await storage.getCampaign(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    const user = (req.session as any)?.user;
    if (user && user.role !== 'superadmin' && campaign.channelId) {
      const ownerId = user.role === 'team' ? user.createdBy : user.id;
      const channels = await storage.getChannelsByUserId(ownerId);
      const channelIds = channels.map((ch: any) => ch.id);
      if (!channelIds.includes(campaign.channelId)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    res.json(campaign);
  }),


 getCampaignByUserIDOLDD: asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const user = (req.session as any)?.user;

  if (user && user.role !== 'superadmin') {
    const ownerId = user.role === 'team' ? user.createdBy : user.id;
    if (userId !== ownerId && userId !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  const page = Number(req.body.page) || 1;
  const limit = Number(req.body.limit) || 10;

  const campaign = await storage.getCampaignByUserId(userId, page, limit);

  res.json(campaign);
}),



getCampaignByUserID: asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const user = (req.session as any)?.user;

  if (user && user.role !== 'superadmin') {
    const ownerId = user.role === 'team' ? user.createdBy : user.id;
    if (userId !== ownerId && userId !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  const page = Number(req.body.page) || 1;
  const limit = Number(req.body.limit) || 10;

  const campaign = await storage.getCampaignByUserId(userId, page, limit);

  // ✅ Stats logic
  const allData: any[] = campaign.data || [];
  const total = campaign.total || campaign.pagination?.total || 0;
  let statsSource = allData;

  if (total > limit) {
    const fullCampaigns = await storage.getCampaignByUserId(userId, 1, total);
    statsSource = fullCampaigns?.data || allData;
  }

  const stats = {
    totalCampaigns: total,
    activeCampaigns: statsSource.filter((c: any) => c.status === 'active').length,
    totalRecipients: statsSource.reduce((sum: number, c: any) => sum + (Number(c.recipientCount) || 0), 0),
    totalSent:       statsSource.reduce((sum: number, c: any) => sum + (Number(c.sentCount) || 0), 0),
    totalDelivered:  statsSource.reduce((sum: number, c: any) => sum + (Number(c.deliveredCount) || 0), 0),
    totalRead:       statsSource.reduce((sum: number, c: any) => sum + (Number(c.readCount) || 0), 0),
    totalFailed:     statsSource.reduce((sum: number, c: any) => sum + (Number(c.failedCount) || 0), 0),
  };

  res.json({ ...campaign, stats });
}),



  createCampaign: asyncHandler(async (req, res) => {
  const data = createCampaignSchema.parse(req.body);

  if (!req.user?.id) {
    return res
      .status(401)
      .json({ status: "error", message: "User not authenticated" });
  }

  const createdBy = req.user.id;

  // Server-side WhatsApp readiness gate for campaigns that start right now.
  // Scheduled campaigns are re-checked when the scheduler fires them.
  if (data.status === "active" && !data.scheduledAt && data.campaignType !== "api") {
    const readiness = await checkCampaignReadiness({
      channelId: data.channelId,
      templateId: data.templateId,
      recipientCount: null, // messaging-limit check below keeps its existing message
      ownerId: await readinessOwner(req.user),
    });
    if (!readiness.ready) return notReady(res, readiness);
  }

  let apiKey: string | undefined;
  let apiEndpoint: string | undefined;
  if (data.campaignType === "api") {
    apiKey = `ww_${randomUUID().replace(/-/g, "")}`;
    apiEndpoint = `${req.protocol}://${req.get("host")}/api/campaigns/send/${apiKey}`;
  }

  let contactIds: string[] = [];
  if (data.campaignType === "csv" && data.csvData) {
    for (const row of data.csvData) {
      if (row.phone) {
        let contact = await storage.getContactByPhoneAndChannel(row.phone, data.channelId);
        if (!contact) {
          contact = await storage.createContact({
            channelId: data.channelId,
            name: row.name || row.phone,
            phone: row.phone,
            email: row.email || null,
            groups: ["csv_import"],
            tags: [`campaign_${data.name}`],
          });
        } else {
          const currentTags: string[] = (contact.tags as string[]) || [];
          const campaignTag = `campaign_${data.name}`;
          if (!currentTags.includes(campaignTag)) {
            await storage.updateContact(contact.id, {
              tags: [...currentTags, campaignTag],
            });
          }
        }
        contactIds.push(contact.id);
      }
    }
  } else if (data.campaignType === "contacts") {
    contactIds = data.contactGroups || [];
  }

  const recipientCount = contactIds.length;

  const channel = await storage.getChannel(data.channelId);
  if (!channel) {
    return res.status(400).json({ error: "Channel not found" });
  }
  const messagingLimit = parseMessagingTier(
    (channel.healthDetails as any)?.messaging_limit
  );
  if (messagingLimit !== Infinity && recipientCount > messagingLimit) {
    const lastCheckedHint = channel.lastHealthCheck
      ? (() => {
          const diffMs = Date.now() - new Date(channel.lastHealthCheck).getTime();
          const diffHours = Math.round(diffMs / 3_600_000);
          const diffDays = Math.round(diffMs / 86_400_000);
          const ago =
            diffHours < 1
              ? "less than an hour ago"
              : diffHours < 24
              ? `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
              : `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
          return ` Last checked ${ago} — run a health check in Channel Settings to refresh your tier.`;
        })()
      : " Run a health check in Channel Settings to confirm your tier.";
    return res.status(400).json({
      error: `Your channel's messaging limit is ${messagingLimit.toLocaleString()} messages per 24 hours. You selected ${recipientCount.toLocaleString()} recipients. Please reduce the number of contacts or upgrade your WhatsApp tier.${lastCheckedHint}`,
      lastChecked: channel.lastHealthCheck ?? null,
    });
  }

  // Check the template values against Meta before saving (blocks #132000-type failures)
  if (data.campaignType !== "api" && data.templateId) {
    const template = await storage.getTemplate(data.templateId);
    if (template) {
      const prepared = await prepareCampaignTemplate(channel, template, data.templateLanguage, "create");
      const blocking = checkCampaignValues(prepared, data.variableMapping, template).filter((i) => i.level === "error");
      if (blocking.length) {
        return res.status(400).json({ error: blocking.map((i) => i.message).join(" "), issues: blocking, code: "TEMPLATE_VALUES_INVALID" });
      }
    }
  }

  // Build campaign object (to save + for runner)
  const campaignDataToSave = {
    ...data,
    apiKey,
    apiEndpoint,
    recipientCount,
    contactGroups: contactIds,
    scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
    variableMapping: data.variableMapping,
    createdBy,
  };

  // Save campaign to DB
  const campaign = await storage.createCampaign(campaignDataToSave);

  // If active and not scheduled, start campaign immediately (fully detached — response already sent)
  res.json(campaign);
  if (data.status === "active" && !data.scheduledAt) {
    void startCampaignExecution(campaign.id, {
      ...campaign,
      ...campaignDataToSave,
    }).catch((err) => {
      console.error(`[Campaign ${campaign.id}] Error from detached startCampaignExecution:`, err);
      storage.updateCampaign(campaign.id, { status: "failed" }).catch(() => {});
    });
  }
}),

  // Update campaign status
  updateCampaignStatus: asyncHandler(async (req, res) => {
    const { status } = updateStatusSchema.parse(req.body);

    const existing = await storage.getCampaign(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (status === "paused" && existing.status !== "sending") {
      return res.status(400).json({
        error: `Cannot pause a campaign with status "${existing.status}". Only sending campaigns can be paused.`,
      });
    }

    if (status === "sending" && existing.status !== "paused") {
      return res.status(400).json({
        error: `Cannot resume a campaign with status "${existing.status}". Only paused campaigns can be resumed.`,
      });
    }

    if (status === "sending") {
      const owner = await readinessOwner(req.user);
      if (owner) {
        const ch = existing.channelId ? await storage.getChannel(existing.channelId) : undefined;
        if (!ch || ch.createdBy !== owner) return res.status(404).json({ error: "Campaign not found" });
      }
      const readiness = await checkCampaignRowReadiness(existing.id, { force: true });
      if (!readiness.ready) return notReady(res, readiness);

      // A scheduled campaign paused by the readiness gate never populated its
      // queue — resuming it must run the normal start path, not just flip status.
      const [queued] = await db
        .select({ id: messageQueue.id })
        .from(messageQueue)
        .where(eq(messageQueue.campaignId, existing.id))
        .limit(1);
      if (!queued) {
        const started = await storage.updateCampaign(existing.id, { status: "active", updatedAt: new Date() });
        res.json(started);
        void startCampaignExecution(existing.id).catch((err) => {
          console.error(`[Campaign ${existing.id}] Error from detached startCampaignExecution:`, err);
          storage.updateCampaign(existing.id, { status: "failed" }).catch(() => {});
        });
        return;
      }
    }

    // Bump updatedAt explicitly so the paused-too-long sweeper can use it
    // as the "paused since" reference timestamp.
    const campaign = await storage.updateCampaign(req.params.id, {
      status,
      updatedAt: new Date(),
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    res.json(campaign);
  }),

  // Delete campaign
  deleteCampaign: asyncHandler(async (req, res) => {
    const deleted = await storage.deleteCampaign(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    res.json({ success: true });
  }),

  // Start campaign execution
  startCampaign: asyncHandler(async (req, res) => {
    const campaign = await storage.getCampaign(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const owner = await readinessOwner(req.user);
    const readiness = await checkCampaignReadiness({
      channelId: campaign.channelId!,
      templateId: campaign.templateId,
      recipientCount: null,
      ownerId: owner,
      forceHealthRefresh: true,
    });
    if (!readiness.ready) return notReady(res, readiness);

    if (campaign.campaignType !== "api" && campaign.templateId) {
      const ch = await storage.getChannel(campaign.channelId!);
      const tpl = await storage.getTemplate(campaign.templateId);
      if (ch && tpl) {
        const prepared = await prepareCampaignTemplate(ch, tpl, campaign.templateLanguage, campaign.id);
        const blocking = checkCampaignValues(prepared, campaign.variableMapping, tpl).filter((i) => i.level === "error");
        if (blocking.length) return res.status(400).json({ error: blocking.map((i) => i.message).join(" "), issues: blocking });
      }
    }

    await storage.updateCampaign(campaign.id, { status: "active" });
    res.json({ success: true, message: "Campaign queued for sending" });

    void startCampaignExecution(campaign.id).catch((err) => {
      console.error(`[Campaign ${campaign.id}] Error from detached startCampaignExecution:`, err);
      storage.updateCampaign(campaign.id, { status: "failed" }).catch(() => {});
    });
  }),

  // Check the chosen values against the live Meta template; optionally send one test message.
  previewCampaign: asyncHandler(async (req, res) => {
    const body = z.object({
      channelId: z.string(),
      templateId: z.string(),
      templateLanguage: z.string().optional().nullable(),
      variableMapping: variableMappingSchema.optional(),
      contactId: z.string().optional().nullable(),
      testPhone: z.string().trim().max(20).optional().nullable(),
    }).parse(req.body);
    const owner = await readinessOwner(req.user);
    const channel = await storage.getChannel(body.channelId);
    if (!channel || (owner && channel.createdBy !== owner)) return res.status(404).json({ error: "WhatsApp number not found" });
    const template = await storage.getTemplate(body.templateId);
    if (!template || (template.channelId && template.channelId !== channel.id)) return res.status(404).json({ error: "Template not found" });

    const prepared = await prepareCampaignTemplate(channel, template, body.templateLanguage, "preview");
    const campaignLike = { variableMapping: body.variableMapping || {}, templateLanguage: body.templateLanguage };
    let contact: any = null;
    if (body.contactId) {
      const [c] = await storage.getContactsByIds([body.contactId]);
      if (c && c.channelId === channel.id) contact = c;
    }
    const testPhone = String(body.testPhone || "").replace(/\D/g, "");
    contact = contact || { id: "preview", name: "Test User", phone: testPhone || "910000000000" };
    const components = finalComponents(contact, campaignLike, template, prepared);
    const issues = checkCampaignValues(prepared, body.variableMapping, template);
    const result: any = {
      ok: !issues.some((i) => i.level === "error"),
      issues,
      components,
      preview: renderPreview(components, prepared.sendTemplate),
      liveFromMeta: !!prepared.live,
      language: body.templateLanguage || template.language,
    };

    if (testPhone) {
      if (testPhone.length < 8 || testPhone.length > 15) return res.status(400).json({ error: "Enter the test number with country code, e.g. 919876543210" });
      try {
        const sent = await WhatsAppApiService.sendTemplateMessage(channel as any, testPhone, template.name, components, body.templateLanguage || template.language || "en_US", false);
        result.test = { status: "sent", messageId: sent?.messages?.[0]?.id || null, to: testPhone };
      } catch (e: any) {
        result.ok = false;
        result.test = { status: "failed", error: e?.message || "Send failed", code: e?.metaErrorCode || null, to: testPhone };
      }
    }
    res.json(result);
  }),

  // Copy a campaign (same template, values and recipients) as a draft
  duplicateCampaign: asyncHandler(async (req, res) => {
    const src = await ownedCampaign(req, res);
    if (!src) return;
    const copy = await storage.createCampaign(cloneCampaignFields(src, {
      name: String(req.body?.name || `${src.name} (copy)`).slice(0, 200),
      status: "draft",
      createdBy: req.user!.id,
    }) as any);
    res.json(copy);
  }),

  // Run a finished campaign again as a new campaign: everyone, or only the failed numbers
  rerunCampaign: asyncHandler(async (req, res) => {
    const { mode } = z.object({ mode: z.enum(["all", "failed"]).default("all") }).parse(req.body || {});
    const src = await ownedCampaign(req, res);
    if (!src) return;
    if (src.campaignType === "api") return res.status(400).json({ error: "API campaigns can't be re-run. Duplicate it instead." });
    if (["active", "queued", "sending"].includes(String(src.status))) return res.status(409).json({ error: "This campaign is still sending. Pause it or wait until it finishes." });

    let contactIds: string[] = (src.contactGroups as string[]) || [];
    if (mode === "failed") {
      const failed = await db.select({ phone: messageQueue.recipientPhone }).from(messageQueue)
        .where(and(eq(messageQueue.campaignId, src.id), eq(messageQueue.status, "failed")));
      const phones = new Set(failed.map((f) => String(f.phone).replace(/\D/g, "")));
      const all = await storage.getContactsByIds(contactIds);
      contactIds = all.filter((c) => phones.has(String(c.phone).replace(/\D/g, ""))).map((c) => c.id);
      if (!contactIds.length) return res.status(400).json({ error: "No failed numbers to send again." });
    }

    const channel = await storage.getChannel(src.channelId!);
    const template = src.templateId ? await storage.getTemplate(src.templateId) : undefined;
    if (!channel || !template) return res.status(400).json({ error: "The template or WhatsApp number of this campaign no longer exists." });
    const readiness = await checkCampaignReadiness({ channelId: channel.id, templateId: template.id, recipientCount: null, ownerId: await readinessOwner(req.user) });
    if (!readiness.ready) return notReady(res, readiness);
    const prepared = await prepareCampaignTemplate(channel, template, src.templateLanguage, "rerun");
    const blocking = checkCampaignValues(prepared, src.variableMapping, template).filter((i) => i.level === "error");
    if (blocking.length) return res.status(400).json({ error: blocking.map((i) => i.message).join(" "), issues: blocking });

    const created = await storage.createCampaign(cloneCampaignFields(src, {
      name: `${src.name} (${mode === "failed" ? "failed re-run" : "re-run"})`.slice(0, 200),
      status: "active",
      createdBy: req.user!.id,
      contactGroups: contactIds,
      recipientCount: contactIds.length,
    }) as any);
    res.json(created);
    void startCampaignExecution(created.id).catch((err) => {
      console.error(`[Campaign ${created.id}] re-run start failed:`, err);
      storage.updateCampaign(created.id, { status: "failed" }).catch(() => {});
    });
  }),

  // Get campaign analytics
  getCampaignAnalytics: asyncHandler(async (req, res) => {
    const campaign = await storage.getCampaign(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (!campaign.deliveredCount) {
      return res
        .status(400)
        .json({ error: "No messages delivered yet for this campaign" });
    }
    if (!campaign.sentCount) {
      return res
        .status(400)
        .json({ error: "No messages sent yet for this campaign" });
    }
    if (!campaign.recipientCount) {
      return res
        .status(400)
        .json({ error: "No recipients found for this campaign" });
    }
    if (!campaign.readCount) {
      return res
        .status(400)
        .json({ error: "No messages read yet for this campaign" });
    }

    // Return campaign metrics
    res.json({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      metrics: {
        recipientCount: campaign.recipientCount,
        sentCount: campaign.sentCount,
        deliveredCount: campaign.deliveredCount,
        readCount: campaign.readCount,
        repliedCount: campaign.repliedCount,
        failedCount: campaign.failedCount,
        deliveryRate: campaign.sentCount
          ? ((campaign.deliveredCount / campaign.recipientCount) * 100).toFixed(
              2
            )
          : 0,
        readRate: campaign.deliveredCount
          ? ((campaign.readCount / campaign.deliveredCount) * 100).toFixed(2)
          : 0,
      },
      createdAt: campaign.createdAt,
      completedAt: campaign.completedAt,
    });
  }),

  // API campaign endpoint
  sendApiCampaign: asyncHandler(async (req, res) => {
    const { apiKey } = req.params;

    // Find campaign by API key
    const campaigns = await storage.getCampaigns();
    const campaign = campaigns.find((c) => c.apiKey === apiKey);

    if (!campaign || campaign.campaignType !== "api") {
      return res.status(401).json({ error: "Invalid API key" });
    }

    if (campaign.status !== "active") {
      return res.status(400).json({ error: "Campaign is not active" });
    }

    // Get channel
    if (!campaign.channelId) {
      return res
        .status(400)
        .json({ error: "Channel ID is missing in campaign" });
    }
    const channel = await storage.getChannel(campaign.channelId);
    if (!channel) {
      return res.status(400).json({ error: "Channel not found" });
    }

    // Parse request body
    const { phone, variables = {} } = req.body;
    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Get template

    if (!campaign.templateId) {
      return res
        .status(400)
        .json({ error: "Template ID is missing in campaign" });
    }
    const template = await storage.getTemplate(campaign.templateId);
    if (!template) {
      return res.status(400).json({ error: "Template not found" });
    }

    // Build WhatsApp API components from variableMapping + variables
    const apiComponents: any[] = [];
    const mapping = campaign.variableMapping as any;

    const apiCarouselCards = Array.isArray(template.carouselCards) && template.carouselCards.length > 0
      ? template.carouselCards as any[]
      : null;

    let apiHasLto = false;
    if (template.whatsappTemplateId) {
      try {
        const ltoResp = await fetch(
          `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${template.whatsappTemplateId}`,
          { headers: { Authorization: `Bearer ${channel.accessToken}` } }
        );
        const ltoMeta = await ltoResp.json();
        apiHasLto = (ltoMeta.components || []).some(
          (c: any) => c.type === "LIMITED_TIME_OFFER"
        );
      } catch (err) {
        console.warn("⚠️ Failed to check LTO status for API campaign:", err);
      }
    }
    if (apiHasLto) {
      apiComponents.push({
        type: "limited_time_offer",
        parameters: [
          {
            type: "limited_time_offer",
            limited_time_offer: {
              expiration_time_ms: Date.now() + 24 * 60 * 60 * 1000,
            },
          },
        ],
      });
    }

    // BODY variables
    const bodyText = template.body || "";
    const apiBodyKeys = templateVarKeys(bodyText);
    if (apiBodyKeys.keys.length > 0) {
      const bodyComp: any = { type: "body", parameters: [] };
      for (const idx of apiBodyKeys.keys) {
        const mapObj = mapping?.[idx];
        let value = "";
        if (mapObj?.type === "custom") {
          value = mapObj.value || variables?.[mapObj.value] || "";
        } else if (mapObj?.type && variables) {
          value = variables[mapObj.type] || "";
        } else if (variables) {
          value = variables[idx] || "";
        }
        bodyComp.parameters.push(textParam(idx, value, apiBodyKeys.named));
      }
      apiComponents.push(bodyComp);
    }

    // HEADER media — skip for carousel templates (cards have their own headers)
    if (template.mediaUrl && !apiCarouselCards) {
      const mediaType = (template.mediaType || "image").toLowerCase();
      if (mediaType === "image") {
        apiComponents.push({ type: "header", parameters: [{ type: "image", image: { id: template.mediaUrl } }] });
      } else if (mediaType === "video") {
        apiComponents.push({ type: "header", parameters: [{ type: "video", video: { id: template.mediaUrl } }] });
      } else if (mediaType === "document") {
        apiComponents.push({ type: "header", parameters: [{ type: "document", document: { id: template.mediaUrl } }] });
      }
    }

    // BUTTONS
    if (Array.isArray(template.buttons)) {
      template.buttons.forEach((button: any, index: number) => {
        if (button.type === "URL" && button.url?.includes("{{")) {
          const btnMap = mapping?.buttons?.[index.toString()];
          apiComponents.push({
            type: "button", sub_type: "url", index: index.toString(),
            parameters: [{ type: "text", text: btnMap?.value || variables?.[`button_${index}`] || "" }],
          });
        } else if (button.type === "COPY_CODE") {
          const btnMap = mapping?.buttons?.[index.toString()];
          apiComponents.push({
            type: "button", sub_type: "copy_code", index: index.toString(),
            parameters: [{ type: "coupon_code", coupon_code: btnMap?.value || button.example?.[0] || "" }],
          });
        }
      });
    }

    if (apiCarouselCards) {
      const carouselComp: any = { type: "carousel", cards: [] };
      for (let cardIdx = 0; cardIdx < apiCarouselCards.length; cardIdx++) {
        const card = apiCarouselCards[cardIdx];
        const cardComponents: any[] = [];

        const cardMediaType = (card.mediaType || "image").toLowerCase();
        if (card.mediaUrl) {
          const isUrl = card.mediaUrl.startsWith("http");
          const mediaRef = isUrl ? { link: card.mediaUrl } : { id: card.mediaUrl };
          cardComponents.push({
            type: "header",
            parameters: [
              cardMediaType === "video"
                ? { type: "video", video: mediaRef }
                : { type: "image", image: mediaRef },
            ],
          });
        }

        const cardBody = card.body || "";
        const cardBodyVars = templateVarKeys(cardBody).keys.map((k) => `{{${k}}}`);
        if (cardBodyVars.length > 0) {
          const cardBodyComp: any = { type: "body", parameters: [] };
          for (const varText of cardBodyVars) {
            const varIdx = varText.replace(/\D/g, "");
            const varValue = variables?.[`card_${cardIdx}_body_${varIdx}`] || "";
            cardBodyComp.parameters.push({ type: "text", text: varValue });
          }
          cardComponents.push(cardBodyComp);
        }

        if (Array.isArray(card.buttons)) {
          card.buttons.forEach((btn: any, btnIdx: number) => {
            if (btn.type === "QUICK_REPLY") {
              cardComponents.push({
                type: "button",
                sub_type: "quick_reply",
                index: btnIdx.toString(),
                parameters: [{ type: "payload", payload: variables?.[`card_${cardIdx}_button_${btnIdx}`] || btn.text || "" }],
              });
            } else if (btn.type === "URL" && btn.url?.includes("{{")) {
              cardComponents.push({
                type: "button",
                sub_type: "url",
                index: btnIdx.toString(),
                parameters: [{ type: "text", text: variables?.[`card_${cardIdx}_button_${btnIdx}`] || "" }],
              });
            }
          });
        }

        carouselComp.cards.push({ card_index: cardIdx, components: cardComponents });
      }
      apiComponents.push(carouselComp);
    }

    try {
      const response = await WhatsAppApiService.sendTemplateMessage(
        channel,
        phone,
        template.name,
        apiComponents,
        template.language || "en_US",
        true
      );
      const messageId = response.messages?.[0]?.id || `msg_${randomUUID()}`;
      const sentVia = response._sentVia || "cloud_api";

      let conversation = await storage.getConversationByPhone(phone);
      if (!conversation) {
        let contact = await storage.getContactByPhone(phone);
        if (!contact) {
          contact = await storage.createContact({
            name: phone,
            phone: phone,
            channelId: channel.id,
          });
        }
        conversation = await storage.createConversation({
          contactId: contact.id,
          contactPhone: phone,
          contactName: contact.name || phone,
          channelId: channel.id,
          unreadCount: 0,
        });
      }

      const createdMessage = await storage.createMessage({
        conversationId: conversation.id,
        content: template.body || "",
        status: "sent",
        whatsappMessageId: messageId,
        messageType: "text",
        metadata: { apiEndpoint: sentVia },
      });

      // await storage.createMessage({
      //   conversationId: null, // API messages may not have conversation
      //   to: phone,
      //   from: channel.phoneNumber,
      //   type: "template",
      //   content: JSON.stringify({
      //     templateId: template.id,
      //     templateName: template.name,
      //     parameters: templateParams,
      //   }),
      //   status: "sent",
      //   direction: "outbound",
      //   whatsappMessageId: messageId,
      //   timestamp: new Date(),
      //   campaignId: campaign.id,
      // });

      // Update campaign stats
      await storage.updateCampaign(campaign.id, {
        sentCount: (campaign.sentCount || 0) + 1,
      });

      res.json({
        success: true,
        messageId,
        message: "Message sent successfully",
      });
    } catch (error: any) {
      // Update failed count
      await storage.updateCampaign(campaign.id, {
        failedCount: (campaign.failedCount || 0) + 1,
      });

      res.status(500).json({
        error: "Failed to send message",
        details: error.message,
      });
    }
  }),
};


function buildContactComponents(contact: Contact, campaign: any, template: any, hasLimitedTimeOffer: boolean): any[] {
  const components: any[] = [];

  const carouselCards = Array.isArray(template.carouselCards) && template.carouselCards.length > 0
    ? template.carouselCards as any[]
    : null;

  const headerMediaId = campaign.variableMapping?.uploadedMediaId || template.mediaUrl;
  if (headerMediaId && !carouselCards) {
    const mediaType = (campaign.variableMapping?.headerType || template.mediaType || "image").toLowerCase();
    if (mediaType === "image") {
      components.push({ type: "header", parameters: [{ type: "image", image: { id: headerMediaId } }] });
    } else if (mediaType === "video") {
      components.push({ type: "header", parameters: [{ type: "video", video: { id: headerMediaId } }] });
    } else if (mediaType === "document") {
      components.push({ type: "header", parameters: [{ type: "document", document: { id: headerMediaId } }] });
    }
  }

  const headerText = template.header || "";
  const headerKeys = templateVarKeys(headerText);
  const headerIsText = template.headerFormat ? template.headerFormat === "TEXT" : !template.mediaUrl;
  if (headerKeys.keys.length > 0 && headerIsText && !carouselCards) {
    const headerComponent: any = { type: "header", parameters: [] };
    for (const [pos, index] of headerKeys.keys.entries()) {
      const mapObj = campaign.variableMapping?.headerVars?.[index] ?? campaign.variableMapping?.headerVars?.[String(pos + 1)];
      let textValue = "";
      if (mapObj) {
        if (mapObj.type === "custom") textValue = mapObj.value || "";
        else if (mapObj.type === "firstName") textValue = contact.firstName || contact.name || "";
        else if (mapObj.type === "lastName") textValue = contact.lastName || "";
        else if (mapObj.type === "fullName") {
          const first = contact.firstName || contact.name || "";
          const last = contact.lastName || "";
          textValue = `${first} ${last}`.trim();
        }
        else if (mapObj.type === "phone") textValue = contact.phone || "";
      }
      
      headerComponent.parameters.push(textParam(index, textValue, headerKeys.named || template.parameterFormat === "NAMED"));
    }
    components.push(headerComponent);
  }

  if (hasLimitedTimeOffer) {
    const expirationMs = Date.now() + 24 * 60 * 60 * 1000;
    components.push({
      type: "limited_time_offer",
      parameters: [{ type: "limited_time_offer", limited_time_offer: { expiration_time_ms: expirationMs } }],
    });
  }

  const bodyText = template.body || "";
  // distinct keys: a template using {{1}} twice expects ONE parameter (Meta #132000 otherwise)
  const bodyKeys = templateVarKeys(bodyText);
  if (bodyKeys.keys.length > 0) {
    const bodyComponent: any = { type: "body", parameters: [] };
    for (const [pos, index] of bodyKeys.keys.entries()) {
      const mapObj = campaign.variableMapping?.[index] ?? campaign.variableMapping?.[String(pos + 1)];
      let textValue = "";
      if (mapObj) {
        if (mapObj.type === "custom") textValue = mapObj.value || "";
        else if (mapObj.type === "firstName") textValue = contact.firstName || contact.name || "";
        else if (mapObj.type === "lastName") textValue = contact.lastName || "";
        else if (mapObj.type === "fullName") {
          const first = contact.firstName || contact.name || "";
          const last = contact.lastName || "";
          textValue = `${first} ${last}`.trim();
        }
        else if (mapObj.type === "phone") textValue = contact.phone || "";
      }
      
      // WhatsApp requires non-empty parameters ("-" fallback inside textParam)
      bodyComponent.parameters.push(textParam(index, textValue, bodyKeys.named || template.parameterFormat === "NAMED"));
    }
    components.push(bodyComponent);
  }

  if (Array.isArray(template.buttons)) {
    template.buttons.forEach((button: any, index: number) => {
      const bType = String(button.type || "").toUpperCase();
      if (bType === "URL" && String(button.url || "").includes("{{")) {
        const mapObj = campaign.variableMapping?.buttons?.[index.toString()];
        let textValue = "";
        if (mapObj) {
          if (mapObj.type === "custom") textValue = mapObj.value || "";
          else if (mapObj.type === "firstName") textValue = contact.firstName || "";
          else if (mapObj.type === "lastName") textValue = contact.lastName || "";
          else if (mapObj.type === "fullName") textValue = `${contact.firstName || ""} ${contact.lastName || ""}`.trim();
          else if (mapObj.type === "phone") textValue = contact.phone || "";
        }
        
        if (!textValue || textValue.trim() === "") {
          textValue = "-";
        }
        components.push({ type: "button", sub_type: "url", index: index.toString(), parameters: [{ type: "text", text: textValue }] });
      } else if (bType === "COPY_CODE") {
        const mapObj = campaign.variableMapping?.buttons?.[index.toString()];
        const couponCode = mapObj?.value || (Array.isArray(button.example) ? button.example[0] : button.example) || button.couponCode || "-";
        components.push({ type: "button", sub_type: "copy_code", index: index.toString(), parameters: [{ type: "coupon_code", coupon_code: couponCode }] });
      }
    });
  }

  // Authentication (OTP) templates also need the code on the OTP button.
  if (isAuthTemplate(template)) {
    const fixed = ensureOtpButton(components, template);
    // copy first: the helpers may return the same array (clearing it would drop every parameter → #132000)
    components.splice(0, components.length, ...fixed);
  }
  {
    const withFlow = ensureFlowButton(components, template);
    // copy first: the helpers may return the same array (clearing it would drop every parameter → #132000)
    components.splice(0, components.length, ...withFlow);
  }

  if (carouselCards) {
    const carouselComponent: any = { type: "carousel", cards: [] };
    for (let cardIdx = 0; cardIdx < carouselCards.length; cardIdx++) {
      const card = carouselCards[cardIdx];
      const cardComponents: any[] = [];
      const cardMediaType = (card.mediaType || "image").toLowerCase();

      // Prefer campaign-uploaded media ID over template sample media URL
      const campaignMediaId =
        campaign.variableMapping?.carouselCardMediaIds?.[cardIdx.toString()] ||
        campaign.variableMapping?.carouselCardMediaIds?.[cardIdx];
      const resolvedMediaUrl = campaignMediaId || card.mediaUrl;

      if (resolvedMediaUrl) {
        const isUrl = !campaignMediaId && resolvedMediaUrl.startsWith("http");
        const mediaRef = isUrl ? { link: resolvedMediaUrl } : { id: resolvedMediaUrl };
        cardComponents.push({
          type: "header",
          parameters: [cardMediaType === "video" ? { type: "video", video: mediaRef } : { type: "image", image: mediaRef }],
        });
      }
      const cardBody = card.body || "";
      const cardBodyVars = templateVarKeys(cardBody).keys;
      if (cardBodyVars.length > 0) {
        const cardBodyComp: any = { type: "body", parameters: [] };
        for (const varIdx of cardBodyVars) {
          const mapObj = campaign.variableMapping?.carouselCards?.[cardIdx]?.bodyVars?.[varIdx];
          let textValue = "";
          if (mapObj) {
            if (mapObj.type === "custom") textValue = mapObj.value || "";
            else if (mapObj.type === "firstName") textValue = contact.firstName || contact.name || "";
            else if (mapObj.type === "lastName") textValue = contact.lastName || "";
            else if (mapObj.type === "fullName") {
              const first = contact.firstName || contact.name || "";
              const last = contact.lastName || "";
              textValue = `${first} ${last}`.trim();
            }
            else if (mapObj.type === "phone") textValue = contact.phone || "";
          }

          if (!textValue || textValue.trim() === "") {
            textValue = "-";
          }
          cardBodyComp.parameters.push({ type: "text", text: textValue });
        }
        cardComponents.push(cardBodyComp);
      }
      if (Array.isArray(card.buttons)) {
        card.buttons.forEach((btn: any, btnIdx: number) => {
          if (btn.type === "QUICK_REPLY") {
            const mapObj = campaign.variableMapping?.carouselCards?.[cardIdx]?.buttons?.[btnIdx];
            cardComponents.push({ type: "button", sub_type: "quick_reply", index: btnIdx.toString(), parameters: [{ type: "payload", payload: mapObj?.value || btn.text || "" }] });
          } else if (btn.type === "URL" && btn.url?.includes("{{")) {
            const mapObj = campaign.variableMapping?.carouselCards?.[cardIdx]?.buttons?.[btnIdx];
            cardComponents.push({ type: "button", sub_type: "url", index: btnIdx.toString(), parameters: [{ type: "text", text: mapObj?.value || "" }] });
          }
        });
      }
      if (cardComponents.length === 0) {
        throw new Error(
          `Carousel card ${cardIdx + 1} has no media: no campaign-uploaded media ID and no stored ` +
          `mediaUrl on the template card. Re-sync your templates or re-create the carousel template ` +
          `so the sample media handle is saved.`
        );
      }
      carouselComponent.cards.push({ card_index: cardIdx, components: cardComponents });
    }
    components.push(carouselComponent);
  }

  return components;
}

// ───────────── shared send preparation (queue population, preview, test send) ─────────────

export interface PreparedTemplate { sendTemplate: any; live: any | null; hasLimitedTimeOffer: boolean }

export async function prepareCampaignTemplate(channel: any, template: any, language?: string | null, tag = "preview"): Promise<PreparedTemplate> {
  let live: any = null;
  let sendTemplate: any = template;
  try {
    live = await fetchLiveTemplate({
      apiVersion: WHATSAPP_API_VERSION, token: channel.accessToken!, templateId: template.whatsappTemplateId,
      wabaId: channel.whatsappBusinessAccountId, name: template.name, language: language || template.language,
    });
    if (live) {
      sendTemplate = mergeLiveTemplate(template, live);
      const localBody = templateVarKeys(template.body).keys.join(",");
      const liveBody = templateVarKeys(sendTemplate.body).keys.join(",");
      if (localBody !== liveBody) console.warn(`[Campaign ${tag}] Stored template "${template.name}" differs from Meta (vars ${localBody || "none"} vs ${liveBody || "none"}) — using Meta's version`);
    } else {
      console.warn(`[Campaign ${tag}] Couldn't load "${template.name}" from Meta — using the stored copy`);
    }
  } catch (err) {
    console.warn(`[Campaign ${tag}] Failed to load template from Meta:`, (err as Error).message);
  }
  const hasLimitedTimeOffer = !!live && (live.components || []).some((c: any) => c.type === "LIMITED_TIME_OFFER");
  return { sendTemplate, live, hasLimitedTimeOffer };
}

/** Components for one contact, matched to Meta's live definition. */
export function finalComponents(contact: any, campaign: any, template: any, prepared: PreparedTemplate): any[] {
  let components = buildContactComponents(contact, campaign, prepared.sendTemplate, prepared.hasLimitedTimeOffer);
  if (prepared.live) {
    components = reconcileComponents(prepared.live, components, {
      mediaId: campaign.variableMapping?.uploadedMediaId || template.mediaUrl,
      expirationMs: campaign.variableMapping?.expirationTimeMs,
    });
  }
  return components;
}

export interface CampaignIssue { level: "error" | "warning"; message: string }

/** Checks the values chosen for a template before anything is sent. */
export function checkCampaignValues(prepared: PreparedTemplate, mapping: any, template: any): CampaignIssue[] {
  const issues: CampaignIssue[] = [];
  const live = prepared.live;
  const m = mapping || {};
  const emptyVal = (v: any) => !v || (v.type === "custom" && !String(v.value || "").trim()) || (!v.type && !String(v.value || "").trim());
  if (!live) {
    issues.push({ level: "warning", message: "Couldn't load this template from Meta, so it was checked against the saved copy. Sync templates if it was edited on Meta." });
  } else if (live.status && String(live.status).toUpperCase() !== "APPROVED") {
    issues.push({ level: "error", message: `Template is ${String(live.status).toLowerCase()} on Meta, not approved.` });
  }
  const t = prepared.sendTemplate;
  const comps: any[] = live?.components || [];
  const header = comps.find((c) => c.type === "HEADER");
  const fmt = String(header?.format || t.headerFormat || "").toUpperCase();
  if (["IMAGE", "VIDEO", "DOCUMENT"].includes(fmt)) {
    const id = m.uploadedMediaId || "";
    const usable = id && !/[\/.]/.test(id);
    if (!usable) {
      const sample = header?.example?.header_handle?.[0];
      if (sample) issues.push({ level: "warning", message: `No header ${fmt.toLowerCase()} uploaded — the template's sample ${fmt.toLowerCase()} will be sent.` });
      else issues.push({ level: "error", message: `Upload a header ${fmt.toLowerCase()} for this template.` });
    }
  }
  const hKeys = templateVarKeys(fmt === "TEXT" || !fmt ? (header?.text ?? t.header) : "").keys;
  hKeys.forEach((k, i) => {
    if (emptyVal(m.headerVars?.[k] ?? m.headerVars?.[String(i + 1)])) issues.push({ level: "warning", message: `Header {{${k}}} has no value — "-" will be sent.` });
  });
  templateVarKeys(t.body).keys.forEach((k, i) => {
    if (emptyVal(m[k] ?? m[String(i + 1)])) issues.push({ level: "error", message: `Body variable {{${k}}} has no value.` });
  });
  const btns: any[] = comps.find((c) => c.type === "BUTTONS")?.buttons || (Array.isArray(t.buttons) ? t.buttons : []);
  btns.forEach((b, idx) => {
    const type = String(b.type || "").toUpperCase();
    const val = m.buttons?.[String(idx)];
    if (type === "URL" && /\{\{/.test(String(b.url || "")) && emptyVal(val)) {
      issues.push({ level: "error", message: `Button "${b.text || "URL"}" needs the link value for {{1}}.` });
    }
    if (type === "COPY_CODE" && emptyVal(val)) {
      const ex = Array.isArray(b.example) ? b.example[0] : b.example;
      issues.push({ level: "warning", message: ex ? `No coupon code set — "${ex}" (template example) will be used.` : "Set the coupon code for the copy-code button." });
    }
  });
  const lto = comps.find((c) => c.type === "LIMITED_TIME_OFFER");
  if (lto && lto.limited_time_offer?.has_expiration !== false && !(Number(m.expirationTimeMs) > Date.now())) {
    issues.push({ level: "warning", message: "Offer expiry not set (or in the past) — it will expire 24 hours after sending." });
  }
  return issues;
}

/** Text of the message a contact will receive (for the preview). */
export function renderPreview(components: any[], template: any) {
  const fill = (text: string, params: any[] = []) => {
    const keys = templateVarKeys(text).keys;
    let out = String(text || "");
    keys.forEach((k, i) => {
      const p = params.find((x) => x?.parameter_name === k) || params[i];
      out = out.split(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g")).join(p?.text ?? `{{${k}}}`);
    });
    return out;
  };
  const header = components.find((c) => c.type === "header");
  const body = components.find((c) => c.type === "body");
  const hp = header?.parameters?.[0];
  return {
    headerMedia: hp && hp.type !== "text" ? { type: hp.type, ...(hp[hp.type] || {}) } : null,
    headerText: template.headerFormat === "TEXT" || (!template.headerFormat && template.header) ? fill(template.header || "", header?.parameters) : "",
    body: fill(template.body || "", body?.parameters),
    buttons: components.filter((c) => c.type === "button").map((b) => ({ index: Number(b.index), type: b.sub_type, value: b.parameters?.[0]?.text || b.parameters?.[0]?.coupon_code || "" })),
    hasOffer: components.some((c) => c.type === "limited_time_offer"),
  };
}

export async function startCampaignExecution(
  campaignId: string,
  overrideCampaign?: any
) {
  console.log(`[Campaign ${campaignId}] Received start request — queuing in background`);

  const campaign = overrideCampaign ?? (await storage.getCampaign(campaignId));

  if (!campaign) {
    console.error(`[Campaign ${campaignId}] Campaign not found`);
    return;
  }

  if (campaign.status !== "active") {
    console.warn(`[Campaign ${campaignId}] Skipping — status is "${campaign.status}", expected "active"`);
    return;
  }

  await storage.updateCampaign(campaignId, { status: "queued", populationStartedAt: new Date() });

  setImmediate(() => {
    void _runCampaignQueuePopulation(campaignId, campaign).catch((err) => {
      console.error(`[Campaign ${campaignId}] Fatal error during queue population:`, err);
      storage.updateCampaign(campaignId, { status: "failed", populationStartedAt: null }).catch(() => {});
    });
  });
}

async function _runCampaignQueuePopulation(campaignId: string, campaignData: any) {
  console.log(`[Campaign ${campaignId}] Starting queue population`);

  const campaign = await storage.getCampaign(campaignId);
  if (!campaign) {
    console.error(`[Campaign ${campaignId}] Campaign not found during population`);
    return;
  }

  const channel = await storage.getChannel(campaign.channelId!);
  if (!channel) {
    console.error(`[Campaign ${campaignId}] Channel not found: ${campaign.channelId}`);
    await storage.updateCampaign(campaignId, { status: "failed", populationStartedAt: null });
    return;
  }

  const template = await storage.getTemplate(campaign.templateId!);
  if (!template) {
    console.error(`[Campaign ${campaignId}] Template not found: ${campaign.templateId}`);
    await storage.updateCampaign(campaignId, { status: "failed", populationStartedAt: null });
    return;
  }

  // Use the template exactly as Meta has it (variables, header type, buttons) so every
  // message carries the right number of parameters.
  const prepared = await prepareCampaignTemplate(channel, template, (campaign as any).templateLanguage, campaignId);
  const { sendTemplate, live: liveTemplate } = prepared;

  let contacts: Contact[] = [];
  if ((campaign.campaignType === "contacts" || campaign.campaignType === "csv") && campaign.contactGroups) {
    const contactIds = campaign.contactGroups as string[];
    contacts = await storage.getContactsByIds(contactIds);
    contacts = contacts.filter(c => c.status !== "unsubscribed" && c.status !== "blocked")
  }

  console.log(`[Campaign ${campaignId}] Loaded ${contacts.length} contacts — inserting into queue`);

  if (contacts.length === 0) {
    await storage.updateCampaign(campaignId, { status: "completed", completedAt: new Date(), populationStartedAt: null });
    console.log(`[Campaign ${campaignId}] No contacts to send — marked completed`);
    return;
  }

  const CHUNK_SIZE = 100;
  let totalQueued = 0;
  let totalFailed = 0;
  let lastHeartbeat = Date.now();

  for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
    const chunk = contacts.slice(i, i + CHUNK_SIZE);
    const rows = chunk.map((contact) => {
      try {
        const components = finalComponents(contact, campaign, template, prepared);
        if (i === 0 && contact === chunk[0]) console.log(`[Campaign ${campaignId}] components for "${template.name}" (live=${!!liveTemplate}):`, JSON.stringify(components));
        return {
          campaignId,
          channelId: channel.id,
          recipientPhone: contact.phone,
          templateName: template.name,
          templateLanguage: (campaign as any).templateLanguage || sendTemplate.language || "en_US",
          templateParams: components,
          messageType: "marketing",
          status: "queued" as const,
        };
      } catch (err: any) {
        console.error(`[Campaign ${campaignId}] Failed to build components for ${contact.phone}: ${err.message}`);
        totalFailed++;
        return {
          campaignId,
          channelId: channel.id,
          recipientPhone: contact.phone,
          templateName: template.name,
          templateLanguage: (campaign as any).templateLanguage || sendTemplate.language || "en_US",
          templateParams: [],
          messageType: "marketing",
          status: "failed" as const,
        };
      }
    });

    // await db.insert(messageQueue).values(rows);

 

const inserted = await db
  .insert(messageQueue)
  .values(rows)
  .returning({ id: messageQueue.id });

// Push to Redis from whichever instance handled the request (the worker runs on the
// cron leader). Without Redis the rows stay "queued" and DB polling sends them.
if (ensureBullProducer()) {
  const bullJobs = inserted
    .map((row, idx) => ({ row, r: rows[idx] }))
    .filter(({ r }) => r.status === "queued")
    .map(({ row, r }) => ({
      messageId: row.id,
      channelId: r.channelId!,
      recipientPhone: r.recipientPhone,
      templateName: r.templateName!,
      templateParams: r.templateParams || [],
      templateLanguage: r.templateLanguage,
      messageType: r.messageType || "marketing",
      campaignId: r.campaignId!,
    }));
  if (bullJobs.length) await addBulkMessagesToBullQueue(bullJobs);
}
    totalQueued += rows.filter(r => r.status === "queued").length;

    if (Date.now() - lastHeartbeat > 60_000) {
      await storage.updateCampaign(campaignId, { populationStartedAt: new Date() });
      lastHeartbeat = Date.now();
    }

    console.log(`[Campaign ${campaignId}] Queued ${totalQueued}/${contacts.length}${totalFailed > 0 ? ` (${totalFailed} failed to build)` : ""}`);
  }

  if (totalQueued === 0 && totalFailed > 0) {
    await storage.updateCampaign(campaignId, {
      status: "failed",
      completedAt: new Date(),
      failedCount: totalFailed,
      populationStartedAt: null,
    });
    console.error(`[Campaign ${campaignId}] All ${totalFailed} messages failed to build — campaign marked failed`);
    return;
  }

  await storage.updateCampaign(campaignId, { status: "sending", populationStartedAt: null });
  console.log(`[Campaign ${campaignId}] All ${totalQueued} messages queued — status set to "sending"`);
}


