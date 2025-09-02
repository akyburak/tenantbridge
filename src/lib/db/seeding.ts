// src/lib/db/seeding.ts
import { db } from './db';
import { 
  organizations, 
  users, 
  buildings, 
  contracts, 
  tenantContracts,
  tickets,
  consumptionRecords,
  documents
} from './schema';
import { env } from '../env';

/**
 * Seed production-ready demo data
 */
export async function seedProductionDemo() {
  console.log('🌱 Seeding production demo data...');

  // Create main organization
  const [mainOrg] = await db.insert(organizations).values({
    name: 'Berlin Properties GmbH',
    slug: 'berlin-properties',
    contactEmail: 'info@berlinproperties.de',
    contactPhone: '+49 30 555 0123',
    address: 'Alexanderplatz 1',
    city: 'Berlin',
    postalCode: '10178',
    country: 'Germany',
  }).returning();

  // Create admin user
  const [admin] = await db.insert(users).values({
    email: 'admin@berlinproperties.de',
    name: 'Property Administrator',
    role: 'landlord_admin',
    organizationId: mainOrg.id,
    isActive: true,
    emailVerified: new Date(),
  }).returning();

  // Create multiple buildings
  const buildingsData = [
    {
      name: 'Mitte Residenz',
      address: 'Unter den Linden 15',
      city: 'Berlin',
      postalCode: '10117',
      totalUnits: 20,
      yearBuilt: 2010,
      propertyType: 'apartment' as const,
    },
    {
      name: 'Kreuzberg Lofts',
      address: 'Oranienstraße 32',
      city: 'Berlin',
      postalCode: '10999',
      totalUnits: 15,
      yearBuilt: 2005,
      propertyType: 'apartment' as const,
    },
    {
      name: 'Prenzlauer Heights',
      address: 'Kastanienallee 88',
      city: 'Berlin',
      postalCode: '10435',
      totalUnits: 12,
      yearBuilt: 2018,
      propertyType: 'apartment' as const,
    },
  ];

  const createdBuildings = [];
  for (const buildingData of buildingsData) {
    const [building] = await db.insert(buildings).values({
      ...buildingData,
      organizationId: mainOrg.id,
    }).returning();
    createdBuildings.push(building);
  }

  // Create contracts and tenants
  const tenantEmails = [
    'maria.schmidt@email.de',
    'thomas.mueller@email.de',
    'anna.weber@email.de',
    'michael.fischer@email.de',
    'sarah.wagner@email.de',
    'david.becker@email.de',
  ];

  const createdContracts = [];
  const createdTenants = [];

  for (let i = 0; i < tenantEmails.length; i++) {
    const building = createdBuildings[i % createdBuildings.length];
    const unitNumber = `${String.fromCharCode(65 + Math.floor(i / 10))}-${(i % 10 + 1).toString().padStart(3, '0')}`;
    
    // Create tenant
    const [tenant] = await db.insert(users).values({
      email: tenantEmails[i],
      name: tenantEmails[i].split('@')[0].replace('.', ' ').split(' ')
        .map(name => name.charAt(0).toUpperCase() + name.slice(1)).join(' '),
      role: 'tenant',
      organizationId: mainOrg.id,
      isActive: true,
      emailVerified: new Date(),
    }).returning();

    createdTenants.push(tenant);

    // Create contract
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - Math.floor(Math.random() * 12));
    
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1);

    const [contract] = await db.insert(contracts).values({
      organizationId: mainOrg.id,
      buildingId: building.id,
      contractNumber: `BP-${new Date().getFullYear()}-${(i + 1).toString().padStart(3, '0')}`,
      unitNumber,
      startDate,
      endDate,
      rentAmount: (800 + Math.floor(Math.random() * 800)).toString(), // 800-1600€
      depositAmount: (1600 + Math.floor(Math.random() * 1600)).toString(),
      isActive: true,
    }).returning();

    createdContracts.push(contract);

    // Create tenant-contract relationship
    await db.insert(tenantContracts).values({
      organizationId: mainOrg.id,
      tenantId: tenant.id,
      contractId: contract.id,
      percentage: '100.00',
      isMainTenant: true,
    });
  }

  console.log(`✅ Created ${createdBuildings.length} buildings, ${createdContracts.length} contracts, ${createdTenants.length} tenants`);

  return {
    organization: mainOrg,
    admin,
    buildings: createdBuildings,
    contracts: createdContracts,
    tenants: createdTenants,
  };
}

