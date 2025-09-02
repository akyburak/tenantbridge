// src/lib/env.ts
import { z } from 'zod';

// Environment variable schema for validation
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url('Invalid database URL'),
  
  // NextAuth
  NEXTAUTH_SECRET: z.string().min(1, 'NextAuth secret is required'),
  NEXTAUTH_URL: z.string().url('Invalid NextAuth URL'),
  
  // Application
  APP_URL: z.string().url('Invalid app URL'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Vercel Blob Storage
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  
  // Email (Optional)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  
  // Feature Flags
  ENABLE_EMAIL_NOTIFICATIONS: z.string().transform(val => val === 'true').default('false'),
  ENABLE_FILE_UPLOADS: z.string().transform(val => val === 'true').default('true'),
  ENABLE_QR_CODES: z.string().transform(val => val === 'true').default('true'),
  
  // Security
  JWT_SECRET: z.string().optional(),
  
  // Multi-tenancy
  DEFAULT_ORGANIZATION_SLUG: z.string().default('demo-org'),
  ALLOW_REGISTRATION: z.string().transform(val => val === 'true').default('false'),
});

// Validate and export environment variables
export const env = envSchema.parse(process.env);

// Helper function to check if we're in production
export const isProduction = env.NODE_ENV === 'production';

// Helper function to check if we're in development
export const isDevelopment = env.NODE_ENV === 'development';

// Helper to get app URL with proper fallback
export const getAppUrl = () => {
  if (env.APP_URL) return env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
};

// Validate environment on module load
if (typeof window === 'undefined') {
  try {
    envSchema.parse(process.env);
  } catch (error) {
    console.error('❌ Invalid environment variables:', error);
    throw new Error('Environment validation failed');
  }
}