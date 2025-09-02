// src/lib/db/migrate.ts
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { db } from './db';
import { organizations, users, buildings, contracts } from './schema';
import bcrypt from 'bcryptjs';

export async function runMigrations() {
  try {
    console.log('Running migrations...');
    await migrate(db, { migrationsFolder: 'drizzle' });
    console.log('Migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

export async function seedDatabase() {
  try {
    console.log('Starting database seeding...');

    // Create demo organization
    const [demoOrg] = await db.insert(organizations).values({
      name: 'Demo Property Management',
      slug: 'demo-org',
      contactEmail: 'admin@demoproperties.com',
      contactPhone: '+49 30 12345678',
      address: 'Musterstraße 123',
      city: 'Berlin',
      postalCode: '10115',
      country: 'Germany',
    }).returning();

    console.log('Created demo organization:', demoOrg.id);

    // Create demo landlord admin
    const [adminUser] = await db.insert(users).values({
      email: 'admin@demoproperties.com',
      name: 'Property Manager',
      role: 'landlord_admin',
      organizationId: demoOrg.id,
      isActive: true,
      emailVerified: new Date(),
    }).returning();

    console.log('Created admin user:', adminUser.id);

    // Create demo tenant
    const [tenantUser] = await db.insert(users).values({
      email: 'tenant@example.com',
      name: 'John Tenant',
      role: 'tenant',
      organizationId: demoOrg.id,
      isActive: true,
      emailVerified: new Date(),
    }).returning();

    console.log('Created tenant user:', tenantUser.id);

    // Create demo building
    const [demoBuilding] = await db.insert(buildings).values({
      organizationId: demoOrg.id,
      name: 'Sunset Apartments',
      address: 'Sonnenstraße 45',
      city: 'Berlin',
      postalCode: '10119',
      country: 'Germany',
      totalUnits: 24,
      yearBuilt: 1995,
      propertyType: 'apartment',
    }).returning();

    console.log('Created demo building:', demoBuilding.id);

    // Create demo contract
    const [demoContract] = await db.insert(contracts).values({
      organizationId: demoOrg.id,
      buildingId: demoBuilding.id,
      contractNumber: 'DEMO-2024-001',
      unitNumber: 'A-101',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2025-12-31'),
      rentAmount: '1200.00',
      depositAmount: '2400.00',
      isActive: true,
    }).returning();

    console.log('Created demo contract:', demoContract.id);

    console.log('Database seeding completed successfully!');
    
    return {
      organization: demoOrg,
      adminUser,
      tenantUser,
      building: demoBuilding,
      contract: demoContract,
    };

  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  }
}

// Helper function to run both migration and seeding
export async function setupDatabase() {
  await runMigrations();
  await seedDatabase();
}

// CLI script to run setup
if (require.main === module) {
  setupDatabase()
    .then(() => {
      console.log('Database setup completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database setup failed:', error);
      process.exit(1);
    });
}