/**
 * Seed sample tickets and consumption data
 */
export async function seedSampleData(organizationId: string) {
  console.log('🎯 Seeding sample operational data...');

  // Get all contracts for this organization
  const allContracts = await db
    .select({
      contract: contracts,
      building: buildings,
      tenant: users,
    })
    .from(contracts)
    .leftJoin(buildings, eq(contracts.buildingId, buildings.id))
    .leftJoin(tenantContracts, eq(contracts.id, tenantContracts.contractId))
    .leftJoin(users, eq(tenantContracts.tenantId, users.id))
    .where(eq(contracts.organizationId, organizationId));

  // Create sample tickets
  const ticketCategories = ['maintenance', 'repair', 'cleaning', 'utilities', 'security'];
  const ticketPriorities = ['low', 'medium', 'high', 'urgent'];
  const ticketStatuses = ['open', 'in_progress', 'resolved', 'closed'];

  const sampleTickets = [];
  for (let i = 0; i < Math.min(20, allContracts.length * 3); i++) {
    const contractData = allContracts[i % allContracts.length];
    if (!contractData.contract || !contractData.building || !contractData.tenant) continue;

    const createdDate = new Date();
    createdDate.setDate(createdDate.getDate() - Math.floor(Math.random() * 90)); // Last 90 days

    const [ticket] = await db.insert(tickets).values({
      organizationId,
      buildingId: contractData.building.id,
      contractId: contractData.contract.id,
      createdById: contractData.tenant.id,
      title: `${ticketCategories[Math.floor(Math.random() * ticketCategories.length)]} Issue ${i + 1}`,
      description: `Sample ticket description for testing purposes. This is ticket #${i + 1}.`,
      priority: ticketPriorities[Math.floor(Math.random() * ticketPriorities.length)],
      status: ticketStatuses[Math.floor(Math.random() * ticketStatuses.length)],
      category: ticketCategories[Math.floor(Math.random() * ticketCategories.length)],
      estimatedCost: Math.random() > 0.7 ? (Math.floor(Math.random() * 500) + 50).toString() : undefined,
      createdAt: createdDate,
      updatedAt: createdDate,
    }).returning();

    sampleTickets.push(ticket);
  }

  // Create sample consumption data
  const consumptionTypes = ['electricity', 'gas', 'water', 'heating'];
  const units = {
    electricity: 'kWh',
    gas: 'm³',
    water: 'm³',
    heating: 'kWh',
  };

  const sampleConsumption = [];
  for (const contractData of allContracts) {
    if (!contractData.contract) continue;

    // Create 6 months of data
    for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
      const date = new Date();
      date.setMonth(date.getMonth() - monthOffset);
      const period = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

      for (const type of consumptionTypes) {
        const baseReading = {
          electricity: 150 + Math.floor(Math.random() * 100),
          gas: 80 + Math.floor(Math.random() * 40),
          water: 15 + Math.floor(Math.random() * 10),
          heating: 200 + Math.floor(Math.random() * 150),
        }[type];

        const reading = (baseReading + Math.floor(Math.random() * 50)).toString();
        const costPerUnit = {
          electricity: 0.30,
          gas: 0.08,
          water: 2.50,
          heating: 0.12,
        }[type];

        const cost = (parseFloat(reading) * costPerUnit).toFixed(2);

        const [record] = await db.insert(consumptionRecords).values({
          organizationId,
          contractId: contractData.contract.id,
          consumptionType: type as any,
          period,
          reading,
          unit: units[type as keyof typeof units],
          cost,
          meterNumber: `M${type.toUpperCase()}-${Math.floor(Math.random() * 10000)}`,
          readingDate: new Date(date.getFullYear(), date.getMonth(), 1),
        }).returning();

        sampleConsumption.push(record);
      }
    }
  }

  console.log(`✅ Created ${sampleTickets.length} tickets and ${sampleConsumption.length} consumption records`);

  return {
    tickets: sampleTickets,
    consumptionRecords: sampleConsumption,
  };
}

