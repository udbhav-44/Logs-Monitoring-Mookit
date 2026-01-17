import React, { useState, useEffect } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { searchLogs } from '../lib/api';
import LogDetailModal from '../components/LogDetailModal';

const PAGE_SIZE = 25;

const LogExplorer = () => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    ip: '',
    uid: '',
    status: '',
    start: '',
    end: '',
    sourceType: '',
    app: '',
    vmId: '',
    search: ''
  });

  const fetchLogs = async (nextPage = page, overrideFilters = null) => {
    setLoading(true);
    try {
      const effectiveFilters = overrideFilters ? { ...overrideFilters } : { ...filters };
      const res = await searchLogs({
        page: nextPage,
        limit: PAGE_SIZE,
        ...Object.fromEntries(Object.entries(effectiveFilters).filter(([_, v]) => v))
      });
      setLogs(res.results || []);
      setTotal(res.total || 0);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Seed filters from URL on first load
    const initialFilters = { ...filters };
    searchParams.forEach((value, key) => {
      if (key === 'page') {
        setPage(Number(value) || 1);
      } else if (initialFilters[key] !== undefined) {
        initialFilters[key] = value;
      }
    });
    setFilters(initialFilters);
    fetchLogs(Number(searchParams.get('page')) || 1, initialFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchLogs(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    const params = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v));
    setSearchParams({ ...params, page: 1 });
    fetchLogs(1);
  };

  const quickFilter = (key, value) => {
    if (!value) return;
    const updated = { ...filters, [key]: value };
    setFilters(updated);
    setPage(1);
    setSearchParams({ ...Object.fromEntries(Object.entries(updated).filter(([_, v]) => v)), page: 1 });
    fetchLogs(1, updated);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Log Explorer</h1>
          <p className="text-gray-500">Search by UID, IP, status, source, and time range.</p>
        </div>
        <button onClick={() => fetchLogs(page)} className="text-gray-600 hover:text-indigo-600 flex items-center gap-2">
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <input name="ip" placeholder="IP Address" className="px-4 py-2 border rounded-lg" value={filters.ip} onChange={handleFilterChange} />
          <input name="uid" placeholder="User ID" className="px-4 py-2 border rounded-lg" value={filters.uid} onChange={handleFilterChange} />
          <input name="status" placeholder="Status (e.g. 200)" className="px-4 py-2 border rounded-lg" value={filters.status} onChange={handleFilterChange} />
          <select name="sourceType" value={filters.sourceType} onChange={handleFilterChange} className="px-4 py-2 border rounded-lg">
            <option value="">Source</option>
            <option value="nginx">nginx</option>
            <option value="app">app</option>
            <option value="db">db</option>
          </select>
          <input name="app" placeholder="App Name" className="px-4 py-2 border rounded-lg" value={filters.app} onChange={handleFilterChange} />
          <input name="vmId" placeholder="VM ID" className="px-4 py-2 border rounded-lg" value={filters.vmId} onChange={handleFilterChange} />
          <input name="start" type="datetime-local" className="px-4 py-2 border rounded-lg" value={filters.start} onChange={handleFilterChange} />
          <input name="end" type="datetime-local" className="px-4 py-2 border rounded-lg" value={filters.end} onChange={handleFilterChange} />
          <input name="search" placeholder="Full-text search" className="px-4 py-2 border rounded-lg md:col-span-2" value={filters.search} onChange={handleFilterChange} />
          <div className="md:col-span-2 lg:col-span-2 flex gap-3">
            <button type="submit" className="flex-1 bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 flex items-center justify-center gap-2">
              <Search size={18} /> Search
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
          <div className="flex gap-2">
            <span className="font-bold text-gray-700">{total}</span>
            <span className="text-gray-500">results</span>
          </div>
          {loading && <span className="text-sm text-gray-500">Loading...</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">App / VM</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">URL / Message</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">UID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr
                  key={log._id || `${log.timestamp}-${log.rawMessage}`}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedLog(log)}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3 capitalize text-gray-700">{log.sourceType || log.appInfo?.source || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="font-semibold">{log.appInfo?.name || '-'}</div>
                    <div className="text-xs text-gray-500">{log.appInfo?.vmId || ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                      Number(log.parsedData?.status) >= 500 ? 'bg-red-100 text-red-700' :
                      Number(log.parsedData?.status) >= 400 ? 'bg-orange-100 text-orange-700' :
                      Number(log.parsedData?.status) >= 300 ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'
                    }`}
                      onClick={(e) => { e.stopPropagation(); quickFilter('status', log.parsedData?.status); }}
                    >
                      {log.parsedData?.status || 'N/A'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-600">{log.parsedData?.method || '-'}</td>
                  <td className="px-4 py-3 max-w-xs truncate" title={log.parsedData?.url || log.parsedData?.message}>
                    {log.parsedData?.url || log.parsedData?.message || log.rawMessage}
                  </td>
                  <td
                    className="px-4 py-3 text-gray-500 underline-offset-2"
                    onClick={(e) => { e.stopPropagation(); quickFilter('ip', log.parsedData?.ip); }}
                  >
                    {log.parsedData?.ip || '-'}
                  </td>
                  <td
                    className="px-4 py-3 text-gray-500 underline-offset-2"
                    onClick={(e) => { e.stopPropagation(); quickFilter('uid', log.parsedData?.uid); }}
                  >
                    {log.parsedData?.uid || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {logs.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-400">No logs found matching criteria.</div>
        )}

        <div className="p-4 border-t border-gray-100 flex justify-between items-center">
          <button
            disabled={page === 1}
            onClick={() => {
              const next = Math.max(1, page - 1);
              setPage(next);
              setSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v)), page: next });
            }}
            className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => {
              const next = page + 1;
              setPage(next);
              setSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v)), page: next });
            }}
            className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {selectedLog && (
        <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
};

export default LogExplorer;
