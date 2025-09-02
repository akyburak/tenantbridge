import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { redirect } from 'next/navigation';

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/auth/signin');
  }
  return user;
}

export async function requireLandlordAdmin() {
  const user = await requireAuth();
  if (user.role !== 'landlord_admin') {
    redirect('/unauthorized');
  }
  return user;
}

export async function requireTenant() {
  const user = await requireAuth();
  if (user.role !== 'tenant') {
    redirect('/unauthorized');
  }
  return user;
}

export function hasRole(user: any, role: string): boolean {
  return user?.role === role;
}

export function isLandlordAdmin(user: any): boolean {
  return hasRole(user, 'landlord_admin');
}

export function isTenant(user: any): boolean {
  return hasRole(user, 'tenant');
}

export function canAccessOrganization(user: any, organizationId: string): boolean {
  return user?.organizationId === organizationId;
}