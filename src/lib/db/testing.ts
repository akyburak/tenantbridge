// src/lib/db/testing.ts
import { eq, and, count, sql } from 'drizzle-orm';
import { db } from './db';
import { env } from '../env';
import { 
  organizations,
  users,
  buildings,
  contracts,
  tenantContracts,
  tickets,
  consumptionRecords,
  documents,
  invitationTokens
} from './schema';

/**
 * Test data factories
 */
export class TestDataFactory {
  private static testOrgId: string | null = null;

  /**
   * Create test organization
   */
  static async createTestOrganization(suffix = '') {
    if (env.NODE_ENV === 'production') {
      throw new Error('Test data creation not allowed in production');
    }

    const [testOrg] = await db.insert(organizations).values({
      name: `Test Organization${suffix}`,
      slug: `test-org${suffix.toLowerCase().replace(/\s+/g, '-')}`,
      contactEmail: `test${suffix}@example.com`,
      contactPhone: '+49 30 TEST TEST',
      address: 'Test Street 123',
      city: 'Berlin',
      postalCode: '10115',
      country: 'Germany',
    }).returning();

    this.testOrgId = testOrg.id;
    return testOrg;
  }

  /**
   * Create test landlord admin
   */
  static async createTestLandlord(organizationId: string, suffix = '') {
    const [admin] = await db.insert(users).values({
      email: `admin${suffix}@test.com`,
      name: `Test Admin${suffix}`,
      role: 'landlord_admin',
      organizationId,
      isActive: true,
      emailVerified: new Date(),
    }).returning();

    return admin;
  }

  /**
   * Create test tenant
   */
  static async createTestTenant(organizationId: string, suffix = '') {
    const [tenant] = await db.insert(users).values({
      email: `tenant${suffix}@test.com`,
      name: `Test Tenant${suffix}`,
      role: 'tenant',
      organizationId,
      isActive: true,
      emailVerified: new Date(),
    }).returning();

    return tenant;
  }

  /**
   * Create test building
   */
  static async createTestBuilding(organizationId: string, suffix = '') {
    const [building] = await db.insert(buildings).values({
      organizationId,
      name: `Test Building${suffix}`,
      address: `Test Address ${suffix} 123`,
      city: 'Berlin',
      postalCode: '12345',
      country: 'Germany',
      totalUnits: 10,
      yearBuilt: 2020,
      propertyType: 'apartment',
    }).returning();

    return building;
  }

  /**
   * Create test contract
   */
  static async createTestContract(
    organizationId: string,
    buildingId: string,
    suffix = ''
  ) {
    const [contract] = await db.insert(contracts).values({
      organizationId,
      buildingId,
      contractNumber: `TEST-${Date.now()}-${suffix}`,
      unitNumber: `A-10${suffix}`,
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      rentAmount: '1000.00',
      depositAmount: '2000.00',
      isActive: true,
    }).returning();

    return contract;
  }

  /**
   * Create complete test scenario
   */
  static async createTestScenario(scenarioName = 'default') {
    const org = await this.createTestOrganization(` ${scenarioName}`);
    const admin = await this.createTestLandlord(org.id, ` ${scenarioName}`);
    const tenant = await this.createTestTenant(org.id, ` ${scenarioName}`);
    const building = await this.createTestBuilding(org.id, ` ${scenarioName}`);
    const contract = await this.createTestContract(org.id, building.id, scenarioName);

    // Link tenant to contract
    const [tenantContract] = await db.insert(tenantContracts).values({
      organizationId: org.id,
      tenantId: tenant.id,
      contractId: contract.id,
      percentage: '100.00',
      isMainTenant: true,
    }).returning();

    return {
      organization: org,
      admin,
      tenant,
      building,
      contract,
      tenantContract,
    };
  }

