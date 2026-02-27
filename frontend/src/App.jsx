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

// Placeholder components until fully implemented
const Placeholder = ({ title }) => (
  <div>
    <h1 className="text-2xl font-bold mb-4">{title}</h1>
    <div className="glass-card p-6 rounded-lg border border-white/10">
      <p className="text-gray-400">Component under construction.</p>
    </div>
  </div>
);

import Login from './pages/Login';
import PrivateRoute from './components/PrivateRoute';
import { Toaster } from './components/Toast';

function App() {
  return (
    <>
      <Toaster />
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
                    <Route path="/metrics" element={<MonitoringDashboard />} />
                    <Route path="/metrics/vm/:id" element={<VMDetails />} />
                    <Route path="/metrics/alert-rules" element={<AlertRulesConfig />} />
                  </Routes>
                </Layout>
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
