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

import { sql } from "drizzle-orm";
import { DIPLOY_BRAND } from "@diploy/core";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  unique,
  uniqueIndex,
  numeric,
  pgEnum,
  serial,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import {
  ROLE_VALUES,
  USER_STATUS_VALUES,
  CAMPAIGN_STATUS_VALUES,
  MESSAGE_STATUS_VALUES,
} from "./roles";
export { Role, ROLE_VALUES, UserStatus, CampaignStatus, MessageStatus } from "./roles";

export const users = pgTable(
  "users",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    username: text("username").notNull().unique(),
    password: text("password").notNull(),
    email: text("email").notNull().unique(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    role: text("role").notNull().default("admin"), // superadmin, admin, team, manager, agent
    avatar: text("avatar"),
    status: text("status").notNull().default("active"), // active, inactive, banned
    permissions: text("permissions").array().notNull(),
    channelId: varchar("channel_id").references((): any => channels.id, {
      onDelete: "set null",
    }),
    lastLogin: timestamp("last_login", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    createdBy: varchar("created_by").references((): any => users.id, {
      onDelete: "set null",
    }),
    fcmToken: varchar("fcm_token", { length: 512 }),
    isEmailVerified: boolean("is_email_verified").default(false),
    stripeCustomerId: varchar("stripe_customer_id"),
    razorpayCustomerId: varchar("razorpay_customer_id"),
    paypalCustomerId: varchar("paypal_customer_id"),
    paystackCustomerCode: varchar("paystack_customer_code"),
    mercadopagoCustomerId: varchar("mercadopago_customer_id"),
  },
  (table) => ({
    usersCreatedByIdx: index("users_created_by_idx").on(table.createdBy),
    usersRoleIdx: index("users_role_idx").on(table.role),
  })
);

// Conversation assignments to users
export const conversationAssignments = pgTable("conversation_assignments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  assignedBy: varchar("assigned_by").references(() => users.id, {
    onDelete: "cascade",
  }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow(),
  status: text("status").notNull().default("active"), // active, resolved, transferred
  priority: text("priority").default("normal"), // low, normal, high, urgent
  notes: text("notes"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// User activity logs
export const userActivityLogs = pgTable("user_activity_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // login, logout, message_sent, conversation_assigned, etc.
  entityType: text("entity_type"), // conversation, message, contact, etc.
  entityId: varchar("entity_id"),
  details: jsonb("details").default({}),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const contacts = pgTable(
  "contacts",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    channelId: varchar("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    tenantId: varchar("tenant_id"),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    groups: jsonb("groups").$type<string[]>().default([]),
    tags: jsonb("tags").default([]),
    status: text("status").default("active"), // active, blocked, unsubscribed
    source: varchar("source", { length: 100 }), // manual, import, api, chatbot
    lastContact: timestamp("last_contact", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    createdBy: varchar("created_by").references((): any => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    contactChannelIdx: index("contacts_channel_idx").on(table.channelId),
    contactPhoneIdx: index("contacts_phone_idx").on(table.phone),
    contactStatusIdx: index("contacts_status_idx").on(table.status),
    contactTenantIdx: index("contacts_tenant_idx").on(table.tenantId),
    contactChannelPhoneUnique: unique("contacts_channel_phone_unique").on(
      table.channelId,
      table.phone
    ),
  })
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    channelId: varchar("channel_id").references(() => channels.id, {
      onDelete: "cascade",
    }),
    createdBy: varchar("created_by")
      .notNull()
      .references((): any => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    campaignType: text("campaign_type").notNull(), // contacts, csv, api
    type: text("type").notNull(), // marketing, transactional
    apiType: text("api_type").notNull(), // cloud_api, mm_lite
    templateId: varchar("template_id").references(() => templates.id),
    templateName: text("template_name"),
    templateLanguage: text("template_language"),
    variableMapping: jsonb("variable_mapping")
      .$type<Record<string, any>>()
      .default({}), // Maps template variables to contact/csv fields
    contactGroups: jsonb("contact_groups").$type<string[]>().default([]), // For contacts campaign
    csvData: jsonb("csv_data").default([]), // For CSV campaign
    apiKey: varchar("api_key"), // For API campaign
    apiEndpoint: text("api_endpoint"), // For API campaign
    status: text("status").default("draft"), // draft, scheduled, active, paused, completed
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    recipientCount: integer("recipient_count").default(0),
    sentCount: integer("sent_count").default(0),
    deliveredCount: integer("delivered_count").default(0),
    readCount: integer("read_count").default(0),
    repliedCount: integer("replied_count").default(0),
    failedCount: integer("failed_count").default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    populationStartedAt: timestamp("population_started_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    campaignChannelIdx: index("campaigns_channel_idx").on(table.channelId),
    campaignStatusIdx: index("campaigns_status_idx").on(table.status),
    campaignCreatedIdx: index("campaigns_created_idx").on(table.createdAt),
  })
);

// Campaign Recipients table for tracking individual recipient status
export const campaignRecipients = pgTable(
  "campaign_recipients",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    campaignId: varchar("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    contactId: varchar("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    phone: text("phone").notNull(),
    name: text("name"),
    status: text("status").default("pending"), // pending, sent, delivered, read, failed
    whatsappMessageId: varchar("whatsapp_message_id"),
    templateParams: jsonb("template_params").default({}),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    errorCode: varchar("error_code"),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    recipientCampaignIdx: index("recipients_campaign_idx").on(table.campaignId),
    recipientStatusIdx: index("recipients_status_idx").on(table.status),
    recipientPhoneIdx: index("recipients_phone_idx").on(table.phone),
    campaignPhoneUnique: unique("campaign_phone_unique").on(
      table.campaignId,
      table.phone
    ),
  })
);

// WhatsApp Business Channels for multi-account support
export const channels = pgTable("channels", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phoneNumberId: text("phone_number_id").notNull(),
  accessToken: text("access_token").notNull(),
  whatsappBusinessAccountId: text("whatsapp_business_account_id"),
  phoneNumber: text("phone_number"),
  appId: text("app_id"),
  isActive: boolean("is_active").default(true),
  isCoexistence: boolean("is_coexistence").default(false),
  // Health status fields
  healthStatus: text("health_status").default("unknown"), // healthy, warning, error, unknown
  lastHealthCheck: timestamp("last_health_check", { withTimezone: true }),
  healthDetails: jsonb("health_details").default({}), // Detailed health information
  connectionMethod: varchar("connection_method", { length: 20 }).default("embedded"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  createdBy: varchar("created_by").default(""),
});

export const templates = pgTable("templates", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  channelId: varchar("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  createdBy: varchar("created_by").references((): any => users.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  category: text("category").notNull(), // marketing, transactional, authentication, utility
  language: text("language").default("en_US"),
  header: text("header"),
  body: text("body").notNull(),
  footer: text("footer"),
  buttons: jsonb("buttons").default([]),
  variables: jsonb("variables").default([]),
  status: text("status").default("draft"), // draft, pending, approved, rejected
  rejectionReason: text("rejection_reason"), // Reason for template rejection from WhatsApp
  mediaType: text("media_type").default("text"), // text, image, video, document, carousel
  mediaUrl: text("media_url"), // URL of uploaded media
  mediaHandle: text("media_handle"), // WhatsApp media handle after upload
  carouselCards: jsonb("carousel_cards").default([]), // For carousel templates
  whatsappTemplateId: text("whatsapp_template_id"), // ID from WhatsApp after creation
  usage_count: integer("usage_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  headerType: text("header_type"),
  bodyVariables: integer("body_variables"),
}, (table) => ({
  templateChannelWaIdUnique: unique("template_channel_wa_id_unique").on(table.whatsappTemplateId, table.channelId),
  templateChannelIdx: index("templates_channel_idx").on(table.channelId),
}));

export const whatsappBusinessAccountsConfig =
  pgTable("whatsapp_business_accounts_config", {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    // Meta App Credentials
    appId: text("app_id").notNull(),
    appSecret: text("app_secret").notNull(),
    configId: text("config_id").notNull(),

    // Ownership
    createdBy: varchar("created_by")
      .default(""),

    // Status
    isActive: boolean("is_active")
      .default(true),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow(),
  });



export const session = pgTable("session", {
  sid: varchar("sid").notNull().primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

export const conversations = pgTable(
  "conversations",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    channelId: varchar("channel_id").references(() => channels.id, {
      onDelete: "cascade",
    }),
    contactId: varchar("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    assignedTo: varchar("assigned_to").references((): any => users.id, {
      onDelete: "set null",
    }),
    contactPhone: varchar("contact_phone"), // Store phone number for webhook lookups
    contactName: varchar("contact_name"), // Store contact name
    status: text("status").default("open"), // open, closed, assigned, pending
    priority: text("priority").default("normal"), // low, normal, high, urgent
    type: text("type").default("whatsapp"), // whatsapp, chatbot, sms, email
    chatbotId: varchar("chatbot_id"),
    sessionId: text("session_id"),
    tags: jsonb("tags").default([]),
    unreadCount: integer("unread_count").default(0), // Track unread messages
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastIncomingMessageAt: timestamp("last_incoming_message_at", { withTimezone: true }),
    lastMessageText: text("last_message_text"), // Cache last message for display
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    conversationChannelIdx: index("conversations_channel_idx").on(
      table.channelId
    ),
    conversationContactIdx: index("conversations_contact_idx").on(
      table.contactId
    ),
    conversationPhoneIdx: index("conversations_phone_idx").on(
      table.contactPhone
    ),
    conversationStatusIdx: index("conversations_status_idx").on(table.status),
    conversationLastMsgIdx: index("conversations_last_msg_idx").on(table.channelId, table.lastMessageAt),
    conversationAssignedIdx: index("conversations_assigned_idx").on(table.assignedTo),
    conversationLastMsgAtIdx: index("conversations_last_msg_at_idx").on(table.lastMessageAt),
  })
);

export const messages = pgTable(
  "messages",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    conversationId: varchar("conversation_id").references(
      () => conversations.id,
      {
        onDelete: "cascade",
      }
    ),
    whatsappMessageId: varchar("whatsapp_message_id"), // Store WhatsApp message ID
    fromUser: boolean("from_user").default(false),
    direction: varchar("direction").default("outbound"), // inbound, outbound
    content: text("content").notNull(),
    type: text("type").default("text"), // text, image, document, template
    fromType: varchar("from_type").default("user"), // user, bot, system
    messageType: varchar("message_type"), // For WhatsApp message types
    mediaId: varchar("media_id"), // WhatsApp media ID
    mediaUrl: text("media_url"), // Download URL (fetched from Graph API)
    mediaMimeType: varchar("media_mime_type", { length: 100 }),
    mediaSha256: varchar("media_sha256", { length: 128 }),
    status: text("status").default("sent"), // sent, delivered, read, failed, received
    timestamp: timestamp("timestamp", { withTimezone: true }), // WhatsApp timestamp
    metadata: jsonb("metadata").default({}), // Store additional WhatsApp data
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    errorCode: varchar("error_code", { length: 50 }),
    errorMessage: text("error_message"),
    errorDetails: jsonb("error_details"), // Store detailed error information from WhatsApp
    campaignId: varchar("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }), // Link to campaign if sent from campaign
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    messageConversationIdx: index("messages_conversation_idx").on(
      table.conversationId
    ),
    messageWhatsappIdx: index("messages_whatsapp_idx").on(
      table.whatsappMessageId
    ),
    messageDirectionIdx: index("messages_direction_idx").on(table.direction),
    messageStatusIdx: index("messages_status_idx").on(table.status),
    messageTimestampIdx: index("messages_timestamp_idx").on(table.timestamp),
    messageCreatedIdx: index("messages_created_idx").on(table.createdAt),
    messageConvCreatedIdx: index("messages_conv_created_idx").on(table.conversationId, table.createdAt),
    messageConvStatusCreatedIdx: index("messages_conv_status_created_idx").on(
      table.conversationId,
      table.status,
      table.createdAt
    ),
  })
);

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),

    title: text("title").notNull(),
    message: text("message").notNull(),

    type: varchar("type").notNull().default("general"),

    createdBy: varchar("created_by").notNull().default("system"),

    channelId: varchar("channel_id").references(() => channels.id, {
      onDelete: "set null",
    }),

    targetType: varchar("target_type").notNull(),

    targetIds: text("target_ids")
      .array()
      .default(sql`ARRAY[]::text[]`),

    status: varchar("status").notNull().default("draft"),
    sentAt: timestamp("sent_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    notificationsChannelIdx: index("notifications_channel_idx").on(table.channelId),
  })
);

export const sentNotifications = pgTable("sent_notifications", {
  id: serial("id").primaryKey(),

  notificationId: integer("notification_id")
    .references(() => notifications.id, { onDelete: "cascade" })
    .notNull(),

  userId: varchar("user_id"),

  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at", { withTimezone: true }),

  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow(),
});

