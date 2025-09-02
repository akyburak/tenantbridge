// src/app/unauthorized/page.tsx
'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { PublicLayout } from '@/components/layouts/public-layout'
import { LockClosedIcon } from '@heroicons/react/24/outline'

export default function UnauthorizedPage() {
  const { data: session } = useSession()

  const getDashboardLink = () => {
    if (session?.user?.role === 'landlord_admin') {
      return '/dashboard'
    } else if (session?.user?.role === 'tenant') {
      return '/tenant'
    }
    return '/'
  }

  return (
    <PublicLayout>
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 text-center">
          <div>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <LockClosedIcon className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Access Denied
            </h2>
            <p className="text-gray-600 mb-8">
              You don't have permission to access this page.
            </p>
          </div>

          <div className="space-y-4">
            <Link
              href={getDashboardLink()}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors inline-block"
            >
              Go to Dashboard
            </Link>
            <Link
              href="/"
              className="w-full border border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:border-gray-400 transition-colors inline-block"
            >
              Go Home
            </Link>
          </div>

          <div className="text-sm text-gray-500">
            <p>
              If you believe this is an error, please contact your administrator.
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}