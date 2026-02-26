import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    FileText,
    Activity,
    Shield,
    AppWindow,
    LogOut,
    Server,
    BellRing,
    Menu,
    X
} from 'lucide-react';
import anime from 'animejs';
import Breadcrumb from './Breadcrumb';

const Layout = ({ children }) => {
    const navigate = useNavigate();
    const navRef = useRef(null);
    const logoRef = useRef(null);
    const logoutRef = useRef(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const navItems = [
        { path: '/', icon: LayoutDashboard, label: 'Overview' },
        { path: '/logs', icon: FileText, label: 'Log Explorer' },
        { path: '/activity', icon: Activity, label: 'User Activity' },
        { path: '/applications', icon: AppWindow, label: 'Applications' },
        { path: '/security', icon: Shield, label: 'Security' },
        { path: '/metrics', icon: Server, label: 'System Metrics' },
        { path: '/metrics/alert-rules', icon: BellRing, label: 'Alert Rules' },
    ];

    useEffect(() => {
        // Logo entrance
        anime({
            targets: logoRef.current,
            opacity: [0, 1],
            translateX: [-16, 0],
            duration: 400,
            easing: 'easeOutQuad',
        });
        // Stagger nav items
        anime({
            targets: navRef.current?.querySelectorAll('.nav-item'),
            opacity: [0, 1],
            translateX: [-14, 0],
            delay: anime.stagger(55, { start: 100 }),
            duration: 350,
            easing: 'easeOutQuad',
        });
        // Logout button — animated separately so it isn't stuck at opacity:0 by .nav-item CSS
        anime({
            targets: logoutRef.current,
            opacity: [0, 1],
            translateX: [-14, 0],
            duration: 350,
            delay: navItems.length * 55 + 150,
            easing: 'easeOutQuad',
        });
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    return (
        <div className="flex h-screen bg-gray-50 flex-col md:flex-row">
            {/* Mobile Header */}
            <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-gray-200 shrink-0">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md shadow-indigo-200">
                        <Activity className="w-4 h-4 text-white" />
                    </div>
                    <h1 className="text-lg font-bold text-gray-900 tracking-tight">
                        OOA Log Monitor
                    </h1>
                </div>
                <button
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="p-2 -mr-2 text-gray-600 hover:text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    aria-label="Open Menu"
                >
                    <Menu className="w-6 h-6" />
                </button>
            </div>

            {/* Mobile Overlay */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-40 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
            )}

            {/* Sidebar */}
            <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                {/* Logo */}
                <div ref={logoRef} className="p-6 flex items-center justify-between" style={{ opacity: 0 }}>
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md shadow-indigo-200">
                            <Activity className="w-4 h-4 text-white" />
                        </div>
                        <h1 className="text-lg font-bold text-gray-900 tracking-tight">
                            OOA Log Monitor
                        </h1>
                    </div>
                    <button
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="md:hidden p-1.5 text-gray-500 hover:text-gray-900 rounded-md hover:bg-gray-100"
                        aria-label="Close Menu"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Nav */}
                <nav ref={navRef} className="flex-1 px-3 space-y-0.5 pb-4">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/'}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={({ isActive }) =>
                                `nav-item flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 group ${isActive
                                    ? 'bg-indigo-50 text-indigo-700'
                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    <span className={`flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150 ${isActive
                                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-300'
                                        : 'text-gray-400 group-hover:text-gray-600'
                                        }`}>
                                        <item.icon className="w-4 h-4" />
                                    </span>
                                    {item.label}
                                    {isActive && (
                                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                    )}
                                </>
                            )}
                        </NavLink>
                    ))}
                </nav>

                {/* Logout */}
                <div className="p-3 border-t border-gray-100">
                    <button
                        ref={logoutRef}
                        onClick={handleLogout}
                        style={{ opacity: 0 }}
                        className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium w-full text-left text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all duration-150 group"
                    >
                        <span className="flex items-center justify-center w-7 h-7 rounded-md text-gray-400 group-hover:text-red-500 transition-colors">
                            <LogOut className="w-4 h-4" />
                        </span>
                        Sign Out
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto">
                <div className="p-8">
                    <Breadcrumb />
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Layout;
