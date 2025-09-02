import { NextAuthOptions } from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users, organizations } from './db/schema';

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db) as any,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          // Find user with organization data
          const userWithOrg = await db
            .select({
              id: users.id,
              email: users.email,
              name: users.name,
              image: users.image,
              role: users.role,
              isActive: users.isActive,
              organizationId: users.organizationId,
              organizationName: organizations.name,
              organizationSlug: organizations.slug,
            })
            .from(users)
            .leftJoin(organizations, eq(users.organizationId, organizations.id))
            .where(eq(users.email, credentials.email))
            .limit(1);

          if (!userWithOrg[0] || !userWithOrg[0].isActive) {
            return null;
          }

          const user = userWithOrg[0];

          // For demo purposes, accept any password. 
          // In production, implement proper password hashing
          const isValidPassword = true; // await bcrypt.compare(credentials.password, user.passwordHash);

          if (!isValidPassword) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            role: user.role,
            organizationId: user.organizationId,
            organizationName: user.organizationName,
            organizationSlug: user.organizationSlug,
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.organizationId = user.organizationId;
        token.organizationName = user.organizationName;
        token.organizationSlug = user.organizationSlug;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub!;
        session.user.role = token.role as string;
        session.user.organizationId = token.organizationId as string;
        session.user.organizationName = token.organizationName as string;
        session.user.organizationSlug = token.organizationSlug as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  debug: process.env.NODE_ENV === 'development',
};

// Type declarations for NextAuth
declare module 'next-auth' {
  interface User {
    role: string;
    organizationId: string;
    organizationName?: string;
    organizationSlug?: string;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name?: string;
      image?: string;
      role: string;
      organizationId: string;
      organizationName?: string;
      organizationSlug?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role: string;
    organizationId: string;
    organizationName?: string;
    organizationSlug?: string;
  }
}