export const notificationTemplates = pgTable("notification_templates", {
  id: serial("id").primaryKey(),
  eventType: varchar("event_type").notNull().unique(),
  label: varchar("label").notNull(),
  description: text("description"),
  subject: text("subject").notNull(),
  htmlBody: text("html_body").notNull(),
  isEmailEnabled: boolean("is_email_enabled").default(true),
  isInAppEnabled: boolean("is_in_app_enabled").default(true),
  variables: text("variables").array().default(sql`ARRAY[]::text[]`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const userNotificationPreferences = pgTable("user_notification_preferences", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  eventType: varchar("event_type").notNull(),
  inAppEnabled: boolean("in_app_enabled").default(true),
  emailEnabled: boolean("email_enabled").default(true),
  soundEnabled: boolean("sound_enabled").default(true),
});

export const chatbots = pgTable("chatbots", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  uuid: text("uuid").notNull().unique(),
  title: text("title").notNull(),
  bubbleMessage: text("bubble_message"),
  welcomeMessage: text("welcome_message"),
  instructions: text("instructions"),
  connectMessage: text("connect_message"),
  language: text("language").default("en"),
  interactionType: text("interaction_type").default("ai-only"),
  avatarId: integer("avatar_id"),
  avatarEmoji: text("avatar_emoji"),
  avatarColor: text("avatar_color"),
  primaryColor: text("primary_color").default("#3B82F6"),
  logoUrl: text("logo_url"),
  embedWidth: integer("embed_width").default(420),
  embedHeight: integer("embed_height").default(745),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const trainingData = pgTable(
  "training_data",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    chatbotId: varchar("chatbot_id").references(() => chatbots.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(), // 'text', 'pdf', 'website', 'qa'
    title: text("title"),
    content: text("content"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    trainingDataChatbotIdx: index("training_data_chatbot_idx").on(table.chatbotId),
  })
);

// Knowledge Base Categories
export const knowledgeCategories = pgTable(
  "knowledge_categories",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    siteId: varchar("site_id")
      .notNull()
      .references((): any => sites.id, { onDelete: "cascade" }),
    parentId: varchar("parent_id"),
    name: varchar("name", { length: 255 }).notNull(),
    icon: varchar("icon", { length: 50 }),
    description: text("description"),
    order: integer("order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    categorySiteIdx: index("categories_site_idx").on(table.siteId),
    categoryParentIdx: index("categories_parent_idx").on(table.parentId),
  })
);

// Knowledge Base Articles
export const knowledgeArticles = pgTable(
  "knowledge_articles",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    categoryId: varchar("category_id").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    content: text("content").notNull(),
    order: integer("order").default(0),
    published: boolean("published").default(true),
    views: integer("views").default(0),
    helpful: integer("helpful").default(0),
    notHelpful: integer("not_helpful").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    articleCategoryIdx: index("articles_category_idx").on(table.categoryId),
    articlePublishedIdx: index("articles_published_idx").on(table.published),
  })
);