  /**
   * Cleanup test data
   */
  static async cleanupTestData(organizationId?: string) {
    if (env.NODE_ENV === 'production') {
      throw new Error('Test cleanup not allowed in production');
    }

    const targetOrgId = organizationId || this.testOrgId;
    if (!targetOrgId) return;

    console.log('🧹 Cleaning up test data...');

    // Delete in correct order
    await db.delete(documents).where(eq(documents.organizationId, targetOrgId));
    await db.delete(consumptionRecords).where(eq(consumptionRecords.organizationId, targetOrgId));
    await db.delete(tickets).where(eq(tickets.organizationId, targetOrgId));
    await db.delete(tenantContracts).where(eq(tenantContracts.organizationId, targetOrgId));
    await db.delete(contracts).where(eq(contracts.organizationId, targetOrgId));
    await db.delete(buildings).where(eq(buildings.organizationId, targetOrgId));
    await db.delete(users).where(eq(users.organizationId, targetOrgId));
    await db.delete(organizations).where(eq(organizations.id, targetOrgId));

    this.testOrgId = null;
    console.log('✅ Test data cleanup completed');
  }
}

/**
 * Database performance testing
 */
export class PerformanceTest {
  /**
   * Test query performance
   */
  static async runQueryPerformanceTest(organizationId: string) {
    if (env.NODE_ENV === 'production') {
      throw new Error('Performance tests should not run in production');
    }

    console.log('⚡ Running query performance tests...');

    const tests = [
      {
        name: 'Simple organization lookup',
        query: () => db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1),
      },
      {
        name: 'Buildings with contracts count',
        query: () => db
          .select({
            building: buildings,
            contractCount: count(contracts.id),
          })
          .from(buildings)
          .leftJoin(contracts, eq(buildings.id, contracts.buildingId))
          .where(eq(buildings.organizationId, organizationId))
          .groupBy(buildings.id),
      },
      {
        name: 'Complex dashboard query',
        query: () => db.execute(sql`
          SELECT 
            b.name as building_name,
            COUNT(c.id) as total_contracts,
            COUNT(CASE WHEN c.is_active THEN 1 END) as active_contracts,
            COUNT(t.id) as total_tickets,
            COUNT(CASE WHEN t.status IN ('open', 'in_progress') THEN 1 END) as open_tickets
          FROM buildings b
          LEFT JOIN contracts c ON b.id = c.building_id
          LEFT JOIN tickets t ON b.id = t.building_id
          WHERE b.organization_id = ${organizationId}
          GROUP BY b.id, b.name
          ORDER BY b.name
        `),
      },
      {
        name: 'Consumption analytics',
        query: () => db.execute(sql`
          SELECT 
            cr.consumption_type,
            cr.period,
            SUM(CAST(cr.reading AS DECIMAL)) as total_reading,
            AVG(CAST(cr.reading AS DECIMAL)) as avg_reading
          FROM consumption_records cr
          WHERE cr.organization_id = ${organizationId}
          GROUP BY cr.consumption_type, cr.period
          ORDER BY cr.period DESC
          LIMIT 50
        `),
      },
    ];

    const results = [];

