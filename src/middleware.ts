// src/middleware.ts
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const { token } = req.nextauth;
    const { pathname } = req.nextUrl;

    // Public routes that don't require authentication
    const publicRoutes = [
      '/auth/signin',
      '/auth/error',
      '/api/auth',
      '/invite',
    ];

    // Check if current path is public
    const isPublicRoute = publicRoutes.some(route => 
      pathname.startsWith(route)
    );

    if (isPublicRoute) {
      return NextResponse.next();
    }

    // If no token and trying to access protected route
    if (!token) {
      return NextResponse.redirect(new URL('/auth/signin', req.url));
    }

    // Role-based route protection
    const { role, organizationId } = token;

    // Landlord admin routes
    if (pathname.startsWith('/dashboard')) {
      if (role !== 'landlord_admin') {
        return NextResponse.redirect(new URL('/unauthorized', req.url));
      }
    }

    // Tenant routes
    if (pathname.startsWith('/tenant')) {
      if (role !== 'tenant') {
        return NextResponse.redirect(new URL('/unauthorized', req.url));
      }
    }

    // API route protection
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth')) {
      // Add organization context to headers for API routes
      const response = NextResponse.next();
      response.headers.set('x-organization-id', organizationId);
      response.headers.set('x-user-role', role);
      return response;
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        
        // Allow public routes
        const publicRoutes = [
          '/auth/signin',
          '/auth/error',
          '/api/auth',
          '/invite',
        ];

        if (publicRoutes.some(route => pathname.startsWith(route))) {
          return true;
        }

        // Require token for all other routes
        return !!token;
      },
    },
  }
);

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};