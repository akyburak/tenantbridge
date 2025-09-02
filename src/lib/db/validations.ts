// src/lib/db/validations.ts
import { z } from 'zod';

// Organization validation schemas
export const createOrganizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(100),
  slug: z.string().min(1, 'Slug is required').max(50).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  contactEmail: z.string().email('Invalid email address'),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().default('Germany'),
});

export const updateOrganizationSchema = createOrganizationSchema.partial();

// User validation schemas
export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required').max(100),
  role: z.enum(['landlord_admin', 'tenant']),
  organizationId: z.string().uuid('Invalid organization ID'),
  image: z.string().url().optional(),
});

export const updateUserSchema = createUserSchema.partial().omit({ organizationId: true });

// Building validation schemas
export const createBuildingSchema = z.object({
  name: z.string().min(1, 'Building name is required').max(100),
  address: z.string().min(1, 'Address is required').max(200),
  city: z.string().min(1, 'City is required').max(100),
  postalCode: z.string().min(1, 'Postal code is required').max(20),
  country: z.string().default('Germany'),
  totalUnits: z.number().int().min(1, 'Total units must be at least 1').max(1000),
  yearBuilt: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  propertyType: z.enum(['apartment', 'house', 'commercial', 'mixed']).default('apartment'),
  organizationId: z.string().uuid('Invalid organization ID'),
});

export const updateBuildingSchema = createBuildingSchema.partial().omit({ organizationId: true });

// Contract validation schemas
export const createContractSchema = z.object({
  organizationId: z.string().uuid('Invalid organization ID'),
  buildingId: z.string().uuid('Invalid building ID'),
  contractNumber: z.string().min(1, 'Contract number is required').max(50),
  unitNumber: z.string().min(1, 'Unit number is required').max(20),
  startDate: z.date(),
  endDate: z.date().optional(),
  rentAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid rent amount'),
  depositAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid deposit amount').optional(),
  contractFileUrl: z.string().url().optional(),
}).refine((data) => {
  if (data.endDate && data.startDate > data.endDate) {
    return false;
  }
  return true;
}, {
  message: 'End date must be after start date',
  path: ['endDate'],
});

export const updateContractSchema = createContractSchema.partial().omit({ organizationId: true });

// Tenant Contract validation schemas
export const createTenantContractSchema = z.object({
  tenantId: z.string().uuid('Invalid tenant ID'),
  contractId: z.string().uuid('Invalid contract ID'),
  organizationId: z.string().uuid('Invalid organization ID'),
  percentage: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'Invalid percentage').default('100.00'),
  isMainTenant: z.boolean().default(false),
}).refine((data) => {
  const percentage = parseFloat(data.percentage);
  return percentage > 0 && percentage <= 100;
}, {
  message: 'Percentage must be between 0.01 and 100.00',
  path: ['percentage'],
});

// Ticket validation schemas
export const createTicketSchema = z.object({
  organizationId: z.string().uuid('Invalid organization ID'),
  buildingId: z.string().uuid('Invalid building ID'),
  contractId: z.string().uuid('Invalid contract ID').optional(),
  createdById: z.string().uuid('Invalid user ID'),
  assignedToId: z.string().uuid('Invalid user ID').optional(),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(2000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  status: z.enum(['open', 'in_progress', 'waiting_for_tenant', 'resolved', 'closed']).default('open'),
  category: z.enum(['maintenance', 'repair', 'cleaning', 'utilities', 'security', 'other']).default('maintenance'),
  estimatedCost: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid estimated cost').optional(),
  actualCost: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid actual cost').optional(),
  dueDate: z.date().optional(),
});

export const updateTicketSchema = createTicketSchema.partial().omit({ organizationId: true, createdById: true });

// Consumption Record validation schemas
export const createConsumptionRecordSchema = z.object({
  organizationId: z.string().uuid('Invalid organization ID'),
  contractId: z.string().uuid('Invalid contract ID'),
  consumptionType: z.enum(['electricity', 'gas', 'water', 'heating', 'internet', 'other']),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format'),
  reading: z.string().regex(/^\d+(\.\d{1,3})?$/, 'Invalid reading value'),
  unit: z.string().min(1, 'Unit is required').max(20),
  cost: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid cost').optional(),
  meterNumber: z.string().max(50).optional(),
  readingDate: z.date(),
}).refine((data) => {
  // Validate period is not in the future
  const [year, month] = data.period.split('-').map(Number);
  const periodDate = new Date(year, month - 1);
  const now = new Date();
  now.setDate(1); // Set to first day of current month
  
  return periodDate <= now;
}, {
  message: 'Period cannot be in the future',
  path: ['period'],
});

export const updateConsumptionRecordSchema = createConsumptionRecordSchema.partial().omit({ organizationId: true });

export const bulkConsumptionRecordSchema = z.array(createConsumptionRecordSchema).min(1, 'At least one record is required').max(1000, 'Maximum 1000 records allowed');

// Document validation schemas
export const createDocumentSchema = z.object({
  organizationId: z.string().uuid('Invalid organization ID'),
  buildingId: z.string().uuid('Invalid building ID').optional(),
  contractId: z.string().uuid('Invalid contract ID').optional(),
  ticketId: z.string().uuid('Invalid ticket ID').optional(),
  uploadedById: z.string().uuid('Invalid user ID'),
  fileName: z.string().min(1, 'File name is required').max(255),
  originalFileName: z.string().min(1, 'Original file name is required').max(255),
  fileSize: z.number().int().min(1, 'File size must be positive').max(50 * 1024 * 1024), // 50MB max
  mimeType: z.string().min(1, 'MIME type is required'),
  fileUrl: z.string().url('Invalid file URL'),
  category: z.enum(['contract', 'invoice', 'receipt', 'photo', 'document', 'other']).default('document'),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().default(false),
});

export const updateDocumentSchema = createDocumentSchema.partial().omit({ organizationId: true, uploadedById: true });

// Invitation Token validation schemas
export const createInvitationSchema = z.object({
  organizationId: z.string().uuid('Invalid organization ID'),
  contractId: z.string().uuid('Invalid contract ID'),
  email: z.string().email('Invalid email address'),
  tenantName: z.string().max(100).optional(),
  percentage: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'Invalid percentage').default('100.00'),
  isMainTenant: z.boolean().default(false),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  createdById: z.string().uuid('Invalid user ID'),
}).refine((data) => {
  const percentage = parseFloat(data.percentage);
  return percentage > 0 && percentage <= 100;
}, {
  message: 'Percentage must be between 0.01 and 100.00',
  path: ['percentage'],
});

