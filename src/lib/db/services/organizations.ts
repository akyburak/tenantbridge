// src/lib/db/services/organizations.ts
import { eq, like, count } from 'drizzle-orm';
import { db } from '../db';
import { organizations, users, buildings, contracts, type Organization, type NewOrganization } from '../schema';

export class OrganizationService {
  /**
   * Create a new organization
   */
  static async create(data: Omit<NewOrganization, 'id' | 'createdAt' | 'updatedAt'>): Promise<Organization> {
    const [organization] = await db
      .insert(organizations)
      .values(data)
      .returning();

    return organization;
  }

  /**
   * Get organization by ID
   */
  static async getById(id: string): Promise<Organization | null> {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);

    return organization || null;
  }

  /**
   * Get organization by slug
   */
  static async getBySlug(slug: string): Promise<Organization | null> {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    return organization || null;
  }

  /**
   * Update organization
   */
  static async update(
    id: string, 
    data: Partial<Omit<Organization, 'id' | 'createdAt'>>
  ): Promise<Organization | null> {
    const [organization] = await db
      .update(organizations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();

    return organization || null;
  }

  /**
   * Delete organization (soft delete by deactivating all users)
   */
  static async delete(id: string): Promise<boolean> {
    try {
      // Deactivate all users in the organization instead of hard delete
      await db
        .update(users)
        .set({ isActive: false })
        .where(eq(users.organizationId, id));

      return true;
    } catch (error) {
      console.error('Failed to delete organization:', error);
      return false;
    }
  }

  /**
   * Get organization with stats
   */
  static async getWithStats(id: string) {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);

    if (!organization) return null;

    // Get counts for dashboard
    const [stats] = await db
      .select({
        userCount: count(users.id),
        buildingCount: count(buildings.id),
        contractCount: count(contracts.id),
      })
      .from(organizations)
      .leftJoin(users, eq(organizations.id, users.organizationId))
      .leftJoin(buildings, eq(organizations.id, buildings.organizationId))
      .leftJoin(contracts, eq(organizations.id, contracts.organizationId))
      .where(eq(organizations.id, id));

    return {
      ...organization,
      stats: {
        userCount: Number(stats?.userCount || 0),
        buildingCount: Number(stats?.buildingCount || 0),
        contractCount: Number(stats?.contractCount || 0),
      },
    };
  }

  /**
   * Search organizations by name (admin feature)
   */
  static async search(searchTerm: string, limit = 10) {
    return await db
      .select()
      .from(organizations)
      .where(like(organizations.name, `%${searchTerm}%`))
      .limit(limit);
  }

  /**
   * Check if organization slug is available
   */
  static async isSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
    const query = db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug));

    if (excludeId) {
      query.where(eq(organizations.id, excludeId));
    }

    const [existing] = await query.limit(1);
    return !existing;
  }

  /**
   * Generate unique slug from organization name
   */
  static async generateSlug(name: string): Promise<string> {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    let slug = baseSlug;
    let counter = 1;

    while (!(await this.isSlugAvailable(slug))) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }
}