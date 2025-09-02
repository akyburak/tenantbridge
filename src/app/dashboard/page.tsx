// src/app/dashboard/page.tsx
'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { PrivateLayout } from '@/components/layouts/private-layout'
import { 
  BuildingOfficeIcon,
  DocumentTextIcon,
  UserGroupIcon,
  TicketIcon,
  ArrowUpIcon,
  ArrowDownIcon
} from '@heroicons/react/24/outline'

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated') {
      if (session?.user?.role !== 'landlord_admin') {
        router.push('/tenant')
        return
      }
    } else if (status === 'unauthenticated') {
      router.push('/auth/signin')
      return
    }
  }, [session, status, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!session?.user || session.user.role !== 'landlord_admin') {
    return null
  }

  // Mock data - will be replaced with actual API calls
  const stats = [
    {
      name: 'Total Buildings',
      value: '12',
      change: '+2 this month',
      changeType: 'increase',
      icon: BuildingOfficeIcon,
    },
    {
      name: 'Active Contracts',
      value: '48',
      change: '+5 this month',
      changeType: 'increase',
      icon: DocumentTextIcon,
    },
    {
      name: 'Total Tenants',
      value: '67',
      change: '+8 this month',
      changeType: 'increase',
      icon: UserGroupIcon,
    },
    {
      name: 'Open Tickets',
      value: '23',
      change: '-3 from yesterday',
      changeType: 'decrease',
      icon: TicketIcon,
    },
  ]

  const recentActivity = [
    {
      id: 1,
      type: 'ticket',
      title: 'New maintenance request from Unit 4B',
      time: '2 hours ago',
      status: 'pending'
    },
    {
      id: 2,
      type: 'contract',
      title: 'Contract signed for Building A Unit 3C',
      time: '4 hours ago',
      status: 'completed'
    },
    {
      id: 3,
      type: 'tenant',
      title: 'New tenant registered via invitation',
      time: '1 day ago',
      status: 'completed'
    },
    {
      id: 4,
      type: 'payment',
      title: 'Monthly consumption report generated',
      time: '2 days ago',
      status: 'completed'
    }
  ]

  return (
    <PrivateLayout>
      <div className="p-6">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome back, {session.user.name || 'Admin'}
          </h1>
          <p className="text-gray-600">
            Here's what's happening with your properties today.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => (
            <div key={stat.name} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <div className="flex items-center mt-1">
                    {stat.changeType === 'increase' ? (
                      <ArrowUpIcon className="w-4 h-4 text-green-500 mr-1" />
                    ) : (
                      <ArrowDownIcon className="w-4 h-4 text-green-500 mr-1" />
                    )}
                    <p className="text-sm text-green-600">{stat.change}</p>
                  </div>
                </div>
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <stat.icon className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3">
                    <div className={`w-2 h-2 rounded-full mt-2 ${
                      activity.status === 'pending' ? 'bg-yellow-400' : 'bg-green-400'
                    }`} />
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">{activity.title}</p>
                      <p className="text-xs text-gray-500">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <button className="text-sm text-blue-600 hover:text-blue-700 transition-colors">
                  View all activity →
                </button>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <button className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                  <BuildingOfficeIcon className="w-8 h-8 text-blue-600 mb-2" />
                  <span className="text-sm font-medium text-gray-900">Add Building</span>
                </button>
                <button className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                  <DocumentTextIcon className="w-8 h-8 text-blue-600 mb-2" />
                  <span className="text-sm font-medium text-gray-900">New Contract</span>
                </button>
                <button className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                  <UserGroupIcon className="w-8 h-8 text-blue-600 mb-2" />
                  <span className="text-sm font-medium text-gray-900">Invite Tenant</span>
                </button>
                <button className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                  <TicketIcon className="w-8 h-8 text-blue-600 mb-2" />
                  <span className="text-sm font-medium text-gray-900">View Tickets</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming Tasks */}
        <div className="mt-6 bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Upcoming Tasks</h2>
          </div>
          <div className="p-6">
            <div className="text-gray-500 text-center py-8">
              <TicketIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p>No upcoming tasks</p>
              <p className="text-sm">All caught up! Great work.</p>
            </div>
          </div>
        </div>
      </div>
    </PrivateLayout>
  )
}