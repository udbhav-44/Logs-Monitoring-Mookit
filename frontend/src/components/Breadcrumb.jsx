import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const routeNames = {
    '/': 'Overview',
    '/logs': 'Log Explorer',
    '/activity': 'User Activity',
    '/applications': 'Applications',
    '/security': 'Security',
    '/metrics': 'System Metrics',
    '/login': 'Login'
};

const Breadcrumb = () => {
    const location = useLocation();
    const pathnames = location.pathname.split('/').filter((x) => x);

    // If we are at root, or login, don't show breadcrumbs that are redundant
    if (location.pathname === '/' || location.pathname === '/login') {
        return <div className="h-6 mb-2"></div>; // Placeholder to maintain spacing
    }

    return (
        <nav className="flex items-center text-sm font-medium text-gray-400 mb-6" aria-label="Breadcrumb">
            <Link
                to="/"
                className="flex items-center hover:text-blue-400 transition-colors"
            >
                <Home className="w-4 h-4 mr-1" />
                Overview
            </Link>

            {pathnames.map((value, index) => {
                const last = index === pathnames.length - 1;
                const to = `/${pathnames.slice(0, index + 1).join('/')}`;

                // Try to find a human-readable name, or capitalize the raw path
                const label = routeNames[to] ||
                    (value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, ' '));

                return (
                    <div key={to} className="flex items-center">
                        <ChevronRight className="w-4 h-4 mx-1 text-gray-400" />
                        {last ? (
                            <span className="text-white font-semibold" aria-current="page">
                                {label}
                            </span>
                        ) : (
                            <Link to={to} className="hover:text-blue-400 transition-colors">
                                {label}
                            </Link>
                        )}
                    </div>
                );
            })}
        </nav>
    );
};

export default Breadcrumb;
