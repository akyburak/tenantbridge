import { randomBytes } from 'crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db } from './db';
import { invitationTokens, contracts, buildings } from './db/schema';
import QRCode from 'qrcode';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

export function generateSecureToken(): string {
  return randomBytes(32).toString('hex');
}

export async function createInvitationToken({
  organizationId,
  contractId,
  email,
  tenantName,
  percentage = '100.00',
  isMainTenant = false,
  expiresInDays = 7,
  createdById,
}: {
  organizationId: string;
  contractId: string;
  email: string;
  tenantName?: string;
  percentage?: string;
  isMainTenant?: boolean;
  expiresInDays?: number;
  createdById: string;
}) {
  const token = generateSecureToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const [invitationToken] = await db
    .insert(invitationTokens)
    .values({
      organizationId,
      contractId,
      token,
      email,
      tenantName,
      percentage,
      isMainTenant,
      expiresAt,
      createdById,
    })
    .returning();

  return invitationToken;
}

export async function validateInvitationToken(token: string) {
  const [invitation] = await db
    .select({
      invitation: invitationTokens,
      contract: contracts,
      building: buildings,
    })
    .from(invitationTokens)
    .leftJoin(contracts, eq(invitationTokens.contractId, contracts.id))
    .leftJoin(buildings, eq(contracts.buildingId, buildings.id))
    .where(
      and(
        eq(invitationTokens.token, token),
        gt(invitationTokens.expiresAt, new Date()),
        eq(invitationTokens.usedAt, null)
      )
    )
    .limit(1);

  return invitation;
}

export async function markInvitationAsUsed(token: string) {
  await db
    .update(invitationTokens)
    .set({ usedAt: new Date() })
    .where(eq(invitationTokens.token, token));
}

export function getInvitationUrl(token: string): string {
  return `${APP_URL}/invite/${token}`;
}

export async function generateInvitationQR(token: string): Promise<string> {
  const url = getInvitationUrl(token);
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: {
        dark: '#1f2937', // gray-800
        light: '#ffffff',
      },
    });
    return qrCodeDataUrl;
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    throw new Error('Failed to generate QR code');
  }
}

export interface InvitationInfo {
  token: string;
  url: string;
  qrCode: string;
  email: string;
  tenantName?: string;
  contractId: string;
  buildingName?: string;
  unitNumber?: string;
  expiresAt: Date;
}

export async function createCompleteInvitation(params: {
  organizationId: string;
  contractId: string;
  email: string;
  tenantName?: string;
  percentage?: string;
  isMainTenant?: boolean;
  expiresInDays?: number;
  createdById: string;
}): Promise<InvitationInfo> {
  const invitation = await createInvitationToken(params);
  const url = getInvitationUrl(invitation.token);
  const qrCode = await generateInvitationQR(invitation.token);

  // Get contract and building details
  const [contractDetails] = await db
    .select({
      unitNumber: contracts.unitNumber,
      buildingName: buildings.name,
    })
    .from(contracts)
    .leftJoin(buildings, eq(contracts.buildingId, buildings.id))
    .where(eq(contracts.id, params.contractId))
    .limit(1);

  return {
    token: invitation.token,
    url,
    qrCode,
    email: invitation.email,
    tenantName: invitation.tenantName || undefined,
    contractId: invitation.contractId,
    buildingName: contractDetails?.buildingName,
    unitNumber: contractDetails?.unitNumber,
    expiresAt: invitation.expiresAt,
  };
}