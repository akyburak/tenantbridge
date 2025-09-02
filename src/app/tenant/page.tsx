// src/app/tenant/page.tsx
'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { PrivateLayout } from '@/components/layouts/private-layout'
import { 
  DocumentTextIcon,
  TicketIcon,
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'

export default function TenantDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated') {
      if (session?.user?.role !== 'tenant') {
        router.push('/dashboard')
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

  if (!session?.user || session.user.role !== 'tenant') {
    return null
  }

  // Mock data - will be replaced with actual API calls
  const stats = [
    {
      name: 'Active Contracts',
      value: '2',
      description: 'Current lease agreements',
      icon: DocumentTextIcon,
    },
    {
      name: 'Open Tickets',
      value: '1',
      description: 'Pending maintenance requests',
      icon: TicketIcon,
    },
    {
      name: 'This Month Usage',
      value: '85%',
      description: 'Average consumption',
      icon: ChartBarIcon,
    },
  ]

  const recentTickets = [
    {
      id: 1,
      title: 'Kitchen faucet leak',
      status: 'in_progress',
      created: '2 days ago',
      priority: 'high'
    },
    {
      id: 2,
      title: 'Heating not working properly',
      status: 'resolved',
      created: '1 week ago',
      priority: 'medium'
    },
    {
      id: 3,
      title: 'Window lock replacement',
      status: 'resolved',
      created: '2 weeks ago',
      priority: 'low'
    }
  ]

  const contracts = [
    {
      id: 1,
      building: 'Sunset Apartments',
      unit: 'Unit 4B',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      status: 'active'
    },
    {
      id: 2,
      building: 'Downtown Residence',
      unit: 'Unit 2A',
      startDate: '2024-06-01',
      endDate: '2025-05-31',
      status: 'active'
    }
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress':
        return 'text-yellow-600 bg-yellow-100'
      case 'resolved':
        return 'text-green-600 bg-green-100'
      case 'pending':
        return 'text-gray-600 bg-gray-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-600'
      case 'medium':
        return 'text-yellow-600'
      case 'low':
        return 'text-green-600'
      default:
        return 'text-gray-600'
    }
  }

  return (
    <PrivateLayout>
      <div className="p-6">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome back, {session.user.name || 'Tenant'}
          </h1>
          <p className="text-gray-600">
            Manage your rental information and submit maintenance requests.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {stats.map((stat) => (
            <div key={stat.name} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                  <p className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</p>
                  <p className="text-sm text-gray-500">{stat.description}</p>
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
          {/* Recent Tickets */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Tickets</h2>
              <button className="text-sm text-blue-600 hover:text-blue-700 transition-colors">
                Create New
              </button>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {recentTickets.map((ticket) => (
                  <div key={ticket.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-medium text-gray-900">{ticket.title}</h3>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(ticket.status)}`}>
                        {ticket.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>{ticket.created}</span>
                      <span className={`font-medium ${getPriorityColor(ticket.priority)}`}>
                        {ticket.priority} priority
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Active Contracts */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">My Contracts</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {contracts.map((contract) => (
                  <div key={contract.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-medium text-gray-900">{contract.building}</h3>
                        <p className="text-sm text-gray-600">{contract.unit}</p>
                      </div>
                      <span className="px-2 py-1 text-xs font-medium text-green-600 bg-green-100 rounded-full">
                        {contract.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      <p>
                        {new Date(contract.startDate).toLocaleDateString()} - {new Date(contract.endDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <button className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                <TicketIcon className="w-8 h-8 text-blue-600 mb-2" />
                <span className="text-sm font-medium text-gray-900">Submit Ticket</span>
              </button>
              <button className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                <DocumentTextIcon className="w-8 h-8 text-blue-600 mb-2" />
                <span className="text-sm font-medium text-gray-900">View Contracts</span>
              </button>
              <button className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                <ChartBarIcon className="w-8 h-8 text-blue-600 mb-2" />
                <span className="text-sm font-medium text-gray-900">Usage Report</span>
              </button>
              <button className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                <ClockIcon className="w-8 h-8 text-blue-600 mb-2" />
                <span className="text-sm font-medium text-gray-900">History</span>
              </button>
            </div>
          </div>
        </div>

        {/* Announcements */}
        <div className="mt-6 bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Announcements</h2>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              <div className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg">
                <ExclamationTriangleIcon className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    Scheduled maintenance this weekend
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    Water will be shut off on Saturday from 9 AM to 12 PM for pipe maintenance.
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-3 bg-green-50 rounded-lg">
                <CheckCircleIcon className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-900">
                    New parking policy in effect
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    Please review the updated parking guidelines in your tenant portal.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PrivateLayout>
  )
}