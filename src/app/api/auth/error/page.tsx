// src/app/auth/error/page.tsx
'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PublicLayout } from '@/components/layouts/public-layout'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

export default function AuthErrorPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const getErrorMessage = (error: string | null) => {
    switch (error) {
      case 'Configuration':
        return 'There is a problem with the server configuration.'
      case 'AccessDenied':
        return 'You do not have permission to sign in.'
      case 'Verification':
        return 'The verification token has expired or has already been used.'
      case 'CredentialsSignin':
        return 'The credentials you provided are incorrect.'
      default:
        return 'An error occurred during authentication.'
    }
  }

  return (
    <PublicLayout>
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 text-center">
          <div>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ExclamationTriangleIcon className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Authentication Error
            </h2>
            <p className="text-gray-600 mb-8">
              {getErrorMessage(error)}
            </p>
          </div>

          <div className="space-y-4">
            <Link
              href="/auth/signin"
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors inline-block"
            >
              Try Again
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
              If the problem persists, please contact your property manager.
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}