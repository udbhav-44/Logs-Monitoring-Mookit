import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import LogExplorer from './pages/LogExplorer';
import UserActivity from './pages/UserActivity';
import Security from './pages/Security';
import Applications from './pages/Applications';
import MonitoringDashboard from './monitoringsys/pages/Dashboard';
import VMDetails from './monitoringsys/pages/VMDetails';
import AlertRulesConfig from './monitoringsys/components/AlertRulesConfig';
import MonitoringNavbar from './monitoringsys/components/Navbar';

// Placeholder components until fully implemented
const Placeholder = ({ title }) => (
  <div>
    <h1 className="text-2xl font-bold mb-4">{title}</h1>
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <p className="text-gray-500">Component under construction.</p>
    </div>
  </div>
);

import Login from './pages/Login';
import PrivateRoute from './components/PrivateRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/logs" element={<LogExplorer />} />
                  <Route path="/activity" element={<UserActivity />} />
                  <Route path="/security" element={<Security />} />
                  <Route path="/applications" element={<Applications />} />
                  <Route path="/metrics" element={<><MonitoringNavbar /><MonitoringDashboard /></>} />
                  <Route path="/metrics/vm/:id" element={<><MonitoringNavbar /><VMDetails /></>} />
                  <Route path="/metrics/alert-rules" element={<><MonitoringNavbar /><AlertRulesConfig /></>} />
                </Routes>
              </Layout>
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
