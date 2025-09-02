import { pgTable, text, timestamp, uuid, integer, boolean, numeric, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Organizations table - main tenant isolation
export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  contactEmail: text('contact_email').notNull(),
  contactPhone: text('contact_phone'),
  address: text('address'),
  city: text('city'),
  postalCode: text('postal_code'),
  country: text('country').default('Germany'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  slugIdx: index('org_slug_idx').on(table.slug),
}));

// Users table - with NextAuth.js compatibility
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  name: text('name'),
  image: text('image'),
  role: text('role', { enum: ['landlord_admin', 'tenant'] }).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  emailIdx: index('user_email_idx').on(table.email),
  orgIdx: index('user_org_idx').on(table.organizationId),
}));

// NextAuth.js required tables
export const accounts = pgTable('accounts', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  expiresAt: integer('expires_at'),
  tokenType: text('token_type'),
  scope: text('scope'),
  idToken: text('id_token'),
  sessionState: text('session_state'),
}, (table) => ({
  compoundKey: index('account_compound_idx').on(table.provider, table.providerAccountId),
}));

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').notNull().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
}, (table) => ({
  compoundKey: index('verification_compound_idx').on(table.identifier, table.token),
}));

// Buildings table
export const buildings = pgTable('buildings', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  postalCode: text('postal_code').notNull(),
  country: text('country').default('Germany'),
  totalUnits: integer('total_units').notNull(),
  yearBuilt: integer('year_built'),
  propertyType: text('property_type', { 
    enum: ['apartment', 'house', 'commercial', 'mixed'] 
  }).default('apartment'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('building_org_idx').on(table.organizationId),
}));

// Contracts table
export const contracts = pgTable('contracts', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  buildingId: uuid('building_id').references(() => buildings.id).notNull(),
  contractNumber: text('contract_number').notNull(),
  unitNumber: text('unit_number').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }),
  rentAmount: numeric('rent_amount', { precision: 10, scale: 2 }).notNull(),
  depositAmount: numeric('deposit_amount', { precision: 10, scale: 2 }),
  isActive: boolean('is_active').default(true),
  contractFileUrl: text('contract_file_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('contract_org_idx').on(table.organizationId),
  buildingIdx: index('contract_building_idx').on(table.buildingId),
  contractNumberIdx: index('contract_number_idx').on(table.contractNumber),
}));

// Tenant-Contract junction table (multiple tenants per contract)
export const tenantContracts = pgTable('tenant_contracts', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  tenantId: uuid('tenant_id').references(() => users.id).notNull(),
  contractId: uuid('contract_id').references(() => contracts.id).notNull(),
  percentage: numeric('percentage', { precision: 5, scale: 2 }).default('100.00'), // For shared units
  isMainTenant: boolean('is_main_tenant').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('tenant_contract_org_idx').on(table.organizationId),
  tenantIdx: index('tenant_contract_tenant_idx').on(table.tenantId),
  contractIdx: index('tenant_contract_contract_idx').on(table.contractId),
}));

// Tickets table for maintenance/support requests
export const tickets = pgTable('tickets', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  buildingId: uuid('building_id').references(() => buildings.id).notNull(),
  contractId: uuid('contract_id').references(() => contracts.id),
  createdById: uuid('created_by_id').references(() => users.id).notNull(),
  assignedToId: uuid('assigned_to_id').references(() => users.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority', { enum: ['low', 'medium', 'high', 'urgent'] }).default('medium'),
  status: text('status', { 
    enum: ['open', 'in_progress', 'waiting_for_tenant', 'resolved', 'closed'] 
  }).default('open'),
  category: text('category', { 
    enum: ['maintenance', 'repair', 'cleaning', 'utilities', 'security', 'other'] 
  }).default('maintenance'),
  estimatedCost: numeric('estimated_cost', { precision: 10, scale: 2 }),
  actualCost: numeric('actual_cost', { precision: 10, scale: 2 }),
  dueDate: timestamp('due_date', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('ticket_org_idx').on(table.organizationId),
  buildingIdx: index('ticket_building_idx').on(table.buildingId),
  statusIdx: index('ticket_status_idx').on(table.status),
  createdByIdx: index('ticket_created_by_idx').on(table.createdById),
}));

// Consumption tracking (utilities, etc.)
export const consumptionRecords = pgTable('consumption_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  contractId: uuid('contract_id').references(() => contracts.id).notNull(),
  consumptionType: text('consumption_type', { 
    enum: ['electricity', 'gas', 'water', 'heating', 'internet', 'other'] 
  }).notNull(),
  period: text('period').notNull(), // Format: YYYY-MM
  reading: numeric('reading', { precision: 12, scale: 3 }).notNull(),
  unit: text('unit').notNull(), // kWh, m³, etc.
  cost: numeric('cost', { precision: 10, scale: 2 }),
  meterNumber: text('meter_number'),
  readingDate: timestamp('reading_date', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('consumption_org_idx').on(table.organizationId),
  contractIdx: index('consumption_contract_idx').on(table.contractId),
  periodIdx: index('consumption_period_idx').on(table.period),
}));