/**
 * Clean slate reset for development
 */
export async function resetDatabase() {
  if (env.NODE_ENV === 'production') {
    throw new Error('Cannot reset database in production');
  }

  console.log('🧹 Resetting database...');

  // Delete in correct order to respect foreign keys
  await db.delete(documents);
  await db.delete(consumptionRecords);
  await db.delete(tickets);
  await db.delete(tenantContracts);
  await db.delete(contracts);
  await db.delete(buildings);
  await db.delete(users);
  await db.delete(organizations);

  console.log('✅ Database reset complete');
}

/**
 * Full development setup
 */
export async function setupDevelopmentEnvironment() {
  console.log('🚀 Setting up development environment...');

  await resetDatabase();
  const prodData = await seedProductionDemo();
  await seedSampleData(prodData.organization.id);

  console.log('✅ Development environment ready!');
  console.log('\n📧 Demo Credentials:');
  console.log(`Admin: admin@berlinproperties.de`);
  console.log(`Tenants: Check the seeded tenant emails`);
  console.log('\n🏢 Demo Organization:');
  console.log(`Name: ${prodData.organization.name}`);
  console.log(`Slug: ${prodData.organization.slug}`);
}

/**
 * Seed specific test scenarios
 */
export async function seedTestScenarios() {
  console.log('🧪 Creating test scenarios...');

  // Get existing organization
  const [org] = await db
    .select()
    .from(organizations)
    .limit(1);

  if (!org) {
    throw new Error('No organization found. Run basic seeding first.');
  }

  // Scenario 1: Overdue tickets
  const [building] = await db
    .select()
    .from(buildings)
    .where(eq(buildings.organizationId, org.id))
    .limit(1);

  if (building) {
    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - 30);

    await db.insert(tickets).values({
      organizationId: org.id,
      buildingId: building.id,
      createdById: (await db.select().from(users).where(eq(users.role, 'landlord_admin')).limit(1))[0].id,
      title: 'Overdue Maintenance Issue',
      description: 'This ticket is overdue for testing purposes',
      priority: 'urgent',
      status: 'open',
      category: 'maintenance',
      dueDate: overdueDate,
      createdAt: overdueDate,
    });
  }

  // Scenario 2: High consumption anomaly
  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.organizationId, org.id))
    .limit(1);

  if (contract) {
    const thisMonth = new Date();
    const period = `${thisMonth.getFullYear()}-${(thisMonth.getMonth() + 1).toString().padStart(2, '0')}`;

    await db.insert(consumptionRecords).values({
      organizationId: org.id,
      contractId: contract.id,
      consumptionType: 'electricity',
      period,
      reading: '2500.500', // Abnormally high
      unit: 'kWh',
      cost: '750.00',
      meterNumber: 'TEST-ANOMALY-001',
      readingDate: new Date(),
    });
  }

  console.log('✅ Test scenarios created');
}

/**
 * Create sample data for performance testing
 */
