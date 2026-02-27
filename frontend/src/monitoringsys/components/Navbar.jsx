import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity } from 'lucide-react';

const Navbar = () => {
    const location = useLocation();

    return (
        <nav className="bg-transparent border-b border-white/10 px-6 py-4 mb-6 -mt-8 -mx-8 rounded-t-lg">
            <div className="flex items-center justify-between max-w-7xl mx-auto">
                <div className="flex items-center gap-2 text-xl font-bold text-blue-600">
                    <Activity size={24} />
                    <span>System Monitor</span>
                </div>
                <div className="flex gap-4">
                    <Link to="/metrics" className={`text-sm font-medium transition-colors${location.pathname === '/metrics' ? 'text-blue-600' : 'text-gray-400 hover:text-white'}`}>Dashboard</Link>
                    <Link to="/metrics/alert-rules" className={`text-sm font-medium transition-colors${location.pathname === '/metrics/alert-rules' ? 'text-blue-600' : 'text-gray-400 hover:text-white'}`}>Alert Rules</Link>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