// Documents table
export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  buildingId: uuid('building_id').references(() => buildings.id),
  contractId: uuid('contract_id').references(() => contracts.id),
  ticketId: uuid('ticket_id').references(() => tickets.id),
  uploadedById: uuid('uploaded_by_id').references(() => users.id).notNull(),
  fileName: text('file_name').notNull(),
  originalFileName: text('original_file_name').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  fileUrl: text('file_url').notNull(),
  category: text('category', { 
    enum: ['contract', 'invoice', 'receipt', 'photo', 'document', 'other'] 
  }).default('document'),
  description: text('description'),
  isPublic: boolean('is_public').default(false), // Visible to tenants
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('document_org_idx').on(table.organizationId),
  buildingIdx: index('document_building_idx').on(table.buildingId),
  contractIdx: index('document_contract_idx').on(table.contractId),
}));

// Invitation tokens for tenant onboarding
export const invitationTokens = pgTable('invitation_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  contractId: uuid('contract_id').references(() => contracts.id).notNull(),
  token: text('token').notNull().unique(),
  email: text('email').notNull(),
  tenantName: text('tenant_name'),
  percentage: numeric('percentage', { precision: 5, scale: 2 }).default('100.00'),
  isMainTenant: boolean('is_main_tenant').default(false),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdById: uuid('created_by_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  tokenIdx: index('invitation_token_idx').on(table.token),
  orgIdx: index('invitation_org_idx').on(table.organizationId),
}));

// Relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  buildings: many(buildings),
  contracts: many(contracts),
  tickets: many(tickets),
  documents: many(documents),
  invitationTokens: many(invitationTokens),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  accounts: many(accounts),
  sessions: many(sessions),
  createdTickets: many(tickets, { relationName: 'createdTickets' }),
  assignedTickets: many(tickets, { relationName: 'assignedTickets' }),
  tenantContracts: many(tenantContracts),
  uploadedDocuments: many(documents),
}));

export const buildingsRelations = relations(buildings, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [buildings.organizationId],
    references: [organizations.id],
  }),
  contracts: many(contracts),
  tickets: many(tickets),
  documents: many(documents),
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [contracts.organizationId],
    references: [organizations.id],
  }),
  building: one(buildings, {
    fields: [contracts.buildingId],
    references: [buildings.id],
  }),
  tenantContracts: many(tenantContracts),
  tickets: many(tickets),
  consumptionRecords: many(consumptionRecords),
  documents: many(documents),
  invitationTokens: many(invitationTokens),
}));

export const tenantContractsRelations = relations(tenantContracts, ({ one }) => ({
  organization: one(organizations, {
    fields: [tenantContracts.organizationId],
    references: [organizations.id],
  }),
  tenant: one(users, {
    fields: [tenantContracts.tenantId],
    references: [users.id],
  }),
  contract: one(contracts, {
    fields: [tenantContracts.contractId],
    references: [contracts.id],
  }),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tickets.organizationId],
    references: [organizations.id],
  }),
  building: one(buildings, {
    fields: [tickets.buildingId],
    references: [buildings.id],
  }),
  contract: one(contracts, {
    fields: [tickets.contractId],
    references: [contracts.id],
  }),
  createdBy: one(users, {
    fields: [tickets.createdById],
    references: [users.id],
    relationName: 'createdTickets',
  }),
  assignedTo: one(users, {
    fields: [tickets.assignedToId],
    references: [users.id],
    relationName: 'assignedTickets',
  }),
  documents: many(documents),
}));

export const consumptionRecordsRelations = relations(consumptionRecords, ({ one }) => ({
  organization: one(organizations, {
    fields: [consumptionRecords.organizationId],
    references: [organizations.id],
  }),
  contract: one(contracts, {
    fields: [consumptionRecords.contractId],
    references: [contracts.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  organization: one(organizations, {
    fields: [documents.organizationId],
    references: [organizations.id],
  }),
  building: one(buildings, {
    fields: [documents.buildingId],
    references: [buildings.id],
  }),
  contract: one(contracts, {
    fields: [documents.contractId],
    references: [contracts.id],
  }),
  ticket: one(tickets, {
    fields: [documents.ticketId],
    references: [tickets.id],
  }),
  uploadedBy: one(users, {
    fields: [documents.uploadedById],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const invitationTokensRelations = relations(invitationTokens, ({ one }) => ({
  organization: one(organizations, {
    fields: [invitationTokens.organizationId],
    references: [organizations.id],
  }),
  contract: one(contracts, {
    fields: [invitationTokens.contractId],
    references: [contracts.id],
  }),
  createdBy: one(users, {
    fields: [invitationTokens.createdById],
    references: [users.id],
  }),
}));

// Export all tables for Drizzle
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Building = typeof buildings.$inferSelect;
export type NewBuilding = typeof buildings.$inferInsert;
export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;
export type TenantContract = typeof tenantContracts.$inferSelect;
export type NewTenantContract = typeof tenantContracts.$inferInsert;
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type ConsumptionRecord = typeof consumptionRecords.$inferSelect;
export type NewConsumptionRecord = typeof consumptionRecords.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type InvitationToken = typeof invitationTokens.$inferSelect;
export type NewInvitationToken = typeof invitationTokens.$inferInsert;