//plans
export const plans = pgTable("plans", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  icon: varchar("icon"), // optional: store icon name like 'Zap', 'Crown'
  popular: boolean("popular").default(false),
  badge: varchar("badge"),
  color: varchar("color"),
  buttonColor: varchar("button_color"),

  // Pricing
  monthlyPrice: numeric("monthly_price", { precision: 10, scale: 2 }).default(
    "0"
  ),
  annualPrice: numeric("annual_price", { precision: 10, scale: 2 }).default(
    "0"
  ),
  multiCurrencyPrices: jsonb("multi_currency_prices").$type<Record<string, { monthly: string; annual: string }>>(),

  // Permissions (JSON for flexibility)
  permissions: jsonb("permissions").$type<{
    channel: string;
    contacts: string;
    automation: string;
    campaign?: string;
    apiRequestsPerMonth?: string;
    apiRateLimitPerMinute?: string;
    teamMembers?: string; // dashboard logins for the client's team ("unlimited", "0" = none)
    instagramAccounts?: string; // connected IG accounts ("unlimited", "0" = none)
    facebookPages?: string; // connected FB Pages
    contentPlanner?: string; // "yes" | "no"
    instagramAutomation?: string; // "yes" | "no"
    adsManager?: string; // "yes" | "no"
  }>(),

  // Features (Array of objects)
  features: jsonb("features").$type<{ name: string; included: boolean }[]>(),

  stripeProductId: varchar("stripe_product_id"),
  stripePriceIdMonthly: varchar("stripe_price_id_monthly"),
  stripePriceIdAnnual: varchar("stripe_price_id_annual"),
  razorpayPlanIdMonthly: varchar("razorpay_plan_id_monthly"),
  razorpayPlanIdAnnual: varchar("razorpay_plan_id_annual"),
  paypalProductId: varchar("paypal_product_id"),
  paypalPlanIdMonthly: varchar("paypal_plan_id_monthly"),
  paypalPlanIdAnnual: varchar("paypal_plan_id_annual"),
  paystackPlanCodeMonthly: varchar("paystack_plan_code_monthly"),
  paystackPlanCodeAnnual: varchar("paystack_plan_code_annual"),
  mercadopagoPlanIdMonthly: varchar("mercadopago_plan_id_monthly"),
  mercadopagoPlanIdAnnual: varchar("mercadopago_plan_id_annual"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Payment Providers table
export const paymentProviders = pgTable("payment_providers", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // e.g., "Razorpay", "Stripe", "PayPal"
  providerKey: varchar("provider_key").notNull().unique(), // e.g., "razorpay", "stripe"
  description: text("description"),
  logo: varchar("logo"), // URL or icon name
  isActive: boolean("is_active").default(true),
  // Provider Configuration (API Keys, etc.)
  config: jsonb("config").$type<{
    apiKey?: string;
    apiSecret?: string;
    apiKeyTest?: string;
    apiSecretTest?: string;
    isLive?: boolean;
    webhookSecret?: string;
    webhookSecretTest?: string;
    webhookId?: string;
    webhookIdTest?: string;
    publicKey?: string;
    merchantId?: string;
    [key: string]: any;
  }>(),
  // Supported features
  supportedCurrencies: jsonb("supported_currencies").$type<string[]>(),
  supportedMethods: jsonb("supported_methods").$type<string[]>(), // ["card", "upi", "wallet"]
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// User Subscriptions table
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  planId: varchar("plan_id")
    .notNull()
    .references(() => plans.id),
    planData: jsonb("plan_data").notNull(), 
  status: varchar("status").notNull(), // "active", "expired", "cancelled", "pending"
  billingCycle: varchar("billing_cycle").notNull(), // "monthly" or "annual"
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  autoRenew: boolean("auto_renew").default(true),
  gatewaySubscriptionId: varchar("gateway_subscription_id"),
  gatewayProvider: varchar("gateway_provider"), // "stripe" or "razorpay"
  gatewayStatus: varchar("gateway_status"), // raw status from gateway
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Transactions table
export const transactions = pgTable("transactions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  planId: varchar("plan_id")
    .notNull()
    .references(() => plans.id),
  subscriptionId: varchar("subscription_id").references(() => subscriptions.id),
  paymentProviderId: varchar("payment_provider_id")
    .notNull()
    .references(() => paymentProviders.id),

  // Transaction details
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").default("USD"),
  billingCycle: varchar("billing_cycle").notNull(), // "monthly" or "annual"

  // Payment provider details
  providerTransactionId: varchar("provider_transaction_id"), // Transaction ID from payment provider
  providerOrderId: varchar("provider_order_id"), // Order ID from payment provider
  providerPaymentId: varchar("provider_payment_id"), // Payment ID from payment provider
  providerSubscriptionId: varchar("provider_subscription_id"), // Subscription ID from provider (e.g. sub_...)
  providerPaymentIntentId: varchar("provider_payment_intent_id"), // Payment Intent ID (e.g. pi_...)
  providerSetupIntentId: varchar("provider_setup_intent_id"), // Setup Intent ID (e.g. seti_...)
  providerInvoiceId: varchar("provider_invoice_id"), // Invoice ID (e.g. in_...)
  providerCustomerId: varchar("provider_customer_id"), // Customer ID (e.g. cus_...)

  // Transaction status
  status: varchar("status").notNull(), // "pending", "completed", "failed", "refunded", "cancelled"
  paymentMethod: varchar("payment_method"), // "card", "upi", "wallet", "netbanking"

  // Additional details
  metadata: jsonb("metadata").$type<{
    cardLast4?: string;
    cardBrand?: string;
    upiId?: string;
    failureReason?: string;
    refundReason?: string;
    [key: string]: any;
  }>(),

  // Timestamps
  paidAt: timestamp("paid_at", { withTimezone: true }),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "resolved",
  "closed",
]);
export const ticketPriorityEnum = pgEnum("ticket_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);
export const userTypeEnum = pgEnum("user_type", [
  "user",
  "team",
  "admin",
  "superadmin",
]);

// Support Tickets table
export const supportTickets = pgTable("support_tickets", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: ticketStatusEnum("status").notNull().default("open"),
  priority: ticketPriorityEnum("priority").notNull().default("medium"),

  // Creator info (can be user or listener)
  creatorId: varchar("creator_id").notNull(), // ID from users or listeners table
  creatorType: userTypeEnum("creator_type").notNull(), // 'user' or 'team'
  creatorName: text("creator_name").notNull(), // Cached for display
  creatorEmail: text("creator_email").notNull(), // Cached for display

  // Assignment (admin only)
  assignedToId: varchar("assigned_to_id"), // ID from admin_users table
  assignedToName: text("assigned_to_name"), // Cached for display

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

// Ticket Messages table
export const ticketMessages = pgTable("ticket_messages", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id")
    .notNull()
    .references(() => supportTickets.id, { onDelete: "cascade" }),

  // Sender info (can be user, listener, or admin)
  senderId: varchar("sender_id").notNull(),
  senderType: userTypeEnum("sender_type").notNull(), // 'user', 'listener', or 'admin'
  senderName: text("sender_name").notNull(), // Cached for display

  message: text("message").notNull(),
  isInternal: boolean("is_internal").notNull().default(false), // Admin notes only

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Relations
export const supportTicketsRelations = relations(
  supportTickets,
  ({ many }) => ({
    messages: many(ticketMessages),
  })
);

export const ticketMessagesRelations = relations(ticketMessages, ({ one }) => ({
  ticket: one(supportTickets, {
    fields: [ticketMessages.ticketId],
    references: [supportTickets.id],
  }),
}));

// Automation workflows table
export const automations = pgTable(
  "automations",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    channelId: varchar("channel_id").references(() => channels.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description"),
    trigger: text("trigger").notNull(), // message_received, keyword, schedule, api_webhook
    triggerConfig: jsonb("trigger_config").default({}),
    status: text("status").default("inactive"), // active, inactive, paused
    executionCount: integer("execution_count").default(0),
    lastExecutedAt: timestamp("last_executed_at", { withTimezone: true }),
    createdBy: varchar("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    automationChannelIdx: index("automations_channel_idx").on(table.channelId),
    automationStatusIdx: index("automations_status_idx").on(table.status),
  })
);

// ─── Automation Nodes ─────────────────────────
export const automationNodes = pgTable(
  "automation_nodes",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    automationId: varchar("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    nodeId: varchar("node_id").notNull(),
    type: text("type").notNull(), // trigger, action, condition, delay
    subtype: text("subtype"), // send_template, send_message, wait, etc.
    position: jsonb("position").default({}), // {x, y}
    measured: jsonb("measured").default({}), // {x, y}
    data: jsonb("data").default({}), // node config
    connections: jsonb("connections").default([]), // array of next nodeIds
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    nodeAutomationIdx: index("automation_nodes_automation_idx").on(
      table.automationId
    ),
    nodeUniqueIdx: unique("automation_nodes_unique_idx").on(
      table.automationId,
      table.nodeId
    ),
  })
);

// ─── Automation Edges ─────────────────────────
export const automationEdges = pgTable(
  "automation_edges",
  {
    id: varchar("id").primaryKey(), // This can use the edge ID from your JSON if needed

    automationId: varchar("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),

    sourceNodeId: varchar("source_node_id").notNull(),

    targetNodeId: varchar("target_node_id").notNull(),

    sourceHandle: varchar("source_handle"),

    animated: boolean("animated").default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    automationEdgeIdx: index("automation_edges_automation_idx").on(
      table.automationId
    ),
    edgeUniqueIdx: unique("automation_edges_unique_handle_idx").on(
      table.automationId,
      table.sourceNodeId,
      table.targetNodeId,
      table.sourceHandle
    ),
  })
);

// ─── Automation Executions ────────────────────
export const automationExecutions = pgTable(
  "automation_executions",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    automationId: varchar("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    contactId: varchar("contact_id").references(() => contacts.id),
    conversationId: varchar("conversation_id").references(
      () => conversations.id
    ),
    triggerData: jsonb("trigger_data").default({}),
    triggerMessageId: varchar("trigger_message_id", { length: 200 }),
    status: text("status").notNull(), // running, completed, failed
    currentNodeId: varchar("current_node_id"),
    executionPath: jsonb("execution_path").default([]),
    variables: jsonb("variables").default({}),
    result: text("result"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    executionAutomationIdx: index("automation_executions_automation_idx").on(
      table.automationId
    ),
    executionStatusIdx: index("automation_executions_status_idx").on(
      table.status
    ),
    executionMessageUniqueIdx: uniqueIndex("automation_executions_message_unique_idx").on(
      table.automationId,
      table.conversationId,
      table.triggerMessageId
    ),
  })
);

// ─── Automation Execution Logs ────────────────
export const automationExecutionLogs = pgTable(
  "automation_execution_logs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    executionId: varchar("execution_id")
      .notNull()
      .references(() => automationExecutions.id, { onDelete: "cascade" }),
    nodeId: varchar("node_id").notNull(),
    nodeType: text("node_type").notNull(),
    status: text("status").notNull(), // started, completed, failed
    input: jsonb("input").default({}),
    output: jsonb("output").default({}),
    error: text("error"),
    executedAt: timestamp("executed_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    logExecutionIdx: index("automation_execution_logs_execution_idx").on(
      table.executionId
    ),
  })
);

export const analytics = pgTable("analytics", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  channelId: varchar("channel_id"),
  date: timestamp("date", { withTimezone: true }).notNull(),
  messagesSent: integer("messages_sent").default(0),
  messagesDelivered: integer("messages_delivered").default(0),
  messagesRead: integer("messages_read").default(0),
  messagesReplied: integer("messages_replied").default(0),
  newContacts: integer("new_contacts").default(0),
  activeCampaigns: integer("active_campaigns").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// WhatsApp Channels table
export const whatsappChannels = pgTable("whatsapp_channels", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull().unique(),
  phoneNumberId: varchar("phone_number_id", { length: 50 }).notNull(),
  wabaId: varchar("waba_id", { length: 50 }).notNull(),
  accessToken: text("access_token").notNull(), // Should be encrypted in production
  businessAccountId: varchar("business_account_id", { length: 50 }),
  rateLimitTier: varchar("rate_limit_tier", { length: 20 }).default("standard"),
  qualityRating: varchar("quality_rating", { length: 20 }).default("green"), // green, yellow, red
  status: varchar("status", { length: 20 }).default("inactive"), // active, inactive, error
  errorMessage: text("error_message"),
  lastHealthCheck: timestamp("last_health_check", { withTimezone: true }),
  messageLimit: integer("message_limit"),
  messagesUsed: integer("messages_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const channelSignupLogs = pgTable("channel_signup_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("incomplete"),
  step: varchar("step", { length: 50 }).notNull().default("token_exchange"),
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details"),
  phoneNumber: text("phone_number"),
  wabaId: text("waba_id"),
  channelId: varchar("channel_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Webhook Configuration table
export const webhookConfigs = pgTable("webhook_configs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  channelId: varchar("channel_id"), // No foreign key - global webhook for all channels
  webhookUrl: text("webhook_url").notNull(),
  verifyToken: varchar("verify_token", { length: 100 }).notNull(),
  events: jsonb("events").default([]).notNull(), // ['messages', 'message_status', 'message_template_status_update']
  isActive: boolean("is_active").default(true),
  lastPingAt: timestamp("last_ping_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Message Queue table for campaign management
export const messageQueue = pgTable("message_queue", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id),
  channelId: varchar("channel_id").references(() => channels.id),
  recipientPhone: varchar("recipient_phone", { length: 20 }).notNull(),
  templateName: varchar("template_name", { length: 100 }),
  templateLanguage: varchar("template_language", { length: 20 }).default("en_US"),
  templateParams: jsonb("template_params").default([]),
  messageType: varchar("message_type", { length: 20 }).notNull(), // marketing, utility, authentication
  status: varchar("status", { length: 20 }).default("queued"), // queued, processing, sent, delivered, failed
  attempts: integer("attempts").default(0),
  whatsappMessageId: varchar("whatsapp_message_id", { length: 100 }),
  conversationId: varchar("conversation_id", { length: 100 }),
  sentVia: varchar("sent_via", { length: 20 }), // cloud_api, marketing_messages
  cost: varchar("cost", { length: 20 }), // Store as string to avoid decimal precision issues
  errorCode: varchar("error_code", { length: 50 }),
  errorMessage: text("error_message"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// API Request Logs for debugging
export const apiLogs = pgTable("api_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  channelId: varchar("channel_id").references(() => channels.id),
  requestType: varchar("request_type", { length: 50 }).notNull(), // send_message, get_template, webhook_receive
  endpoint: text("endpoint").notNull(),
  method: varchar("method", { length: 10 }).notNull(),
  requestBody: jsonb("request_body"),
  responseStatus: integer("response_status"),
  responseBody: jsonb("response_body"),
  duration: integer("duration"), // in milliseconds
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Panel configuration table for branding and settings

export const panelConfig = pgTable("panel_config", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  tagline: varchar("tagline"),
  description: text("description"),
  logo: varchar("logo"),
  logo2: varchar("logo2"),
  favicon: varchar("favicon"),
  defaultLanguage: varchar("default_language", { length: 5 }).default("en"),
  supportedLanguages: jsonb("supported_languages").default(sql`'["en"]'`),
  companyName: varchar("company_name"),
  companyWebsite: varchar("company_website"),
  supportEmail: varchar("support_email"),
  currency: varchar("currency", { length: 10 }).default("INR"),
  country: varchar("country", { length: 2 }).default("IN"),
  embeddedSignupEnabled: boolean("embedded_signup_enabled").default(true),
  publicOrigin: text("public_origin"),
  appearanceConfig: jsonb("appearance_config").$type<{
    primaryColor?: string;
    backgroundColor?: string;
    fontFamily?: string;
    buttonColor?: string;
    lightModeColor?: string;
  }>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const groups = pgTable("groups", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  channelId: uuid("channelId"), 
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
});

export const firebaseConfig = pgTable("firebase_config", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  apiKey: text("api_key"),
  authDomain: text("auth_domain"),
  projectId: text("project_id"),
  storageBucket: text("storage_bucket"),
  messagingSenderId: text("messaging_sender_id"),
  appId: text("app_id"),
  measurementId: text("measurement_id"),
  privateKey: text("private_key"),
  clientEmail: text("client_email"),
  vapidKey: text("vapid_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const storageSettings = pgTable("storage_settings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  provider: text("provider").default("digitalocean"), // can extend later
  spaceName: text("space_name").notNull(),
  endpoint: text("endpoint").notNull(),
  region: text("region").notNull(),
  accessKey: text("access_key").notNull(),
  secretKey: text("secret_key").notNull(),
  isActive: boolean("is_active").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const aiSettings = pgTable("ai_settings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  channelId: varchar("channel_id").references(() => channels.id),
  provider: text("provider").notNull().default("openai"),
  apiKey: text("api_key").notNull(),
  model: text("model").notNull().default("gpt-4o-mini"),
  endpoint: text("endpoint").default("https://api.openai.com/v1"),
  temperature: text("temperature").default("0.7"), // string for consistency
  maxTokens: text("max_tokens").default("2048"),
  isActive: boolean("is_active").default(false),

  // NEW COLUMN
  words: text("words")
    .array()
    .default(sql`ARRAY[]::text[]`), // trigger words or phrases

  // Link to a specific chatbot/site (knowledge base)
  siteId: varchar("site_id"),

  // Diagnostics: populated by webhook handler on every skip branch so
  // support can answer "why didn't the AI reply?" without DB access.
  lastSkipReason: text("last_skip_reason"),
  lastSkipAt: timestamp("last_skip_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Sites
export const sites = pgTable("sites", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  channelId: varchar("channel_id"),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  widgetCode: text("widget_code").notNull().unique(),
  widgetEnabled: boolean("widget_enabled").notNull().default(true),
  widgetConfig: jsonb("widget_config")
    .notNull()
    .default(sql`'{}'::jsonb`), // colors, position, greeting, etc.
  aiTrainingConfig: jsonb("ai_training_config")
    .notNull()
    .default(sql`'{"trainFromKB": false, "trainFromDocuments": true}'::jsonb`), // AI training settings
  autoAssignmentConfig: jsonb("auto_assignment_config")
    .notNull()
    .default(sql`'{"enabled": false, "strategy": "round_robin"}'::jsonb`), // Auto-assignment settings
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// SMTP Configuration table
export const smtpConfig = pgTable("smtp_config", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  host: text("host").notNull(),
  port: integer("port").notNull(),
  secure: boolean("secure").default(false),
  user: text("user").notNull(),
  password: text("password"),
  fromName: text("from_name").notNull(),
  fromEmail: text("from_email").notNull(),
  logo: text("logo").default("null"), 
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});


export const otpVerifications = pgTable("otp_verifications", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`), // UUID primary key

  userId: varchar("user_id")
    .notNull(), 

  otpCode: varchar("otp_code", { length: 6 }).notNull(), // 6-digit OTP
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), 
  isUsed: boolean("is_used").default(false), 

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Permissions type definition
export const PERMISSIONS = {
  // Dashboard permissions
  DASHBOARD_VIEW: "dashboard:view",
  DASHBOARD_EXPORT: "dashboard:export",

  // Contacts permissions
  CONTACTS_VIEW: "contacts:view",
  CONTACTS_CREATE: "contacts:create",
  CONTACTS_EDIT: "contacts:edit",
  CONTACTS_DELETE: "contacts:delete",
  CONTACTS_IMPORT: "contacts:import",
  CONTACTS_EXPORT: "contacts:export",

  // Campaigns permissions
  CAMPAIGNS_VIEW: "campaigns:view",
  CAMPAIGNS_CREATE: "campaigns:create",
  CAMPAIGNS_EDIT: "campaigns:edit",
  CAMPAIGNS_DELETE: "campaigns:delete",
  CAMPAIGNS_SEND: "campaigns:send",
  CAMPAIGNS_SCHEDULE: "campaigns:schedule",

  // Templates permissions
  TEMPLATES_VIEW: "templates:view",
  TEMPLATES_CREATE: "templates:create",
  TEMPLATES_EDIT: "templates:edit",
  TEMPLATES_DELETE: "templates:delete",
  TEMPLATES_SYNC: "templates:sync",

  // Inbox permissions
  INBOX_VIEW: "inbox:view",
  INBOX_SEND_MESSAGE: "inbox:send",
  INBOX_ASSIGN: "inbox:assign",
  INBOX_CLOSE: "inbox:close",
  INBOX_DELETE: "inbox:delete",

  // Analytics permissions
  ANALYTICS_VIEW: "analytics:view",
  ANALYTICS_EXPORT: "analytics:export",

  // Settings permissions
  SETTINGS_VIEW: "settings:view",
  SETTINGS_CHANNELS: "settings:channels",
  SETTINGS_WEBHOOK: "settings:webhook",
  SETTINGS_TEAM: "settings:team",
  SETTINGS_API: "settings:api",

  // Team management permissions
  TEAM_VIEW: "team:view",
  TEAM_CREATE: "team:create",
  TEAM_EDIT: "team:edit",
  TEAM_DELETE: "team:delete",
  TEAM_PERMISSIONS: "team:permissions",

  // Logs permissions
  LOGS_VIEW: "logs:view",

  // Automation permissions
  AUTOMATIONS_VIEW: "automations:view",
  AUTOMATIONS_CREATE: "automations:create",
  AUTOMATIONS_EDIT: "automations:edit",
  AUTOMATIONS_DELETE: "automations:delete",

  // Website / landing page builder (platform team only)
  WEBSITE_EDIT: "website:edit",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type PermissionMap = Record<Permission, boolean>;

// Default permissions by role
export const DEFAULT_PERMISSIONS: Record<string, Permission[]> = {
  admin: Object.values(PERMISSIONS), // Admin has all permissions
  manager: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.DASHBOARD_EXPORT,
    PERMISSIONS.CONTACTS_VIEW,
    PERMISSIONS.CONTACTS_CREATE,
    PERMISSIONS.CONTACTS_EDIT,
    PERMISSIONS.CONTACTS_IMPORT,
    PERMISSIONS.CONTACTS_EXPORT,
    PERMISSIONS.CAMPAIGNS_VIEW,
    PERMISSIONS.CAMPAIGNS_CREATE,
    PERMISSIONS.CAMPAIGNS_EDIT,
    PERMISSIONS.CAMPAIGNS_SEND,
    PERMISSIONS.CAMPAIGNS_SCHEDULE,
    PERMISSIONS.TEMPLATES_VIEW,
    PERMISSIONS.TEMPLATES_CREATE,
    PERMISSIONS.TEMPLATES_EDIT,
    PERMISSIONS.TEMPLATES_SYNC,
    PERMISSIONS.INBOX_VIEW,
    PERMISSIONS.INBOX_SEND_MESSAGE,
    PERMISSIONS.INBOX_ASSIGN,
    PERMISSIONS.INBOX_CLOSE,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.ANALYTICS_EXPORT,
    PERMISSIONS.SETTINGS_VIEW,
    PERMISSIONS.TEAM_VIEW,
  ],
  agent: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.CONTACTS_VIEW,
    PERMISSIONS.CAMPAIGNS_VIEW,
    PERMISSIONS.TEMPLATES_VIEW,
    PERMISSIONS.INBOX_VIEW,
    PERMISSIONS.INBOX_SEND_MESSAGE,
    PERMISSIONS.ANALYTICS_VIEW,
  ],
};

// Insert schemas
export const insertUserSchema = createInsertSchema(users, {
  role: z.enum(ROLE_VALUES as [string, ...string[]]),
  status: z.enum(USER_STATUS_VALUES as [string, ...string[]]),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
});
export const insertCampaignSchema = createInsertSchema(campaigns, {
  status: z.enum(CAMPAIGN_STATUS_VALUES as [string, ...string[]]).optional(),
}).omit({
  id: true,
  createdAt: true,
});
export const insertChannelSchema = createInsertSchema(channels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertTemplateSchema = createInsertSchema(templates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});
export const insertMessageSchema = createInsertSchema(messages, {
  status: z.enum(MESSAGE_STATUS_VALUES as [string, ...string[]]).optional(),
}).omit({
  id: true,
  createdAt: true,
});
export const insertAutomationSchema = createInsertSchema(automations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertAutomationNodeSchema = createInsertSchema(
  automationNodes
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAutomationExecutionSchema = createInsertSchema(
  automationExecutions
).omit({ id: true, startedAt: true });
export const insertAutomationExecutionLogSchema = createInsertSchema(
  automationExecutionLogs
).omit({ id: true, executedAt: true });
export const insertAnalyticsSchema = createInsertSchema(analytics).omit({
  id: true,
  createdAt: true,
});
export const insertWhatsappChannelSchema = createInsertSchema(
  whatsappChannels
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWebhookConfigSchema = createInsertSchema(
  webhookConfigs
).omit({ id: true, createdAt: true });
export const insertMessageQueueSchema = createInsertSchema(messageQueue).omit({
  id: true,
  createdAt: true,
});
export const insertApiLogSchema = createInsertSchema(apiLogs).omit({
  id: true,
  createdAt: true,
});
export const insertCampaignRecipientSchema = createInsertSchema(
  campaignRecipients
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertConversationAssignmentSchema = createInsertSchema(
  conversationAssignments
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserActivityLogSchema = createInsertSchema(
  userActivityLogs
).omit({ id: true, createdAt: true });

export const insertSiteSchema = createInsertSchema(sites).omit({
  id: true,
  createdAt: true,
  widgetCode: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Channel = typeof channels.$inferSelect;
export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Automation = typeof automations.$inferSelect;
export type InsertAutomation = z.infer<typeof insertAutomationSchema>;
export type AutomationNode = typeof automationNodes.$inferSelect;
export type InsertAutomationNode = z.infer<typeof insertAutomationNodeSchema>;
export type AutomationExecution = typeof automationExecutions.$inferSelect;
export type InsertAutomationExecution = z.infer<
  typeof insertAutomationExecutionSchema
>;
export type AutomationExecutionLog =
  typeof automationExecutionLogs.$inferSelect;
export type InsertAutomationExecutionLog = z.infer<
  typeof insertAutomationExecutionLogSchema
>;
export type Analytics = typeof analytics.$inferSelect;
export type InsertAnalytics = z.infer<typeof insertAnalyticsSchema>;
export type WhatsappChannel = typeof whatsappChannels.$inferSelect;
export type InsertWhatsappChannel = z.infer<typeof insertWhatsappChannelSchema>;
export type WebhookConfig = typeof webhookConfigs.$inferSelect;
export type InsertWebhookConfig = z.infer<typeof insertWebhookConfigSchema>;
export type MessageQueue = typeof messageQueue.$inferSelect;
export type InsertMessageQueue = z.infer<typeof insertMessageQueueSchema>;
export type ApiLog = typeof apiLogs.$inferSelect;
export type InsertApiLog = z.infer<typeof insertApiLogSchema>;
export type CampaignRecipient = typeof campaignRecipients.$inferSelect;
export type InsertCampaignRecipient = z.infer<
  typeof insertCampaignRecipientSchema
>;
export type ConversationAssignment =
  typeof conversationAssignments.$inferSelect;
export type InsertConversationAssignment = z.infer<
  typeof insertConversationAssignmentSchema
>;
export type UserActivityLog = typeof userActivityLogs.$inferSelect;
export type InsertUserActivityLog = z.infer<typeof insertUserActivityLogSchema>;
export type PanelConfig = typeof panelConfig.$inferSelect;
export type NewPanelConfig = typeof panelConfig.$inferInsert;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export type Site = typeof sites.$inferSelect;
export type InsertSite = z.infer<typeof insertSiteSchema>;

// Drizzle Relations for proper joins and queries
export const channelsRelations = relations(channels, ({ many }) => ({
  contacts: many(contacts),
  campaigns: many(campaigns),
  templates: many(templates),
  conversations: many(conversations),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  channel: one(channels, {
    fields: [contacts.channelId],
    references: [channels.id],
  }),
  conversations: many(conversations),
  campaignRecipients: many(campaignRecipients),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  channel: one(channels, {
    fields: [campaigns.channelId],
    references: [channels.id],
  }),
  template: one(templates, {
    fields: [campaigns.templateId],
    references: [templates.id],
  }),
  recipients: many(campaignRecipients),
}));

export const campaignRecipientsRelations = relations(
  campaignRecipients,
  ({ one }) => ({
    campaign: one(campaigns, {
      fields: [campaignRecipients.campaignId],
      references: [campaigns.id],
    }),
    contact: one(contacts, {
      fields: [campaignRecipients.contactId],
      references: [contacts.id],
    }),
  })
);

export const templatesRelations = relations(templates, ({ one, many }) => ({
  channel: one(channels, {
    fields: [templates.channelId],
    references: [channels.id],
  }),
  campaigns: many(campaigns),
}));

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    channel: one(channels, {
      fields: [conversations.channelId],
      references: [channels.id],
    }),
    contact: one(contacts, {
      fields: [conversations.contactId],
      references: [contacts.id],
    }),

    messages: many(messages),
  })
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  assignedConversations: many(conversationAssignments, {
    relationName: "conversation_assigned_user", // matches user side
  }),
  assignedByConversations: many(conversationAssignments, {
    relationName: "conversation_assigned_by_user", // matches assignedBy side
  }),
  activityLogs: many(userActivityLogs),
}));

export const conversationAssignmentsRelations = relations(
  conversationAssignments,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationAssignments.conversationId],
      references: [conversations.id],
    }),
    user: one(users, {
      fields: [conversationAssignments.userId],
      references: [users.id],
      relationName: "conversation_assigned_user",
    }),
    assignedByUser: one(users, {
      fields: [conversationAssignments.assignedBy],
      references: [users.id],
      relationName: "conversation_assigned_by_user",
    }),
  })
);

export const userActivityLogsRelations = relations(
  userActivityLogs,
  ({ one }) => ({
    user: one(users, {
      fields: [userActivityLogs.userId],
      references: [users.id],
    }),
  })
);

export const automationsRelations = relations(automations, ({ one, many }) => ({
  channel: one(channels, {
    fields: [automations.channelId],
    references: [channels.id],
  }),
  createdByUser: one(users, {
    fields: [automations.createdBy],
    references: [users.id],
  }),
  nodes: many(automationNodes),
  edges: many(automationEdges),
  executions: many(automationExecutions),
}));

export const trainingSources = pgTable("training_sources", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  siteId: varchar("site_id").notNull(),
  channelId: varchar("channel_id"),
  type: text("type").notNull(),
  name: text("name").notNull(),
  url: text("url"),
  content: text("content"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  chunkCount: integer("chunk_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const trainingChunks = pgTable("training_chunks", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sourceId: varchar("source_id").notNull(),
  siteId: varchar("site_id").notNull(),
  content: text("content").notNull(),
  embedding: jsonb("embedding"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const trainingQaPairs = pgTable("training_qa_pairs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  siteId: varchar("site_id").notNull(),
  channelId: varchar("channel_id"),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category").default("general"),
  embedding: jsonb("embedding"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const insertTrainingSourceSchema = createInsertSchema(trainingSources);
export const insertTrainingQaPairSchema = createInsertSchema(trainingQaPairs);

export const automationNodesRelations = relations(
  automationNodes,
  ({ one }) => ({
    automation: one(automations, {
      fields: [automationNodes.automationId],
      references: [automations.id],
    }),
  })
);

export const automationEdgesRelations = relations(
  automationEdges,
  ({ one }) => ({
    automation: one(automations, {
      fields: [automationEdges.automationId],
      references: [automations.id],
    }),
  })
);

export const automationExecutionsRelations = relations(
  automationExecutions,
  ({ one, many }) => ({
    automation: one(automations, {
      fields: [automationExecutions.automationId],
      references: [automations.id],
    }),
    contact: one(contacts, {
      fields: [automationExecutions.contactId],
      references: [contacts.id],
    }),
    conversation: one(conversations, {
      fields: [automationExecutions.conversationId],
      references: [conversations.id],
    }),
    logs: many(automationExecutionLogs),
  })
);

export const automationExecutionLogsRelations = relations(
  automationExecutionLogs,
  ({ one }) => ({
    execution: one(automationExecutions, {
      fields: [automationExecutionLogs.executionId],
      references: [automationExecutions.id],
    }),
  })
);

export const clientApiKeys = pgTable("client_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  channelId: varchar("channel_id").references(() => channels.id),
  name: varchar("name", { length: 100 }).notNull(),
  apiKey: varchar("api_key", { length: 64 }).notNull().unique(),
  secretHash: varchar("secret_hash", { length: 256 }).notNull(),
  permissions: jsonb("permissions").$type<string[]>().default(sql`'[]'`),
  isActive: boolean("is_active").default(true),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  requestCount: integer("request_count").default(0),
  monthlyRequestCount: integer("monthly_request_count").default(0),
  monthlyResetAt: timestamp("monthly_reset_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const clientApiUsageLogs = pgTable("client_api_usage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  apiKeyId: varchar("api_key_id").notNull().references(() => clientApiKeys.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  channelId: varchar("channel_id").references(() => channels.id),
  endpoint: varchar("endpoint", { length: 255 }).notNull(),
  method: varchar("method", { length: 10 }).notNull(),
  statusCode: integer("status_code"),
  responseTime: integer("response_time"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const clientWebhooks = pgTable("client_webhooks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  channelId: varchar("channel_id").references(() => channels.id),
  url: text("url").notNull(),
  secret: varchar("secret", { length: 256 }),
  events: jsonb("events").$type<string[]>().default(sql`'[]'`),
  isActive: boolean("is_active").default(true),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  failureCount: integer("failure_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const updateRuns = pgTable(
  "update_runs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    triggeredBy: varchar("triggered_by").references(() => users.id, {
      onDelete: "set null",
    }),
    triggeredByUsername: text("triggered_by_username"),
    fromVersion: text("from_version"),
    toVersion: text("to_version"),
    status: varchar("status", { length: 20 }).notNull().default("running"),
    finalMessage: text("final_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => ({
    updateRunsStartedAtIdx: index("update_runs_started_at_idx").on(
      table.startedAt
    ),
  })
);

export const updateRunEvents = pgTable(
  "update_run_events",
  {
    id: serial("id").primaryKey(),
    runId: varchar("run_id")
      .notNull()
      .references(() => updateRuns.id, { onDelete: "cascade" }),
    step: varchar("step", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    message: text("message").notNull(),
    progress: integer("progress"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    updateRunEventsRunIdIdx: index("update_run_events_run_id_idx").on(
      table.runId,
      table.id
    ),
  })
);

export const insertUpdateRunSchema = createInsertSchema(updateRuns).omit({
  id: true,
  startedAt: true,
  finishedAt: true,
});
export type UpdateRun = typeof updateRuns.$inferSelect;
export type InsertUpdateRun = z.infer<typeof insertUpdateRunSchema>;
export const insertUpdateRunEventSchema = createInsertSchema(
  updateRunEvents
).omit({ id: true, createdAt: true });
export type UpdateRunEvent = typeof updateRunEvents.$inferSelect;
export type InsertUpdateRunEvent = z.infer<typeof insertUpdateRunEventSchema>;

export const conversationPins = pgTable(
  "conversation_pins",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: varchar("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    channelId: varchar("channel_id").references(() => channels.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    conversationPinsUserIdx: index("conversation_pins_user_idx").on(
      table.userId
    ),
    conversationPinsUserChannelIdx: index(
      "conversation_pins_user_channel_idx"
    ).on(table.userId, table.channelId),
    conversationPinsUniq: uniqueIndex("conversation_pins_user_conv_uniq").on(
      table.userId,
      table.conversationId
    ),
  })
);
export type ConversationPin = typeof conversationPins.$inferSelect;
export type InsertConversationPin = typeof conversationPins.$inferInsert;

export const platformLanguages = pgTable("platform_languages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 10 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  nativeName: varchar("native_name", { length: 100 }).notNull(),
  icon: varchar("icon", { length: 10 }),
  direction: varchar("direction", { length: 3 }).notNull().default("ltr"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  translations: jsonb("translations").default(sql`'{}'`),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─────────────────────────────────────────────────────────────
// Meta WhatsApp usage, rate card and account health (v3.9)
//
// HoverChat never collects Meta messaging charges. These tables only
// TRACK usage and ESTIMATE what Meta bills the customer directly.
// Subscription billing stays in `subscriptions` / `transactions`.
// ─────────────────────────────────────────────────────────────

export const metaRateCards = pgTable(
  "meta_rate_cards",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    countryCode: varchar("country_code", { length: 8 }).notNull(), // ISO-2, or "*" = Other
    countryName: text("country_name"),
    category: varchar("category", { length: 40 }).notNull(), // marketing | utility | authentication | authentication_international | service
    rate: numeric("rate", { precision: 12, scale: 6 }).notNull(), // per delivered billable message
    currency: varchar("currency", { length: 8 }).notNull().default("INR"),
    freeMonthlyAllowance: integer("free_monthly_allowance"), // per business phone number (service)
    volumeTiers: jsonb("volume_tiers").$type<{ fromVolume: number; rate: number }[]>(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    pricingSource: text("pricing_source"),
    pricingVersion: varchar("pricing_version", { length: 64 }),
    notes: text("notes"),
    createdBy: varchar("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    rateLookupIdx: index("meta_rate_cards_lookup_idx").on(table.countryCode, table.category, table.effectiveFrom),
  })
);

export const whatsappMessageUsage = pgTable(
  "whatsapp_message_usage",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    customerId: varchar("customer_id").notNull(), // channel owner (tenant)
    channelId: varchar("channel_id"),
    wabaId: varchar("waba_id", { length: 64 }),
    phoneNumberId: varchar("phone_number_id", { length: 64 }),
    messageId: varchar("message_id", { length: 191 }).notNull(), // Meta wamid
    recipientCountry: varchar("recipient_country", { length: 8 }),
    recipientDialCode: varchar("recipient_dial_code", { length: 8 }),
    category: varchar("category", { length: 40 }).notNull().default("service"),
    pricingType: varchar("pricing_type", { length: 40 }), // regular | free_customer_service | free_entry_point | unknown
    pricingModel: varchar("pricing_model", { length: 16 }), // PMP | CBP
    billable: boolean("billable").notNull().default(false),
    status: varchar("status", { length: 16 }).notNull(), // sent | delivered | read | failed
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    errorCode: varchar("error_code", { length: 32 }),
    campaignId: varchar("campaign_id"),
    templateId: varchar("template_id"),
    templateName: text("template_name"),
    rateCardId: varchar("rate_card_id"),
    appliedRate: numeric("applied_rate", { precision: 12, scale: 6 }),
    estimatedCost: numeric("estimated_cost", { precision: 14, scale: 6 }).notNull().default("0"),
    currency: varchar("currency", { length: 8 }),
    pricingVersion: varchar("pricing_version", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    usageMessageUnique: uniqueIndex("wa_usage_message_id_uq").on(table.messageId),
    usageCustomerCreatedIdx: index("wa_usage_customer_created_idx").on(table.customerId, table.createdAt),
    usageCustomerDeliveredIdx: index("wa_usage_customer_delivered_idx").on(table.customerId, table.deliveredAt),
    usageWabaIdx: index("wa_usage_waba_idx").on(table.wabaId),
    usagePhoneIdx: index("wa_usage_phone_idx").on(table.phoneNumberId),
    usageDeliveredIdx: index("wa_usage_delivered_idx").on(table.deliveredAt),
    usageCategoryIdx: index("wa_usage_category_idx").on(table.category),
    usageCampaignIdx: index("wa_usage_campaign_idx").on(table.campaignId),
    usageCreatedIdx: index("wa_usage_created_idx").on(table.createdAt),
  })
);

export const whatsappAccountHealth = pgTable(
  "whatsapp_account_health",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    channelId: varchar("channel_id").notNull(),
    customerId: varchar("customer_id"),
    wabaId: varchar("waba_id", { length: 64 }),
    phoneNumberId: varchar("phone_number_id", { length: 64 }),
    businessId: varchar("business_id", { length: 64 }),
    businessName: text("business_name"),
    businessVerificationStatus: varchar("business_verification_status", { length: 40 }),
    wabaName: text("waba_name"),
    wabaReviewStatus: varchar("waba_review_status", { length: 40 }),
    wabaCanSend: varchar("waba_can_send", { length: 16 }),
    accountMode: varchar("account_mode", { length: 20 }),
    phoneNumber: text("phone_number"),
    verifiedName: text("verified_name"),
    nameStatus: varchar("name_status", { length: 40 }),
    qualityRating: varchar("quality_rating", { length: 16 }),
    messagingLimit: varchar("messaging_limit", { length: 40 }),
    phoneStatus: varchar("phone_status", { length: 40 }),
    codeVerificationStatus: varchar("code_verification_status", { length: 40 }),
    phoneCanSend: varchar("phone_can_send", { length: 16 }),
    messagingAvailability: varchar("messaging_availability", { length: 16 }),
    billingStatus: varchar("billing_status", { length: 20 }), // ok | attention | not_detected | unknown
    templateCounts: jsonb("template_counts").$type<Record<string, number>>().default({}),
    issues: jsonb("issues").$type<any[]>().default([]),
    callingIssues: jsonb("calling_issues").$type<any[]>().default([]),
    overallStatus: varchar("overall_status", { length: 20 }).notNull().default("unknown"),
    raw: jsonb("raw"),
    lastError: text("last_error"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    healthChannelUnique: uniqueIndex("wa_health_channel_uq").on(table.channelId),
    healthCustomerIdx: index("wa_health_customer_idx").on(table.customerId),
    healthOverallIdx: index("wa_health_overall_idx").on(table.overallStatus),
  })
);

export type MetaRateCard = typeof metaRateCards.$inferSelect;
export type InsertMetaRateCard = typeof metaRateCards.$inferInsert;
export type WhatsappMessageUsage = typeof whatsappMessageUsage.$inferSelect;
export type WhatsappAccountHealth = typeof whatsappAccountHealth.$inferSelect;

// ─────────────────────────────────────────────────────────────
// Reseller distribution (v3.10)
//
// Reseller = users row (role "reseller") + reseller_profiles.
// Reseller customers are ordinary customer users (role "admin") linked
// permanently through reseller_customers (one reseller per customer).
// Subscriptions/payments reuse `subscriptions` + `transactions`.
// Resellers sell HoverChat subscriptions only — never Meta charges.
// ─────────────────────────────────────────────────────────────

export const resellerProfiles = pgTable(
  "reseller_profiles",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    resellerCode: varchar("reseller_code", { length: 16 }).notNull(),
    businessName: text("business_name").notNull(),
    contactPerson: text("contact_person").notNull(),
    email: text("email").notNull(),
    mobile: varchar("mobile", { length: 20 }).notNull(),
    companyName: text("company_name"),
    address: text("address"),
    // pending_activation | active | inactive | suspended | archived
    status: varchar("status", { length: 24 }).notNull().default("pending_activation"),
    maxCustomers: integer("max_customers").notNull().default(0),
    // default model for new plan pricing rows: wholesale | commission_percent | fixed_commission
    defaultPricingModel: varchar("default_pricing_model", { length: 24 }).notNull().default("wholesale"),
    // on_payment = subscription activates only after verified payment; immediate = activate on creation
    activationPolicy: varchar("activation_policy", { length: 16 }).notNull().default("on_payment"),
    // proportional | full | none — how margin is reversed on refunds
    refundPolicy: varchar("refund_policy", { length: 16 }).notNull().default("proportional"),
    payoutHoldDays: integer("payout_hold_days").notNull().default(7),
    permissions: jsonb("permissions").$type<Record<string, boolean>>().notNull().default({}),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    notes: text("notes"),
    suspendedReason: text("suspended_reason"),
    createdBy: varchar("created_by"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    resellerUserUq: uniqueIndex("reseller_profiles_user_uq").on(t.userId),
    resellerCodeUq: uniqueIndex("reseller_profiles_code_uq").on(t.resellerCode),
    resellerStatusIdx: index("reseller_profiles_status_idx").on(t.status),
  })
);

/** Plan pricing per reseller (customerUserId set = customer-specific override). */
export const resellerPlanPricing = pgTable(
  "reseller_plan_pricing",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    resellerId: varchar("reseller_id").notNull().references(() => resellerProfiles.id, { onDelete: "cascade" }),
    planId: varchar("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
    billingCycle: varchar("billing_cycle", { length: 10 }).notNull(), // monthly | annual
    customerUserId: varchar("customer_user_id").references(() => users.id, { onDelete: "cascade" }),
    pricingModel: varchar("pricing_model", { length: 24 }).notNull(), // wholesale | commission_percent | fixed_commission
    wholesalePrice: numeric("wholesale_price", { precision: 12, scale: 2 }),
    commissionPercent: numeric("commission_percent", { precision: 6, scale: 3 }),
    fixedCommission: numeric("fixed_commission", { precision: 12, scale: 2 }),
    suggestedRetailPrice: numeric("suggested_retail_price", { precision: 12, scale: 2 }).notNull(),
    minSellingPrice: numeric("min_selling_price", { precision: 12, scale: 2 }).notNull(),
    maxSellingPrice: numeric("max_selling_price", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 8 }).notNull().default("INR"),
    isActive: boolean("is_active").notNull().default(true),
    version: integer("version").notNull().default(1),
    updatedBy: varchar("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    pricingResellerIdx: index("reseller_pricing_reseller_idx").on(t.resellerId),
    // one ACTIVE row per reseller + plan + cycle (+ customer override)
    pricingActiveUq: uniqueIndex("reseller_pricing_active_uq")
      .on(t.resellerId, t.planId, t.billingCycle, sql`COALESCE(${t.customerUserId}, '')`)
      .where(sql`${t.isActive}`),
  })
);

/** Permanent reseller ↔ customer link. One reseller per customer (unique). */
export const resellerCustomers = pgTable(
  "reseller_customers",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    resellerId: varchar("reseller_id").notNull().references(() => resellerProfiles.id, { onDelete: "restrict" }),
    customerUserId: varchar("customer_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    businessName: text("business_name"),
    mobile: varchar("mobile", { length: 20 }),
    source: varchar("source", { length: 24 }).notNull().default("reseller_created"), // reseller_created | transfer | admin_attached
    previousResellerId: varchar("previous_reseller_id"),
    attributedAt: timestamp("attributed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    rcCustomerUq: uniqueIndex("reseller_customers_customer_uq").on(t.customerUserId),
    rcResellerIdx: index("reseller_customers_reseller_idx").on(t.resellerId),
  })
);

/** One row per reseller sale (new or renewal). Pricing frozen at sale time. */
export const resellerSales = pgTable(
  "reseller_sales",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    resellerId: varchar("reseller_id").notNull().references(() => resellerProfiles.id, { onDelete: "restrict" }),
    customerUserId: varchar("customer_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    saleType: varchar("sale_type", { length: 10 }).notNull(), // new | renewal
    planId: varchar("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
    planName: text("plan_name").notNull(),
    billingCycle: varchar("billing_cycle", { length: 10 }).notNull(),
    cycles: integer("cycles").notNull().default(1),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    unitSellingPrice: numeric("unit_selling_price", { precision: 12, scale: 2 }).notNull(),
    sellingPrice: numeric("selling_price", { precision: 12, scale: 2 }).notNull(), // total charged
    wholesaleCost: numeric("wholesale_cost", { precision: 12, scale: 2 }), // total, wholesale model
    commissionAmount: numeric("commission_amount", { precision: 12, scale: 2 }), // total, commission models
    resellerEarning: numeric("reseller_earning", { precision: 12, scale: 2 }).notNull(), // gross margin / commission
    platformRevenue: numeric("platform_revenue", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 8 }).notNull().default("INR"),
    pricingModel: varchar("pricing_model", { length: 24 }).notNull(),
    pricingRowId: varchar("pricing_row_id"),
    pricingVersion: integer("pricing_version"),
    pricingSnapshot: jsonb("pricing_snapshot").notNull(),
    // pending | pending_verification | paid | failed | refunded | partially_refunded | cancelled
    paymentStatus: varchar("payment_status", { length: 24 }).notNull().default("pending"),
    activationPolicy: varchar("activation_policy", { length: 16 }).notNull(),
    transactionId: varchar("transaction_id").references(() => transactions.id, { onDelete: "restrict" }),
    subscriptionId: varchar("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
    payTokenHash: varchar("pay_token_hash", { length: 64 }),
    razorpayOrderId: varchar("razorpay_order_id", { length: 64 }),
    paymentReference: text("payment_reference"),
    paymentMethod: varchar("payment_method", { length: 24 }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedAmount: numeric("refunded_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    renewalReminderSentAt: timestamp("renewal_reminder_sent_at", { withTimezone: true }),
    expiryNoticeSentAt: timestamp("expiry_notice_sent_at", { withTimezone: true }),
    idempotencyKey: varchar("idempotency_key", { length: 80 }),
    notes: text("notes"),
    createdBy: varchar("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    salesResellerCreatedIdx: index("reseller_sales_reseller_created_idx").on(t.resellerId, t.createdAt),
    salesCustomerIdx: index("reseller_sales_customer_idx").on(t.customerUserId),
    salesStatusIdx: index("reseller_sales_status_idx").on(t.paymentStatus),
    salesPeriodEndIdx: index("reseller_sales_period_end_idx").on(t.periodEnd),
    salesTxnUq: uniqueIndex("reseller_sales_transaction_uq").on(t.transactionId),
    salesOrderUq: uniqueIndex("reseller_sales_order_uq").on(t.razorpayOrderId),
    salesTokenUq: uniqueIndex("reseller_sales_token_uq").on(t.payTokenHash),
    salesIdemUq: uniqueIndex("reseller_sales_idem_uq").on(t.resellerId, t.idempotencyKey),
    // at most one unpaid sale per customer (blocks duplicate renewals)
    salesOpenUq: uniqueIndex("reseller_sales_open_uq")
      .on(t.customerUserId)
      .where(sql`${t.paymentStatus} IN ('pending','pending_verification')`),
    // a subscription period can only be sold once
    salesPeriodUq: uniqueIndex("reseller_sales_period_uq")
      .on(t.customerUserId, t.periodStart)
      .where(sql`${t.paymentStatus} NOT IN ('failed','cancelled')`),
  })
);

/** Immutable reseller earnings ledger. Never updated; corrections are new rows. */
export const resellerLedgerEntries = pgTable(
  "reseller_ledger_entries",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    resellerId: varchar("reseller_id").notNull().references(() => resellerProfiles.id, { onDelete: "restrict" }),
    saleId: varchar("sale_id").references(() => resellerSales.id, { onDelete: "restrict" }),
    entryType: varchar("entry_type", { length: 16 }).notNull(), // earning | reversal | payout | adjustment
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(), // signed
    currency: varchar("currency", { length: 8 }).notNull().default("INR"),
    reference: varchar("reference", { length: 120 }).notNull(), // dedupe key (sale id, refund id, payout ref)
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    description: text("description"),
    createdBy: varchar("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ledgerResellerIdx: index("reseller_ledger_reseller_idx").on(t.resellerId, t.createdAt),
    ledgerDedupeUq: uniqueIndex("reseller_ledger_dedupe_uq").on(t.entryType, t.reference),
  })
);

export const resellerAuditLogs = pgTable(
  "reseller_audit_logs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    resellerId: varchar("reseller_id"),
    actorUserId: varchar("actor_user_id"),
    actorRole: varchar("actor_role", { length: 20 }),
    action: varchar("action", { length: 64 }).notNull(),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: varchar("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    auditResellerIdx: index("reseller_audit_reseller_idx").on(t.resellerId, t.createdAt),
  })
);

/** One-time, hashed account tokens (invitation / password set). */
export const accountInvitations = pgTable(
  "account_invitations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    purpose: varchar("purpose", { length: 24 }).notNull(), // reseller_invite | customer_invite | password_reset
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdBy: varchar("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    invitationTokenUq: uniqueIndex("account_invitations_token_uq").on(t.tokenHash),
    invitationUserIdx: index("account_invitations_user_idx").on(t.userId),
  })
);

export type ResellerProfile = typeof resellerProfiles.$inferSelect;
export type ResellerPlanPricing = typeof resellerPlanPricing.$inferSelect;
export type ResellerSale = typeof resellerSales.$inferSelect;
export type ResellerLedgerEntry = typeof resellerLedgerEntries.$inferSelect;

// ───────────────────────── Integrations (Shopify, WooCommerce, Sheets, CRM) ─────────────────────────
export const integrations = pgTable(
  "integrations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    channelId: varchar("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(), // shopify | woocommerce | google_sheets | crm_webhook
    name: varchar("name", { length: 120 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("active"), // active | paused
    token: varchar("token", { length: 64 }).notNull(), // secret part of the inbound URL
    config: jsonb("config").notNull().default({}), // { signingSecret, outboundUrl, outboundEvents[], defaultCountryCode, storeUrl }
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    eventCount: integer("event_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    integrationsOwnerIdx: index("integrations_owner_idx").on(t.ownerId),
    integrationsTokenUq: uniqueIndex("integrations_token_uq").on(t.token),
  })
);

export const integrationRules = pgTable(
  "integration_rules",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    integrationId: varchar("integration_id").notNull().references(() => integrations.id, { onDelete: "cascade" }),
    event: varchar("event", { length: 80 }).notNull(), // e.g. orders/create, order.created, row.added
    templateName: varchar("template_name", { length: 512 }).notNull(),
    language: varchar("language", { length: 16 }).notNull().default("en_US"),
    phonePath: varchar("phone_path", { length: 200 }), // null = auto-detect
    variables: jsonb("variables").notNull().default([]), // ["customer.first_name", "static:Hover", ...] for {{1}}..
    headerVariable: varchar("header_variable", { length: 200 }),
    buttonVariable: varchar("button_variable", { length: 200 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ integrationRulesIntIdx: index("integration_rules_int_idx").on(t.integrationId) })
);

export const integrationLogs = pgTable(
  "integration_logs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    integrationId: varchar("integration_id").notNull().references(() => integrations.id, { onDelete: "cascade" }),
    direction: varchar("direction", { length: 8 }).notNull().default("in"), // in | out
    event: varchar("event", { length: 80 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(), // sent | skipped | failed | received | delivered
    phone: varchar("phone", { length: 24 }),
    detail: text("detail"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ integrationLogsIntIdx: index("integration_logs_int_idx").on(t.integrationId, t.createdAt) })
);

export type Integration = typeof integrations.$inferSelect;
export type IntegrationRule = typeof integrationRules.$inferSelect;
export type IntegrationLog = typeof integrationLogs.$inferSelect;

// ───────────────────────── WhatsApp Mini Store ─────────────────────────
export const storeSettings = pgTable("store_settings", {
  channelId: varchar("channel_id").primaryKey().references(() => channels.id, { onDelete: "cascade" }),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  storeName: varchar("store_name", { length: 80 }).notNull().default("Our store"),
  keywords: jsonb("keywords").notNull().default(["shop", "store", "menu", "order", "catalog"]),
  welcomeText: text("welcome_text").notNull().default("Welcome! 👋 Browse our products below and order right here on WhatsApp."),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  askAddress: boolean("ask_address").notNull().default(true),
  storeType: varchar("store_type", { length: 12 }).notNull().default("products"), // products | services
  checkoutPrompt: text("checkout_prompt"), // question asked at checkout (null = default address question)
  codEnabled: boolean("cod_enabled").notNull().default(true),
  upiId: varchar("upi_id", { length: 100 }),
  razorpayKeyId: varchar("razorpay_key_id", { length: 100 }),
  razorpayKeySecret: text("razorpay_key_secret"),
  razorpayWebhookSecret: text("razorpay_webhook_secret"),
  deliveryFee: numeric("delivery_fee", { precision: 12, scale: 2 }).notNull().default("0"),
  minOrder: numeric("min_order", { precision: 12, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const storeProducts = pgTable(
  "store_products",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    channelId: varchar("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 60 }).notNull().default("All"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    imageUrl: text("image_url"),
    stock: integer("stock"), // null = unlimited
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ storeProductsChannelIdx: index("store_products_channel_idx").on(t.channelId) })
);

export const storeCarts = pgTable(
  "store_carts",
  {
    channelId: varchar("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    phone: varchar("phone", { length: 24 }).notNull(),
    items: jsonb("items").notNull().default([]), // [{productId, qty}]
    state: varchar("state", { length: 32 }).notNull().default("browsing"), // browsing | awaiting_address
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }), // abandoned-cart reminder (reset on every cart change)
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }), // kept, to count recovered carts
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ storeCartsPk: uniqueIndex("store_carts_channel_phone_uq").on(t.channelId, t.phone) })
);

export const storeOrders = pgTable(
  "store_orders",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    orderNumber: varchar("order_number", { length: 32 }).notNull(),
    channelId: varchar("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    ownerId: varchar("owner_id").notNull(),
    conversationId: varchar("conversation_id"),
    phone: varchar("phone", { length: 24 }).notNull(),
    customerName: varchar("customer_name", { length: 120 }),
    items: jsonb("items").notNull(), // [{productId, name, price, qty, lineTotal}]
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    deliveryFee: numeric("delivery_fee", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    address: text("address"),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | confirmed | packed | shipped | delivered | cancelled
    paymentMethod: varchar("payment_method", { length: 16 }), // online | cod | upi
    paymentStatus: varchar("payment_status", { length: 16 }).notNull().default("unpaid"), // unpaid | paid | refunded
    paymentLinkId: varchar("payment_link_id", { length: 64 }),
    paymentLinkUrl: text("payment_link_url"),
    trackingUrl: text("tracking_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    storeOrdersChannelIdx: index("store_orders_channel_idx").on(t.channelId, t.createdAt),
    storeOrdersNumberUq: uniqueIndex("store_orders_number_uq").on(t.orderNumber),
    storeOrdersPhoneIdx: index("store_orders_phone_idx").on(t.channelId, t.phone),
  })
);

export type StoreSettings = typeof storeSettings.$inferSelect;
export type StoreProduct = typeof storeProducts.$inferSelect;
export type StoreOrder = typeof storeOrders.$inferSelect;

// ───────────────────────── Appointments (clinics, doctors, salons…) ─────────────────────────
export const appointmentSettings = pgTable("appointment_settings", {
  channelId: varchar("channel_id").primaryKey().references(() => channels.id, { onDelete: "cascade" }),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  businessName: varchar("business_name", { length: 80 }).notNull().default("Our clinic"),
  providerLabel: varchar("provider_label", { length: 24 }).notNull().default("Doctor"),
  keywords: jsonb("keywords").notNull().default(["book", "appointment", "doctor", "slot"]),
  welcomeText: text("welcome_text").notNull().default("Book an appointment in a few taps 🩺"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Kolkata"),
  bookingWindowDays: integer("booking_window_days").notNull().default(7),
  minNoticeMinutes: integer("min_notice_minutes").notNull().default(60),
  askReason: boolean("ask_reason").notNull().default(true),
  reminderMinutes: integer("reminder_minutes").notNull().default(120), // 0 = off
  reminderTemplate: varchar("reminder_template", { length: 512 }),
  reminderTemplateLang: varchar("reminder_template_lang", { length: 16 }).default("en_US"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appointmentProviders = pgTable(
  "appointment_providers",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    channelId: varchar("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    specialty: varchar("specialty", { length: 80 }),
    fee: numeric("fee", { precision: 12, scale: 2 }),
    slotMinutes: integer("slot_minutes").notNull().default(15),
    weeklyHours: jsonb("weekly_hours").notNull().default({}), // { mon: [["10:00","13:00"]], … }
    daysOff: jsonb("days_off").notNull().default([]), // ["2026-12-25"]
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ apptProvidersChannelIdx: index("appointment_providers_channel_idx").on(t.channelId) })
);

export const appointments = pgTable(
  "appointments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    ref: varchar("ref", { length: 24 }).notNull(),
    channelId: varchar("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    ownerId: varchar("owner_id").notNull(),
    providerId: varchar("provider_id").notNull().references(() => appointmentProviders.id, { onDelete: "cascade" }),
    conversationId: varchar("conversation_id"),
    phone: varchar("phone", { length: 24 }).notNull(),
    patientName: varchar("patient_name", { length: 120 }),
    reason: text("reason"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("booked"), // booked | confirmed | completed | no_show | cancelled
    source: varchar("source", { length: 16 }).notNull().default("whatsapp"),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    apptChannelStartIdx: index("appointments_channel_start_idx").on(t.channelId, t.startAt),
    apptPhoneIdx: index("appointments_phone_idx").on(t.channelId, t.phone),
    apptRefUq: uniqueIndex("appointments_ref_uq").on(t.ref),
  })
);

export const appointmentSessions = pgTable(
  "appointment_sessions",
  {
    channelId: varchar("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    phone: varchar("phone", { length: 24 }).notNull(),
    state: varchar("state", { length: 24 }).notNull().default("idle"),
    data: jsonb("data").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ apptSessUq: uniqueIndex("appointment_sessions_uq").on(t.channelId, t.phone) })
);

export type AppointmentSettings = typeof appointmentSettings.$inferSelect;
export type AppointmentProvider = typeof appointmentProviders.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;

// ───────────────────────── Book-a-demo requests (public landing form) ─────────────────────────
export const demoRequests = pgTable(
  "demo_requests",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 30 }).notNull(),
    company: varchar("company", { length: 160 }),
    businessType: varchar("business_type", { length: 60 }),
    teamSize: varchar("team_size", { length: 30 }),
    preferredTime: varchar("preferred_time", { length: 80 }),
    message: text("message"),
    status: varchar("status", { length: 16 }).notNull().default("new"), // new | contacted | scheduled | closed
    notes: text("notes"),
    source: varchar("source", { length: 200 }),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ demoRequestsCreatedIdx: index("demo_requests_created_idx").on(t.createdAt) })
);
export type DemoRequest = typeof demoRequests.$inferSelect;

// ───────────────────────── Flow Studio (no-code WhatsApp Flows) ─────────────────────────
export const waFlows = pgTable(
  "wa_flows",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    channelId: varchar("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    ownerId: varchar("owner_id"),
    name: varchar("name", { length: 120 }).notNull(),
    categories: jsonb("categories").notNull().default(["OTHER"]),
    definition: jsonb("definition").notNull(), // FlowDefinition (shared/flow-studio.ts)
    settings: jsonb("settings").notNull().default({}), // FlowSettings
    cta: varchar("cta", { length: 30 }).notNull().default("Open"),
    body: text("body").notNull().default("Please fill this short form."),
    metaFlowId: varchar("meta_flow_id", { length: 40 }),
    metaHistory: jsonb("meta_history").notNull().default([]), // earlier Meta flow ids (older published versions)
    status: varchar("status", { length: 20 }).notNull().default("local"), // local | draft | published | throttled | blocked | deprecated
    dirty: boolean("dirty").notNull().default(true), // edited since last push to Meta
    validationErrors: jsonb("validation_errors").notNull().default([]),
    previewUrl: text("preview_url"),
    version: integer("version").notNull().default(0), // number of times published
    compilerRev: integer("compiler_rev").notNull().default(2), // Flow JSON compiler revision (one-off re-upload markers)
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    waFlowsChannelIdx: index("wa_flows_channel_idx").on(t.channelId),
    waFlowsMetaIdx: index("wa_flows_meta_idx").on(t.metaFlowId),
  })
);

export const waFlowSessions = pgTable(
  "wa_flow_sessions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    flowId: varchar("flow_id").references(() => waFlows.id, { onDelete: "set null" }),
    channelId: varchar("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    metaFlowId: varchar("meta_flow_id", { length: 40 }),
    flowToken: varchar("flow_token", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 24 }).notNull(),
    contactId: varchar("contact_id"),
    conversationId: varchar("conversation_id"),
    status: varchar("status", { length: 16 }).notNull().default("sent"), // sent | completed
    source: varchar("source", { length: 20 }).notNull().default("studio"), // studio | template | unknown
    response: jsonb("response"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    waFlowSessTokenUq: uniqueIndex("wa_flow_sessions_token_uq").on(t.flowToken),
    waFlowSessFlowIdx: index("wa_flow_sessions_flow_idx").on(t.flowId, t.status),
  })
);
export type WaFlow = typeof waFlows.$inferSelect;
export type WaFlowSession = typeof waFlowSessions.$inferSelect;

// ───────────────────────── Platform WhatsApp (super admin → customers) ─────────────────────────
/** One row ("default"): which number and approved templates the platform uses for automatic messages. */
export const platformWhatsappSettings = pgTable("platform_whatsapp_settings", {
  id: varchar("id").primaryKey().default("default"),
  enabled: boolean("enabled").notNull().default(false),
  channelId: varchar("channel_id").references(() => channels.id, { onDelete: "set null" }),
  // { [event]: { enabled, templateName, language, body: token[], header?: token, button?: token } }
  events: jsonb("events").notNull().default({}),
  updatedBy: varchar("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const platformMessageLogs = pgTable(
  "platform_message_logs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    event: varchar("event", { length: 40 }).notNull(),
    toPhone: varchar("to_phone", { length: 24 }).notNull(),
    userId: varchar("user_id"),
    templateName: varchar("template_name", { length: 120 }),
    status: varchar("status", { length: 16 }).notNull(), // sent | failed | skipped
    error: text("error"),
    whatsappMessageId: varchar("whatsapp_message_id", { length: 120 }),
    trigger: varchar("trigger", { length: 16 }).notNull().default("auto"), // auto | manual | test
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ platformMsgCreatedIdx: index("platform_message_logs_created_idx").on(t.createdAt) })
);
export type PlatformWhatsappSettings = typeof platformWhatsappSettings.$inferSelect;

// ───────────────────────── Website CMS (dynamic pages + navigation) ─────────────────────────
export const cmsPages = pgTable(
  "cms_pages",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    title: varchar("title", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    pageType: varchar("page_type", { length: 16 }).notNull().default("page"), // page | policy | seo
    status: varchar("status", { length: 16 }).notNull().default("draft"), // draft | published
    content: text("content").notNull().default(""),
    excerpt: varchar("excerpt", { length: 500 }),
    template: varchar("template", { length: 16 }).notNull().default("default"), // default | full | legal
    showTitle: boolean("show_title").notNull().default(true),
    metaTitle: varchar("meta_title", { length: 120 }),
    metaDescription: varchar("meta_description", { length: 320 }),
    metaKeywords: varchar("meta_keywords", { length: 400 }),
    ogImage: varchar("og_image", { length: 500 }),
    canonicalUrl: varchar("canonical_url", { length: 500 }),
    noindex: boolean("noindex").notNull().default(false),
    schemaJson: text("schema_json"),
    // Landing page builder
    editor: varchar("editor", { length: 12 }).notNull().default("html"), // html | builder
    blocks: jsonb("blocks").notNull().default(sql`'[]'::jsonb`),
    category: varchar("category", { length: 40 }),
    settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
    views: integer("views").notNull().default(0),
    leads: integer("leads").notNull().default(0),
    createdBy: varchar("created_by"),
    updatedBy: varchar("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ cmsPagesStatusIdx: index("cms_pages_status_idx").on(t.status) })
);
export type CmsPage = typeof cmsPages.$inferSelect;

export const cmsNavItems = pgTable(
  "cms_nav_items",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    label: varchar("label", { length: 80 }).notNull(),
    path: varchar("path", { length: 300 }).notNull(),
    // header_main | header_about | header_resources | footer_product | footer_company | footer_resources | footer_legal | footer_bottom
    location: varchar("location", { length: 24 }).notNull(),
    description: varchar("description", { length: 200 }),
    icon: varchar("icon", { length: 40 }),
    image: varchar("image", { length: 500 }),
    sortOrder: integer("sort_order").notNull().default(0),
    isVisible: boolean("is_visible").notNull().default(true),
    openInNewTab: boolean("open_in_new_tab").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ cmsNavLocIdx: index("cms_nav_location_idx").on(t.location, t.sortOrder) })
);
export type CmsNavItem = typeof cmsNavItems.$inferSelect;

// Website content blocks editable from admin: stats, FAQs, testimonials (grouped by group_key)
export const cmsSiteItems = pgTable(
  "cms_site_items",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    kind: varchar("kind", { length: 16 }).notNull(), // stat | faq | testimonial
    groupKey: varchar("group_key", { length: 32 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(), // stat label | faq question | testimonial name
    body: text("body"), // faq answer | testimonial quote
    value: varchar("value", { length: 40 }), // stat value
    suffix: varchar("suffix", { length: 12 }), // stat suffix
    role: varchar("role", { length: 120 }),
    company: varchar("company", { length: 120 }),
    image: varchar("image", { length: 500 }),
    rating: integer("rating").notNull().default(5),
    results: varchar("results", { length: 200 }),
    icon: varchar("icon", { length: 40 }),
    sortOrder: integer("sort_order").notNull().default(0),
    isVisible: boolean("is_visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ cmsSiteGroupIdx: index("cms_site_items_group_idx").on(t.groupKey, t.sortOrder) })
);
export type CmsSiteItem = typeof cmsSiteItems.$inferSelect;


// ───────────────────────── Two-factor login (authenticator app or email code) ─────────────────────────
export const userTwoFactor = pgTable("user_two_factor", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  method: varchar("method", { length: 10 }).notNull().default("totp"), // totp | email
  secretEnc: text("secret_enc"), // AES-GCM encrypted base32 secret (totp)
  pendingSecretEnc: text("pending_secret_enc"), // set during setup, moved to secretEnc once confirmed
  enabled: boolean("enabled").notNull().default(false),
  backupCodes: jsonb("backup_codes").$type<string[]>().notNull().default([]), // sha256 hashes, removed once used
  lastUsedStep: integer("last_used_step"),
  enabledAt: timestamp("enabled_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type UserTwoFactor = typeof userTwoFactor.$inferSelect;

// ───────────────────────── Drip / follow-up sequences ─────────────────────────
export interface DripStep {
  delayMinutes: number; // wait after the previous step (or after enrolment for step 1)
  kind: "text" | "template";
  text?: string; // {{name}} {{phone}} supported
  templateName?: string;
  language?: string;
  params?: string[]; // body values; {{name}} {{phone}} supported
}
export const dripSequences = pgTable(
  "drip_sequences",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    channelId: varchar("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    ownerId: varchar("owner_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    trigger: varchar("trigger", { length: 20 }).notNull().default("manual"), // manual | keyword | flow_submit | new_contact
    triggerValue: text("trigger_value"), // keywords (comma) | Meta flow id (blank = any flow)
    stopOnReply: boolean("stop_on_reply").notNull().default(true),
    steps: jsonb("steps").$type<DripStep[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ dripSeqChannelIdx: index("drip_sequences_channel_idx").on(t.channelId) })
);
export const dripEnrollments = pgTable(
  "drip_enrollments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    sequenceId: varchar("sequence_id").notNull().references(() => dripSequences.id, { onDelete: "cascade" }),
    channelId: varchar("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    contactId: varchar("contact_id"),
    phone: varchar("phone", { length: 24 }).notNull(),
    name: varchar("name", { length: 120 }),
    stepIndex: integer("step_index").notNull().default(0), // next step to send
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 12 }).notNull().default("active"), // active | completed | stopped | failed
    stopReason: varchar("stop_reason", { length: 120 }),
    lastError: text("last_error"),
    source: varchar("source", { length: 20 }).notNull().default("manual"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dripEnrDueIdx: index("drip_enrollments_due_idx").on(t.status, t.nextRunAt),
    dripEnrSeqIdx: index("drip_enrollments_seq_idx").on(t.sequenceId),
    dripEnrActiveUq: uniqueIndex("drip_enrollments_active_uq").on(t.sequenceId, t.phone).where(sql`${t.status} = 'active'`),
  })
);
export type DripSequence = typeof dripSequences.$inferSelect;
export type DripEnrollment = typeof dripEnrollments.$inferSelect;

// ───────────────────────── Short links with click tracking ─────────────────────────
export const shortLinks = pgTable(
  "short_links",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerId: varchar("owner_id").notNull(),
    code: varchar("code", { length: 24 }).notNull(),
    targetUrl: text("target_url").notNull(),
    title: varchar("title", { length: 120 }),
    isActive: boolean("is_active").notNull().default(true),
    clicks: integer("clicks").notNull().default(0),
    uniqueClicks: integer("unique_clicks").notNull().default(0),
    lastClickAt: timestamp("last_click_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    shortLinksCodeUq: uniqueIndex("short_links_code_uq").on(t.code),
    shortLinksOwnerIdx: index("short_links_owner_idx").on(t.ownerId, t.createdAt),
  })
);
export const linkClicks = pgTable(
  "link_clicks",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    linkId: varchar("link_id").notNull().references(() => shortLinks.id, { onDelete: "cascade" }),
    visitorHash: varchar("visitor_hash", { length: 64 }).notNull(),
    ref: varchar("ref", { length: 40 }), // optional ?r= tag (campaign, contact…)
    device: varchar("device", { length: 16 }),
    referer: text("referer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ linkClicksLinkIdx: index("link_clicks_link_idx").on(t.linkId, t.createdAt) })
);
export type ShortLink = typeof shortLinks.$inferSelect;

// ───────────────────────── Growth settings per WhatsApp number ─────────────────────────
export interface CartRecoveryConfig { enabled?: boolean; delayMinutes?: number; text?: string; templateName?: string; language?: string }
export const growthSettings = pgTable("growth_settings", {
  channelId: varchar("channel_id").primaryKey().references(() => channels.id, { onDelete: "cascade" }),
  ownerId: varchar("owner_id").notNull(),
  cartRecovery: jsonb("cart_recovery").$type<CartRecoveryConfig>().notNull().default({}),
  cartRemindersSent: integer("cart_reminders_sent").notNull().default(0),
  cartRecovered: integer("cart_recovered").notNull().default(0),
  businessHours: jsonb("business_hours").$type<BusinessHoursConfig>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export interface BusinessHoursConfig {
  enabled?: boolean;
  timezone?: string; // IANA, default Asia/Kolkata
  days?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", Array<[string, string]>>>; // [["09:00","18:00"]]; missing/empty = closed
  awayMessage?: string;
  cooldownHours?: number; // don't repeat to the same number within this many hours (default 12)
}
export type GrowthSettings = typeof growthSettings.$inferSelect;

// ───────────────────────── Social apps (super admin): Instagram + Facebook Ads ─────────────────────────
export const socialAppSettings = pgTable("social_app_settings", {
  id: varchar("id").primaryKey().default("default"),
  igAppId: varchar("ig_app_id", { length: 40 }),
  igAppSecretEnc: text("ig_app_secret_enc"),
  fbAppId: varchar("fb_app_id", { length: 40 }), // blank = use the WhatsApp embedded-signup app
  fbAppSecretEnc: text("fb_app_secret_enc"),
  webhookVerifyToken: varchar("webhook_verify_token", { length: 80 }),
  updatedBy: varchar("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ───────────────────────── Instagram ─────────────────────────
export const igAccounts = pgTable(
  "ig_accounts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerId: varchar("owner_id").notNull(),
    igUserId: varchar("ig_user_id", { length: 40 }).notNull(), // professional account id (webhook entry.id)
    appScopedId: varchar("app_scoped_id", { length: 40 }),
    username: varchar("username", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }),
    profilePic: text("profile_pic"),
    accountType: varchar("account_type", { length: 20 }),
    accessTokenEnc: text("access_token_enc").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    followers: integer("followers"),
    follows: integer("follows"),
    mediaCount: integer("media_count"),
    status: varchar("status", { length: 16 }).notNull().default("active"), // active | expired | disconnected
    lastError: text("last_error"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    igAccUserUq: uniqueIndex("ig_accounts_ig_user_uq").on(t.igUserId),
    igAccOwnerIdx: index("ig_accounts_owner_idx").on(t.ownerId),
  })
);
export const igCommentRules = pgTable(
  "ig_comment_rules",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: varchar("account_id").notNull().references(() => igAccounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    mediaId: varchar("media_id", { length: 40 }), // null = any post / reel
    mediaThumb: text("media_thumb"),
    mediaCaption: text("media_caption"),
    keywords: jsonb("keywords").$type<string[]>().notNull().default([]), // empty = any comment
    matchMode: varchar("match_mode", { length: 10 }).notNull().default("contains"), // contains | exact
    publicReplies: jsonb("public_replies").$type<string[]>().notNull().default([]), // one picked at random
    dmText: text("dm_text").notNull(),
    dmButtonText: varchar("dm_button_text", { length: 20 }),
    dmButtonUrl: text("dm_button_url"),
    oncePerUser: boolean("once_per_user").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    triggered: integer("triggered").notNull().default(0),
    dmsSent: integer("dms_sent").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ igRulesAccIdx: index("ig_comment_rules_account_idx").on(t.accountId) })
);
export const igCommentEvents = pgTable(
  "ig_comment_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: varchar("account_id").notNull().references(() => igAccounts.id, { onDelete: "cascade" }),
    ruleId: varchar("rule_id"),
    commentId: varchar("comment_id", { length: 60 }).notNull(),
    mediaId: varchar("media_id", { length: 40 }),
    fromId: varchar("from_id", { length: 40 }),
    fromUsername: varchar("from_username", { length: 80 }),
    text: text("text"),
    action: varchar("action", { length: 16 }).notNull(), // dm_sent | skipped | failed | no_match
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    igEvCommentUq: uniqueIndex("ig_comment_events_comment_uq").on(t.commentId),
    igEvAccIdx: index("ig_comment_events_account_idx").on(t.accountId, t.createdAt),
    igEvRuleUserIdx: index("ig_comment_events_rule_user_idx").on(t.ruleId, t.fromId),
  })
);
export const igThreads = pgTable(
  "ig_threads",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: varchar("account_id").notNull().references(() => igAccounts.id, { onDelete: "cascade" }),
    igsid: varchar("igsid", { length: 40 }).notNull(), // the other person's Instagram-scoped id
    username: varchar("username", { length: 80 }),
    name: varchar("name", { length: 120 }),
    profilePic: text("profile_pic"),
    lastMessageText: text("last_message_text"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastIncomingAt: timestamp("last_incoming_at", { withTimezone: true }),
    unread: integer("unread").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    igThreadUq: uniqueIndex("ig_threads_acc_user_uq").on(t.accountId, t.igsid),
    igThreadLastIdx: index("ig_threads_last_idx").on(t.accountId, t.lastMessageAt),
  })
);
export const igMessages = pgTable(
  "ig_messages",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    threadId: varchar("thread_id").notNull().references(() => igThreads.id, { onDelete: "cascade" }),
    accountId: varchar("account_id").notNull(),
    mid: varchar("mid", { length: 200 }),
    direction: varchar("direction", { length: 8 }).notNull(), // in | out
    text: text("text"),
    attachments: jsonb("attachments"),
    source: varchar("source", { length: 16 }).notNull().default("inbox"), // inbox | automation | instagram_app
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    igMsgMidUq: uniqueIndex("ig_messages_mid_uq").on(t.mid),
    igMsgThreadIdx: index("ig_messages_thread_idx").on(t.threadId, t.createdAt),
  })
);
export type IgAccount = typeof igAccounts.$inferSelect;
export type IgCommentRule = typeof igCommentRules.$inferSelect;
export type IgThread = typeof igThreads.$inferSelect;

// ───────────────────────── Meta Ads (Facebook ad accounts) ─────────────────────────
export const adConnections = pgTable(
  "ad_connections",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerId: varchar("owner_id").notNull(),
    fbUserId: varchar("fb_user_id", { length: 40 }).notNull(),
    fbUserName: varchar("fb_user_name", { length: 120 }),
    accessTokenEnc: text("access_token_enc").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    adAccountId: varchar("ad_account_id", { length: 40 }), // act_123 chosen by the user
    adAccountName: varchar("ad_account_name", { length: 160 }),
    currency: varchar("currency", { length: 8 }),
    pageId: varchar("page_id", { length: 40 }),
    pageName: varchar("page_name", { length: 160 }),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ adConnOwnerUq: uniqueIndex("ad_connections_owner_uq").on(t.ownerId) })
);
export type AdConnection = typeof adConnections.$inferSelect;


// ───────────────────────── Canned messages (quick replies for the Team Inbox) ─────────────────────────
export const cannedMessages = pgTable(
  "canned_messages",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerId: varchar("owner_id").notNull(), // the client (tenant owner)
    createdBy: varchar("created_by").notNull(),
    title: varchar("title", { length: 80 }).notNull(),
    shortcut: varchar("shortcut", { length: 32 }).notNull(), // without the leading "/"
    category: varchar("category", { length: 40 }).notNull().default("General"),
    content: text("content").notNull(),
    shared: boolean("shared").notNull().default(true), // true = whole team, false = only the creator
    usageCount: integer("usage_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    cannedOwnerIdx: index("canned_messages_owner_idx").on(t.ownerId),
    cannedShortcutUq: uniqueIndex("canned_messages_shortcut_uq").on(t.ownerId, t.shortcut),
  })
);
export type CannedMessage = typeof cannedMessages.$inferSelect;

// Business hours away message: last time we auto-replied to a number (once per cooldown)
export const awayMessageLog = pgTable(
  "away_message_log",
  {
    channelId: varchar("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    phone: varchar("phone", { length: 24 }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ awayLogUq: uniqueIndex("away_message_log_uq").on(t.channelId, t.phone) })
);


// ───────────────────────── Facebook Pages + social content planner ─────────────────────────
export const fbPages = pgTable(
  "fb_pages",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerId: varchar("owner_id").notNull(),
    pageId: varchar("page_id", { length: 40 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    category: varchar("category", { length: 120 }),
    picture: text("picture"),
    followers: integer("followers"),
    accessTokenEnc: text("access_token_enc").notNull(), // page token (does not expire when issued from a long-lived user token)
    fbUserId: varchar("fb_user_id", { length: 40 }),
    status: varchar("status", { length: 16 }).notNull().default("active"), // active | expired
    lastError: text("last_error"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ fbPagesOwnerPageUq: uniqueIndex("fb_pages_owner_page_uq").on(t.ownerId, t.pageId) })
);
export type FbPage = typeof fbPages.$inferSelect;

export interface SocialMedia { url: string; kind: "image" | "video"; mime?: string; size?: number; width?: number; height?: number; duration?: number; thumbUrl?: string; name?: string }

export const socialPosts = pgTable(
  "social_posts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerId: varchar("owner_id").notNull(),
    createdBy: varchar("created_by").notNull(),
    mode: varchar("mode", { length: 12 }).notNull().default("instagram"), // instagram | facebook | both
    postType: varchar("post_type", { length: 12 }).notNull().default("image"), // image | carousel | video | reel | story | text
    media: jsonb("media").$type<SocialMedia[]>().notNull().default([]),
    igCaption: text("ig_caption"),
    igHashtags: text("ig_hashtags"),
    fbCaption: text("fb_caption"),
    fbHashtags: text("fb_hashtags"),
    fbLink: text("fb_link"),
    firstComment: text("first_comment"), // Instagram: posted as the first comment (good for hashtags)
    notes: text("notes"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }), // default time for all destinations
    status: varchar("status", { length: 12 }).notNull().default("draft"), // draft | scheduled | publishing | published | partial | failed
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ socialPostsOwnerIdx: index("social_posts_owner_idx").on(t.ownerId, t.scheduledAt) })
);

export const socialPostTargets = pgTable(
  "social_post_targets",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    postId: varchar("post_id").notNull().references(() => socialPosts.id, { onDelete: "cascade" }),
    ownerId: varchar("owner_id").notNull(),
    platform: varchar("platform", { length: 12 }).notNull(), // instagram | facebook
    accountId: varchar("account_id").notNull(), // ig_accounts.id | fb_pages.id
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    status: varchar("status", { length: 12 }).notNull().default("draft"), // draft | scheduled | publishing | published | failed | cancelled
    stage: jsonb("stage"), // in-progress publishing state (IG container ids…)
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    remoteId: varchar("remote_id", { length: 80 }),
    permalink: text("permalink"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    socialTargetsPostIdx: index("social_post_targets_post_idx").on(t.postId),
    socialTargetsDueIdx: index("social_post_targets_due_idx").on(t.status, t.scheduledAt),
    socialTargetsOwnerIdx: index("social_post_targets_owner_idx").on(t.ownerId, t.scheduledAt),
  })
);
export type SocialPost = typeof socialPosts.$inferSelect;
export type SocialPostTarget = typeof socialPostTargets.$inferSelect;


// ───────────────────────── Landing page leads ─────────────────────────
export const landingLeads = pgTable(
  "landing_leads",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    pageId: varchar("page_id").references(() => cmsPages.id, { onDelete: "set null" }),
    slug: varchar("slug", { length: 120 }),
    name: varchar("name", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 24 }).notNull(),
    email: varchar("email", { length: 160 }),
    company: varchar("company", { length: 160 }),
    city: varchar("city", { length: 80 }),
    service: varchar("service", { length: 120 }),
    message: text("message"),
    utm: jsonb("utm"),
    status: varchar("status", { length: 16 }).notNull().default("new"), // new | contacted | won | lost
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ landingLeadsPageIdx: index("landing_leads_page_idx").on(t.pageId, t.createdAt) })
);
export type LandingLead = typeof landingLeads.$inferSelect;
