// src/components/layouts/private-layout.tsx
'use client'

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { ReactNode, useState } from 'react'
import { usePathname } from 'next/navigation'
import { 
  HomeIcon,
  BuildingOfficeIcon,
  DocumentTextIcon,
  UserGroupIcon,
  TicketIcon,
  ChartBarIcon,
  FolderIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  UserIcon
} from '@heroicons/react/24/outline'

interface PrivateLayoutProps {
  children: ReactNode
}

export function PrivateLayout({ children }: PrivateLayoutProps) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isLandlord = session?.user?.role === 'landlord_admin'
  const isTenant = session?.user?.role === 'tenant'

  // Navigation items based on user role
  const navigation = isLandlord ? [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { name: 'Buildings', href: '/dashboard/buildings', icon: BuildingOfficeIcon },
    { name: 'Contracts', href: '/dashboard/contracts', icon: DocumentTextIcon },
    { name: 'Tenants', href: '/dashboard/tenants', icon: UserGroupIcon },
    { name: 'Tickets', href: '/dashboard/tickets', icon: TicketIcon },
    { name: 'Consumption', href: '/dashboard/consumption', icon: ChartBarIcon },
    { name: 'Documents', href: '/dashboard/documents', icon: FolderIcon },
    { name: 'Analytics', href: '/dashboard/analytics', icon: ChartBarIcon },
  ] : [
    { name: 'Dashboard', href: '/tenant', icon: HomeIcon },
    { name: 'My Contracts', href: '/tenant/contracts', icon: DocumentTextIcon },
    { name: 'Tickets', href: '/tenant/tickets', icon: TicketIcon },
    { name: 'Consumption', href: '/tenant/consumption', icon: ChartBarIcon },
    { name: 'Documents', href: '/tenant/documents', icon: FolderIcon },
    { name: 'Profile', href: '/tenant/profile', icon: UserIcon },
  ]

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' })
  }

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={`flex flex-col h-full ${mobile ? 'w-64' : 'w-64'} bg-white border-r border-gray-200`}>
      {/* Logo */}
      <div className="flex items-center h-16 px-6 border-b border-gray-200">
        <Link href={isLandlord ? '/dashboard' : '/tenant'} className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">T</span>
          </div>
          <span className="text-xl font-semibold text-gray-900">
            TenantBridge
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`
                flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors
                ${isActive 
                  ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700' 
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
              onClick={mobile ? () => setSidebarOpen(false) : undefined}
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* User Info & Settings */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {session?.user?.name || session?.user?.email}
              </p>
              <p className="text-xs text-gray-500 capitalize">
                {isLandlord ? 'Admin' : 'Tenant'}
              </p>
            </div>
          </div>
        </div>
        
        <div className="space-y-1">
          <Link
            href={isLandlord ? '/dashboard/settings' : '/tenant/settings'}
            className="flex items-center px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Cog6ToothIcon className="w-5 h-5 mr-3" />
            Settings
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5 mr-3" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black opacity-50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0 z-50">
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <Sidebar />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header */}
        <header className="bg-white border-b border-gray-200 lg:hidden">
          <div className="flex items-center justify-between h-16 px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-gray-600 hover:text-gray-900"
            >
              <Bars3Icon className="w-6 h-6" />
            </button>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">T</span>
              </div>
              <span className="text-xl font-semibold text-gray-900">
                TenantBridge
              </span>
            </div>
            <div className="w-6" /> {/* Spacer */}
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  )
}