// File upload validation
export const fileUploadSchema = z.object({
  file: z.object({
    name: z.string().min(1, 'File name is required'),
    size: z.number().max(50 * 1024 * 1024, 'File size cannot exceed 50MB'),
    type: z.string().min(1, 'File type is required'),
  }),
  category: z.enum(['contract', 'invoice', 'receipt', 'photo', 'document', 'other']).default('document'),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().default(false),
  buildingId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional(),
});

// Search and pagination schemas
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(100),
  ...paginationSchema.shape,
});

// Dashboard filters
export const ticketFiltersSchema = z.object({
  status: z.enum(['open', 'in_progress', 'waiting_for_tenant', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  category: z.enum(['maintenance', 'repair', 'cleaning', 'utilities', 'security', 'other']).optional(),
  buildingId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  createdById: z.string().uuid().optional(),
  ...paginationSchema.shape,
});

export const consumptionFiltersSchema = z.object({
  consumptionType: z.enum(['electricity', 'gas', 'water', 'heating', 'internet', 'other']).optional(),
  contractId: z.string().uuid().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  startPeriod: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  endPeriod: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  ...paginationSchema.shape,
}).refine((data) => {
  if (data.startPeriod && data.endPeriod) {
    return data.startPeriod <= data.endPeriod;
  }
  return true;
}, {
  message: 'Start period must be before or equal to end period',
  path: ['endPeriod'],
});

export const documentFiltersSchema = z.object({
  category: z.enum(['contract', 'invoice', 'receipt', 'photo', 'document', 'other']).optional(),
  buildingId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional(),
  isPublic: z.boolean().optional(),
  uploadedById: z.string().uuid().optional(),
  ...paginationSchema.shape,
});

// Utility functions for validation
export const validatePaginationParams = (params: any) => {
  const result = paginationSchema.safeParse(params);
  if (!result.success) {
    throw new Error(`Invalid pagination parameters: ${result.error.message}`);
  }
  return result.data;
};

export const validateSearchParams = (params: any) => {
  const result = searchSchema.safeParse(params);
  if (!result.success) {
    throw new Error(`Invalid search parameters: ${result.error.message}`);
  }
  return result.data;
};

// Validation helper for checking UUID format
export const uuidSchema = z.string().uuid('Invalid UUID format');

// Validation helper for checking date ranges
export const dateRangeSchema = z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
}).refine((data) => {
  if (data.startDate && data.endDate) {
    return data.startDate <= data.endDate;
  }
  return true;
}, {
  message: 'Start date must be before or equal to end date',
  path: ['endDate'],
});

// API response schemas for type safety
export const apiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  message: z.string().optional(),
  errors: z.array(z.string()).optional(),
});

export type ApiResponse<T = any> = z.infer<typeof apiResponseSchema> & {
  data?: T;
};

// Helper function to create consistent API responses
export const createApiResponse = <T>(
  success: boolean,
  data?: T,
  message?: string,
  errors?: string[]
): ApiResponse<T> => ({
  success,
  data,
  message,
  errors,
});

// Validation middleware helper
export const validateRequestBody = <T>(schema: z.ZodSchema<T>) => {
  return (data: unknown): T => {
    const result = schema.safeParse(data);
    if (!result.success) {
      const errorMessages = result.error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      );
      throw new Error(`Validation failed: ${errorMessages.join(', ')}`);
    }
    return result.data;
  };
};