import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, List, User, ShieldAlert, Activity, Layers } from 'lucide-react';

const Layout = ({ children }) => {
    const location = useLocation();

    const navItems = [
        { path: '/', label: 'Overview', icon: <LayoutDashboard size={20} /> },
        { path: '/logs', label: 'Log Explorer', icon: <List size={20} /> },
        { path: '/activity', label: 'User Activity', icon: <User size={20} /> },
        { path: '/applications', label: 'Applications', icon: <Layers size={20} /> },
        { path: '/security', label: 'Security', icon: <ShieldAlert size={20} /> },
    ];

    return (
        <div className="flex h-screen bg-gray-50">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-gray-200">
                <div className="p-6 border-b border-gray-100">
                    <div className="flex items-center gap-2 font-bold text-xl text-indigo-600">
                        <Activity />
                        <span>OOA Log Monitor</span>
                    </div>
                </div>
                <nav className="p-4 space-y-1">
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${location.pathname === item.path
                                    ? 'bg-indigo-50 text-indigo-700'
                                    : 'text-gray-600 hover:bg-gray-50'
                                }`}
                        >
                            {item.icon}
                            {item.label}
                        </Link>
                    ))}
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto">
                <div className="p-8">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;