export async function seedPerformanceData(recordCount = 10000) {
  if (env.NODE_ENV === 'production') {
    throw new Error('Cannot create performance data in production');
  }

  console.log(`⚡ Creating ${recordCount} records for performance testing...`);

  const [org] = await db
    .select()
    .from(organizations)
    .limit(1);

  if (!org) {
    throw new Error('No organization found');
  }

  const allContracts = await db
    .select()
    .from(contracts)
    .where(eq(contracts.organizationId, org.id));

  if (allContracts.length === 0) {
    throw new Error('No contracts found');
  }

  // Create large batch of consumption records
  const batchSize = 1000;
  const batches = Math.ceil(recordCount / batchSize);

  for (let batch = 0; batch < batches; batch++) {
    const batchData = [];
    const currentBatchSize = Math.min(batchSize, recordCount - (batch * batchSize));

    for (let i = 0; i < currentBatchSize; i++) {
      const contract = allContracts[Math.floor(Math.random() * allContracts.length)];
      const date = new Date();
      date.setMonth(date.getMonth() - Math.floor(Math.random() * 24)); // Last 2 years
      
      const period = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      
      batchData.push({
        organizationId: org.id,
        contractId: contract.id,
        consumptionType: ['electricity', 'gas', 'water', 'heating'][Math.floor(Math.random() * 4)],
        period,
        reading: (Math.random() * 1000).toFixed(3),
        unit: 'kWh',
        cost: (Math.random() * 300).toFixed(2),
        meterNumber: `PERF-${Math.floor(Math.random() * 100000)}`,
        readingDate: date,
      });
    }

    await db.insert(consumptionRecords).values(batchData);
    console.log(`Batch ${batch + 1}/${batches} completed (${currentBatchSize} records)`);
  }

  console.log(`✅ Performance data created: ${recordCount} records`);
}

/**
 * Validate seeded data integrity
 */
export async function validateSeededData(organizationId: string) {
  console.log('🔍 Validating seeded data...');

  const validations = [];

  // Check organization exists
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  
  validations.push({ 
    check: 'Organization exists', 
    passed: !!org,
    details: org ? `Found: ${org.name}` : 'No organization found'
  });

  if (!org) return validations;

  // Check for admin users
  const [adminCount] = await db
    .select({ count: count(users.id) })
    .from(users)
    .where(
      and(
        eq(users.organizationId, organizationId),
        eq(users.role, 'landlord_admin')
      )
    );

  validations.push({
    check: 'Admin users exist',
    passed: Number(adminCount.count) > 0,
    details: `Found ${adminCount.count} admin users`
  });

  // Check for buildings
  const [buildingCount] = await db
    .select({ count: count(buildings.id) })
    .from(buildings)
    .where(eq(buildings.organizationId, organizationId));

  validations.push({
    check: 'Buildings exist',
    passed: Number(buildingCount.count) > 0,
    details: `Found ${buildingCount.count} buildings`
  });

  // Check for contracts
  const [contractCount] = await db
    .select({ count: count(contracts.id) })
    .from(contracts)
    .where(eq(contracts.organizationId, organizationId));

  validations.push({
    check: 'Contracts exist',
    passed: Number(contractCount.count) > 0,
    details: `Found ${contractCount.count} contracts`
  });

  // Check foreign key integrity
  const [orphanedContracts] = await db
    .select({ count: count(contracts.id) })
    .from(contracts)
    .leftJoin(buildings, eq(contracts.buildingId, buildings.id))
    .where(
      and(
        eq(contracts.organizationId, organizationId),
        sql`${buildings.id} IS NULL`
      )
    );

  validations.push({
    check: 'No orphaned contracts',
    passed: Number(orphanedContracts.count) === 0,
    details: `Found ${orphanedContracts.count} orphaned contracts`
  });

  const passedCount = validations.filter(v => v.passed).length;
  console.log(`\n📊 Validation Results: ${passedCount}/${validations.length} checks passed`);
  
  validations.forEach(validation => {
    const status = validation.passed ? '✅' : '❌';
    console.log(`${status} ${validation.check}: ${validation.details}`);
  });

  return validations;
}