    for (const test of tests) {
      const start = performance.now();
      try {
        await test.query();
        const duration = performance.now() - start;
        results.push({
          name: test.name,
          duration,
          success: true,
          status: duration < 100 ? 'excellent' : duration < 500 ? 'good' : 'slow',
        });
      } catch (error) {
        results.push({
          name: test.name,
          duration: performance.now() - start,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const successRate = (results.filter(r => r.success).length / results.length) * 100;

    console.log(`📊 Performance test results: ${successRate}% success, ${avgDuration.toFixed(2)}ms average`);

    return {
      tests: results,
      summary: {
        totalTests: tests.length,
        successful: results.filter(r => r.success).length,
        averageDuration: avgDuration,
        successRate,
      },
    };
  }

  /**
   * Test concurrent operations
   */
  static async testConcurrency(organizationId: string, concurrentCount = 10) {
    if (env.NODE_ENV === 'production') {
      throw new Error('Concurrency tests should not run in production');
    }

    console.log(`🔄 Testing ${concurrentCount} concurrent operations...`);

    const operations = Array.from({ length: concurrentCount }, (_, i) => 
      async () => {
        // Simple read operation
        return await db
          .select()
          .from(buildings)
          .where(eq(buildings.organizationId, organizationId))
          .limit(5);
      }
    );

    const start = performance.now();
    const results = await Promise.allSettled(operations.map(op => op()));
    const duration = performance.now() - start;

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = concurrentCount - successful;

    return {
      concurrentOperations: concurrentCount,
      successful,
      failed,
      totalDuration: duration,
      averageDuration: duration / concurrentCount,
      successRate: (successful / concurrentCount) * 100,
    };
  }

  /**
   * Test data volume limits
   */
  static async testDataVolume(organizationId: string) {
    console.log('📈 Testing data volume handling...');

    const results = [];

    try {
      // Test large result set
      const start = performance.now();
      const tickets = await db
        .select()
        .from(tickets)
        .where(eq(tickets.organizationId, organizationId))
        .limit(1000);
      
      const duration = performance.now() - start;
      
      results.push({
        test: 'Large result set (1000 tickets)',
        recordCount: tickets.length,
        duration,
        memoryUsage: JSON.stringify(tickets).length,
        status: duration < 2000 ? 'good' : 'slow',
      });

    } catch (error) {
      results.push({
        test: 'Large result set',
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 'failed',
      });
    }

    return results;
  }
}

/**
 * Database integrity testing
 */
export class IntegrityTest {
  /**
   * Test foreign key constraints
   */
  static async testForeignKeyConstraints(organizationId: string) {
    if (env.NODE_ENV === 'production') {
      throw new Error('Integrity tests should not modify production data');
    }

    console.log('🔗 Testing foreign key constraints...');

    const tests = [];

    // Test 1: Try to create contract with invalid building ID
    try {
      await db.insert(contracts).values({
        organizationId,
        buildingId: '00000000-0000-0000-0000-000000000000',
        contractNumber: 'FK-TEST-001',
        unitNumber: 'TEST-01',
        startDate: new Date(),
        rentAmount: '1000.00',
      });
      tests.push({ test: 'Invalid building FK', passed: false, note: 'Should have failed' });
    } catch (error) {
      tests.push({ test: 'Invalid building FK', passed: true, note: 'Correctly rejected' });
    }

    // Test 2: Try to create tenant contract with invalid user ID
    try {
      const [building] = await db.select().from(buildings).where(eq(buildings.organizationId, organizationId)).limit(1);
      const [contract] = await db.select().from(contracts).where(eq(contracts.organizationId, organizationId)).limit(1);
      
      if (building && contract) {
        await db.insert(tenantContracts).values({
          organizationId,
          tenantId: '00000000-0000-0000-0000-000000000000',
          contractId: contract.id,
          percentage: '100.00',
        });
        tests.push({ test: 'Invalid tenant FK', passed: false, note: 'Should have failed' });
      }
    } catch (error) {
      tests.push({ test: 'Invalid tenant FK', passed: true, note: 'Correctly rejected' });
    }

    return tests;
  }

  /**
   * Test row-level security
   */
  static async testRowLevelSecurity(org1Id: string, org2Id: string) {
    console.log('🔒 Testing row-level security...');

    // Create test data in both organizations
    const [building1] = await db.insert(buildings).values({
      organizationId: org1Id,
      name: 'RLS Test Building 1',
      address: 'Test St 1',
      city: 'Berlin',
      postalCode: '10001',
      totalUnits: 5,
    }).returning();

    const [building2] = await db.insert(buildings).values({
      organizationId: org2Id,
      name: 'RLS Test Building 2',
      address: 'Test St 2',
      city: 'Berlin',
      postalCode: '10002',
      totalUnits: 5,
    }).returning();

    const tests = [];

    // Test: User from org1 should not see org2 buildings
    try {
      const { setRLSContext } = await import('./utils');
      await setRLSContext({
        organizationId: org1Id,
        userId: '00000000-0000-0000-0000-000000000001',
        userRole: 'landlord_admin',
      });

      const buildingsForOrg1 = await db.select().from(buildings);
      const hasOrg2Building = buildingsForOrg1.some(b => b.organizationId === org2Id);

      tests.push({
        test: 'Organization isolation',
        passed: !hasOrg2Building,
        note: `Found ${buildingsForOrg1.length} buildings, none from other org: ${!hasOrg2Building}`,
      });

    } catch (error) {
      tests.push({
        test: 'Organization isolation',
        passed: false,
        note: `RLS test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }

    // Cleanup test buildings
    await db.delete(buildings).where(eq(buildings.id, building1.id));
    await db.delete(buildings).where(eq(buildings.id, building2.id));

    return tests;
  }

  /**
   * Test data consistency
   */
  static async testDataConsistency(organizationId: string) {
    console.log('✅ Testing data consistency...');

    const issues = [];

    // Check for orphaned records
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

    if (Number(orphanedContracts.count) > 0) {
      issues.push(`${orphanedContracts.count} contracts without valid buildings`);
    }

    // Check for inactive users with active contracts
    const [inactiveTenants] = await db
      .select({ count: count(tenantContracts.id) })
      .from(tenantContracts)
      .leftJoin(users, eq(tenantContracts.tenantId, users.id))
      .where(
        and(
          eq(tenantContracts.organizationId, organizationId),
          eq(users.isActive, false)
        )
      );

    if (Number(inactiveTenants.count) > 0) {
      issues.push(`${inactiveTenants.count} inactive users with active contracts`);
    }

    // Check for percentage sum > 100% in shared contracts
    const contractPercentages = await db
      .select({
        contractId: tenantContracts.contractId,
        totalPercentage: sql<number>`SUM(CAST(${tenantContracts.percentage} AS DECIMAL))`,
      })
      .from(tenantContracts)
      .where(eq(tenantContracts.organizationId, organizationId))
      .groupBy(tenantContracts.contractId);

    const invalidPercentages = contractPercentages.filter(cp => 
      Number(cp.totalPercentage) > 100
    );

    if (invalidPercentages.length > 0) {
      issues.push(`${invalidPercentages.length} contracts with percentage sum > 100%`);
    }

    return {
      isConsistent: issues.length === 0,
      issues,
      checkedAt: new Date(),
    };
  }

  /**
   * Test database constraints
   */
  static async testConstraints(organizationId: string) {
    console.log('⚖️ Testing database constraints...');

    const tests = [];

    // Test unique constraints
    try {
      const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
      if (org) {
        await db.insert(organizations).values({
          name: 'Duplicate Test Org',
          slug: org.slug, // Should fail - duplicate slug
          contactEmail: 'duplicate@test.com',
        });
        tests.push({ test: 'Organization slug uniqueness', passed: false });
      }
    } catch (error) {
      tests.push({ test: 'Organization slug uniqueness', passed: true });
    }

    // Test not null constraints
    try {
      await db.insert(buildings).values({
        organizationId,
        name: '', // Should fail - empty name
        address: 'Test Address',
        city: 'Test City',
        postalCode: '12345',
        totalUnits: 1,
      });
      tests.push({ test: 'Building name not null', passed: false });
    } catch (error) {
      tests.push({ test: 'Building name not null', passed: true });
    }

    return tests;
  }
}

/**
 * Load testing utilities
 */
export class LoadTest {
  /**
   * Simulate high load scenarios
   */
  static async simulateLoad(
    organizationId: string,
    options: {
      concurrentUsers: number;
      operationsPerUser: number;
      duration: number; // seconds
    }
  ) {
    if (env.NODE_ENV === 'production') {
      throw new Error('Load testing should not run in production');
    }

    console.log(`🚀 Simulating load: ${options.concurrentUsers} users, ${options.operationsPerUser} ops each`);

    const startTime = Date.now();
    const endTime = startTime + (options.duration * 1000);
    const results = [];

    // Create concurrent user simulations
    const userPromises = Array.from({ length: options.concurrentUsers }, async (_, userIndex) => {
      const userResults = [];
      
      while (Date.now() < endTime) {
        for (let op = 0; op < options.operationsPerUser && Date.now() < endTime; op++) {
          const opStart = performance.now();
          
          try {
            // Mix of different operations
            switch (op % 4) {
              case 0:
                await db.select().from(buildings).where(eq(buildings.organizationId, organizationId)).limit(10);
                break;
              case 1:
                await db.select().from(contracts).where(eq(contracts.organizationId, organizationId)).limit(10);
                break;
              case 2:
                await db.select().from(tickets).where(eq(tickets.organizationId, organizationId)).limit(10);
                break;
              case 3:
                await db.select().from(users).where(eq(users.organizationId, organizationId)).limit(10);
                break;
            }
            
            userResults.push({
              user: userIndex,
              operation: op,
              duration: performance.now() - opStart,
              success: true,
            });
          } catch (error) {
            userResults.push({
              user: userIndex,
              operation: op,
              duration: performance.now() - opStart,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown',
            });
          }
        }
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      return userResults;
    });

    // Wait for all users to complete
    const allResults = await Promise.all(userPromises);
    const flatResults = allResults.flat();

    // Calculate statistics
    const successful = flatResults.filter(r => r.success).length;
    const failed = flatResults.length - successful;
    const avgDuration = flatResults.reduce((sum, r) => sum + r.duration, 0) / flatResults.length;
    const maxDuration = Math.max(...flatResults.map(r => r.duration));
    const minDuration = Math.min(...flatResults.map(r => r.duration));

    return {
      config: options,
      actualDuration: (Date.now() - startTime) / 1000,
      totalOperations: flatResults.length,
      successful,
      failed,
      successRate: (successful / flatResults.length) * 100,
      performance: {
        averageDuration: avgDuration,
        maxDuration,
        minDuration,
        operationsPerSecond: flatResults.length / ((Date.now() - startTime) / 1000),
      },
      errors: flatResults.filter(r => !r.success).map(r => r.error),
    };
  }
}

/**
 * Test suite runner
 */
export class DatabaseTestSuite {
  /**
   * Run comprehensive database tests
   */
  static async runFullSuite() {
    if (env.NODE_ENV === 'production') {
      throw new Error('Full test suite should not run in production');
    }

    console.log('🧪 Running comprehensive database test suite...');

    try {
      // Create test scenario
      const testData = await TestDataFactory.createTestScenario('test-suite');
      const orgId = testData.organization.id;

      const results = {
        setup: { success: true, organizationId: orgId },
        performance: await PerformanceTest.runQueryPerformanceTest(orgId),
        constraints: await IntegrityTest.testConstraints(orgId),
        consistency: await IntegrityTest.testDataConsistency(orgId),
        concurrency: await PerformanceTest.testConcurrency(orgId, 5),
        load: await LoadTest.simulateLoad(orgId, {
          concurrentUsers: 3,
          operationsPerUser: 10,
          duration: 5,
        }),
      };

      // Cleanup
      await TestDataFactory.cleanupTestData(orgId);

      // Overall assessment
      const allTestsPassed = 
        results.performance.summary.successRate === 100 &&
        results.constraints.every(t => t.passed) &&
        results.consistency.isConsistent &&
        results.concurrency.successRate >= 95 &&
        results.load.successRate >= 95;

      return {
        ...results,
        overall: {
          allTestsPassed,
          recommendation: allTestsPassed 
            ? 'Database is ready for production'
            : 'Review failed tests before production deployment',
        },
        completedAt: new Date(),
      };

    } catch (error) {
      console.error('Test suite failed:', error);
      throw error;
    }
  }

  /**
   * Quick smoke test
   */
  static async smokeTest() {
    try {
      // Test basic connectivity
      await db.execute(sql`SELECT 1 as test`);
      
      // Test table access
      await db.select().from(organizations).limit(1);
      await db.select().from(users).limit(1);
      
      return {
        status: 'passed',
        message: 'Database smoke test passed',
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: 'failed',
        message: error instanceof Error ? error.message : 'Smoke test failed',
        timestamp: new Date(),
      };
    }
  }
}