'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-provider'
import { Button } from '@/components/ui/button'
import { Calendar, List, PlusCircle, Settings, LogOut, Menu, X } from 'lucide-react'

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { signOut, user, loading } = useAuth()
    const pathname = usePathname()
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

    const navigation = [
        { name: 'スケジュール一覧', href: '/schedule', icon: List },
        { name: 'カレンダー', href: '/calendar', icon: Calendar },
        { name: '予定登録', href: '/schedule/new', icon: PlusCircle },
        { name: '設定', href: '/admin', icon: Settings },
    ]

    const handleSignOut = async () => {
        await signOut()
    }

    // Show loading state while auth is initializing
    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-gray-500">読み込み中...</div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Header */}
            <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        <div className="flex">
                            <div className="flex-shrink-0 flex items-center">
                                <span className="text-xl font-bold text-gray-900 dark:text-white">搬送アシスト</span>
                            </div>
                            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                                {navigation.map((item) => {
                                    const isActive = pathname.startsWith(item.href)
                                    return (
                                        <Link
                                            key={item.name}
                                            href={item.href}
                                            className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${isActive
                                                ? 'border-indigo-500 text-gray-900 dark:text-white'
                                                : 'border-transparent text-gray-500 dark:text-gray-300 hover:border-gray-300 hover:text-gray-700 dark:hover:text-white'
                                                }`}
                                        >
                                            <item.icon className="h-4 w-4 mr-2" />
                                            {item.name}
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                        <div className="hidden sm:ml-6 sm:flex sm:items-center">
                            <div className="ml-3 relative">
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</span>
                                    <Button variant="ghost" size="sm" onClick={handleSignOut}>
                                        <LogOut className="h-4 w-4 mr-2" />
                                        ログアウト
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <div className="-mr-2 flex items-center sm:hidden">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            >
                                {isMobileMenuOpen ? (
                                    <X className="h-6 w-6" />
                                ) : (
                                    <Menu className="h-6 w-6" />
                                )}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Mobile menu */}
                {isMobileMenuOpen && (
                    <div className="sm:hidden">
                        <div className="pt-2 pb-3 space-y-1">
                            {navigation.map((item) => {
                                const isActive = pathname.startsWith(item.href)
                                return (
                                    <Link
                                        key={item.name}
                                        href={item.href}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className={`block pl-3 pr-4 py-2 border-l-4 text-base font-medium ${isActive
                                            ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200'
                                            : 'border-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 hover:text-gray-800'
                                            }`}
                                    >
                                        <div className="flex items-center">
                                            <item.icon className="h-5 w-5 mr-3" />
                                            {item.name}
                                        </div>
                                    </Link>
                                )
                            })}
                        </div>
                        <div className="pt-4 pb-4 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center px-4">
                                <div className="ml-3">
                                    <div className="text-base font-medium text-gray-800 dark:text-white">
                                        {user?.email}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 space-y-1">
                                <Button
                                    variant="ghost"
                                    className="w-full justify-start pl-4"
                                    onClick={handleSignOut}
                                >
                                    <LogOut className="h-5 w-5 mr-3" />
                                    ログアウト
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </header>

            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                {children}
            </main>
        </div>
    )
}
