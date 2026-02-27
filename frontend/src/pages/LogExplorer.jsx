import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { searchLogs } from '../lib/api';
import LogDetailModal from '../components/LogDetailModal';

const PAGE_SIZE = 25;

const HighlightText = ({ text, highlight }) => {
  if (!highlight?.trim() || !text) return <>{text}</>;
  const parts = String(text).split(new RegExp(`(${highlight})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 text-white rounded px-0.5">{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
};

const SortableHeader = ({ label, field, currentSortBy, currentSortOrder, onSort, children }) => {
  const isSorted = currentSortBy === field;
  return (
    <th className="px-4 py-3 cursor-pointer hover:bg-gray-200 transition-colors select-none" onClick={() => onSort(field)}>
      <div className="flex items-center gap-1">
        {label}
        {children}
        {isSorted && (
          <span className="text-gray-400 text-xs ml-1">
            {currentSortOrder === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </th>
  )
}

const LogExplorer = () => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const skipPageFetchRef = useRef(true);
  const [filters, setFilters] = useState({
    ip: '',
    uid: '',
    course: '',
    status: '',
    start: '',
    end: '',
    sourceType: '',
    app: '',
    vmId: '',
    search: '',
    range: 'all',
    sortBy: 'timestamp',
    sortOrder: 'desc'
  });

  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const fetchLogs = async (nextPage = page, overrideFilters = null) => {
    setLoading(true);
    setLogs([]); // Force clear to prevent appending illusion
    try {
      console.log('Fetching logs for page:', nextPage);
      const effectiveFilters = overrideFilters ? { ...overrideFilters } : { ...filters };
      const res = await searchLogs({
        page: nextPage,
        limit: pageSize,
        ...Object.fromEntries(Object.entries(effectiveFilters).filter(([_, v]) => v))
      });
      console.log('Fetched logs:', res.results?.length);
      setLogs(res.results || []);
      setTotal(res.total || 0);
      window.scrollTo(0, 0); // Scroll to top
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Seed filters from URL on first load
    const initialFilters = { ...filters };
    const initialPage = Number(searchParams.get('page')) || 1;
    searchParams.forEach((value, key) => {
      if (key !== 'page' && initialFilters[key] !== undefined) {
        initialFilters[key] = value;
      }
    });
    setFilters(initialFilters);
    setPage(initialPage);
    fetchLogs(initialPage, initialFilters).finally(() => {
      skipPageFetchRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (skipPageFetchRef.current) return;
    fetchLogs(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

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

  const handleSort = (field) => {
    setFilters(prev => {
      const isDesc = prev.sortBy === field ? prev.sortOrder === 'desc' : false;
      const newOrder = prev.sortBy === field && isDesc ? 'asc' : 'desc';
      const updated = { ...prev, sortBy: field, sortOrder: newOrder };
      setSearchParams({ ...Object.fromEntries(Object.entries(updated).filter(([_, v]) => v)), page: 1 });
      setPage(1);
      setTimeout(() => fetchLogs(1, updated), 0);
      return updated;
    });
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Log Explorer</h1>
          <p className="text-gray-400">Search by UID, course, IP, status, source, and time range.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="border rounded-lg text-sm px-3 py-2 glass-card"
          >
            {[25, 50, 100, 200, 500].map(size => (
              <option key={size} value={size}>{size} per page</option>
            ))}
          </select>
          <button onClick={() => fetchLogs(page)} className="text-gray-300 hover:text-blue-600 flex items-center gap-2">
            <RefreshCw size={18} />
            Refresh
          </button>
        </div>
      </div>

      <div className="glass-card p-4 rounded-xl border border-white/10">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <input name="ip" placeholder="IP Address" className="px-4 py-2 border rounded-lg" value={filters.ip} onChange={handleFilterChange} />
          <input name="uid" placeholder="User ID" className="px-4 py-2 border rounded-lg" value={filters.uid} onChange={handleFilterChange} />
          <input name="course" placeholder="Course Code" className="px-4 py-2 border rounded-lg" value={filters.course} onChange={handleFilterChange} />

          <select name="status" value={filters.status} onChange={handleFilterChange} className="px-4 py-2 border rounded-lg text-gray-200">
            <option value="">Status (All)</option>
            <option value="200">200 OK</option>
            <option value="201">201 Created</option>
            <option value="400">400 Bad Request</option>
            <option value="401">401 Unauthorized</option>
            <option value="403">403 Forbidden</option>
            <option value="404">404 Not Found</option>
            <option value="500">500 Internal Error</option>
            <option value="502">502 Bad Gateway</option>
            <option value="503">503 Service Unavailable</option>
          </select>

          <select name="sourceType" value={filters.sourceType} onChange={handleFilterChange} className="px-4 py-2 border rounded-lg text-gray-200">
            <option value="">Source</option>
            <option value="nginx">nginx</option>
            <option value="app">app</option>
            <option value="db">db</option>
          </select>
          <select name="range" value={filters.range} onChange={handleFilterChange} className="px-4 py-2 border rounded-lg glass-panel/5 border-white/10 font-medium">
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>
          <input name="app" placeholder="App Name" className="px-4 py-2 border rounded-lg" value={filters.app} onChange={handleFilterChange} />
          <input name="vmId" placeholder="VM ID" className="px-4 py-2 border rounded-lg" value={filters.vmId} onChange={handleFilterChange} />

          <div className="relative">
            <span className="absolute -top-2 left-2 bg-transparent px-1 text-[10px] font-semibold text-gray-400">Start (Local Time)</span>
            <input name="start" type="datetime-local" className="w-full px-4 py-2 border rounded-lg text-gray-200" value={filters.start} onChange={handleFilterChange} />
          </div>

          <div className="relative">
            <span className="absolute -top-2 left-2 bg-transparent px-1 text-[10px] font-semibold text-gray-400">End (Local Time)</span>
            <input name="end" type="datetime-local" className="w-full px-4 py-2 border rounded-lg text-gray-200" value={filters.end} onChange={handleFilterChange} />
          </div>

          <input name="search" placeholder="Full-text search" className="px-4 py-2 border rounded-lg md:col-span-2" value={filters.search} onChange={handleFilterChange} />
          <div className="md:col-span-2 lg:col-span-2 flex gap-3">
            <button type="submit" className="flex-1 glass-button text-white px-6 py-2 rounded-lg font-medium hover:glass-panel/20 flex items-center justify-center gap-2">
              <Search size={18} /> Search
            </button>
          </div>
        </form>
      </div>

      <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <div className="flex gap-2">
            <span className="font-bold text-gray-200">{total}</span>
            <span className="text-gray-400">results</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 1}
              onClick={() => {
                const next = Math.max(1, page - 1);
                setPage(next);
                setSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v)), page: next });
              }}
              className="px-3 py-1 border rounded text-sm hover:glass-panel/10 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-300">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => {
                const next = page + 1;
                setPage(next);
                setSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v)), page: next });
              }}
              className="px-3 py-1 border rounded text-sm hover:glass-panel/10 disabled:opacity-50"
            >
              Next
            </button>
          </div>
          {loading && <span className="text-sm text-gray-400">Loading...</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="glass-panel/5 text-gray-300 font-medium">
              <tr>
                <SortableHeader label="Timestamp" field="timestamp" currentSortBy={filters.sortBy} currentSortOrder={filters.sortOrder} onSort={handleSort}>
                  <span className="text-xs text-gray-400 font-normal">(Local)</span>
                </SortableHeader>
                <th className="px-4 py-3">Source</th>
                <SortableHeader label="App / VM" field="app" currentSortBy={filters.sortBy} currentSortOrder={filters.sortOrder} onSort={handleSort} />
                <SortableHeader label="Status" field="status" currentSortBy={filters.sortBy} currentSortOrder={filters.sortOrder} onSort={handleSort} />
                <SortableHeader label="Method" field="method" currentSortBy={filters.sortBy} currentSortOrder={filters.sortOrder} onSort={handleSort} />
                <th className="px-4 py-3">URL / Message</th>
                <SortableHeader label="Course" field="course" currentSortBy={filters.sortBy} currentSortOrder={filters.sortOrder} onSort={handleSort} />
                <SortableHeader label="IP" field="ip" currentSortBy={filters.sortBy} currentSortOrder={filters.sortOrder} onSort={handleSort} />
                <SortableHeader label="UID" field="uid" currentSortBy={filters.sortBy} currentSortOrder={filters.sortOrder} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr
                  key={log._id || `${log.timestamp}-${log.rawMessage}`}
                  className="hover:glass-panel/10 cursor-pointer"
                  onClick={() => setSelectedLog(log)}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-gray-400">{new Date(log.timestamp.endsWith('Z') ? log.timestamp : log.timestamp + 'Z').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                  <td className="px-4 py-3 capitalize text-gray-200">{log.sourceType || log.appInfo?.source || '-'}</td>
                  <td className="px-4 py-3 text-gray-200">
                    <div className="font-semibold">{log.appInfo?.name || '-'}</div>
                    <div className="text-xs text-gray-400">{log.appInfo?.vmId || ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium${Number(log.parsedData?.status) >= 500 ? 'bg-red-100 text-red-700' : Number(log.parsedData?.status) >= 400 ? 'bg-orange-100 text-orange-700' : Number(log.parsedData?.status) >= 300 ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700' }`}
                      onClick={(e) => { e.stopPropagation(); quickFilter('status', log.parsedData?.status); }}
                    >
                      {log.parsedData?.status || 'N/A'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-300">
                    <HighlightText text={log.parsedData?.method || '-'} highlight={filters.search} />
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate" title={log.parsedData?.url || log.parsedData?.message}>
                    <HighlightText text={log.parsedData?.url || log.parsedData?.message || log.rawMessage} highlight={filters.search} />
                  </td>
                  <td
                    className="px-4 py-3 text-gray-400 underline-offset-2"
                    onClick={(e) => { e.stopPropagation(); quickFilter('course', log.parsedData?.course); }}
                  >
                    <HighlightText text={log.parsedData?.course || '-'} highlight={filters.search} />
                  </td>
                  <td
                    className="px-4 py-3 text-gray-400 underline-offset-2"
                    onClick={(e) => { e.stopPropagation(); quickFilter('ip', log.parsedData?.ip); }}
                  >
                    <HighlightText text={log.parsedData?.ip || '-'} highlight={filters.search} />
                  </td>
                  <td
                    className="px-4 py-3 text-gray-400 underline-offset-2"
                    onClick={(e) => { e.stopPropagation(); quickFilter('uid', log.parsedData?.uid); }}
                  >
                    <HighlightText text={log.parsedData?.uid || '-'} highlight={filters.search} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {logs.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-400">No logs found matching criteria.</div>
        )}

        <div className="p-4 border-t border-white/10 flex justify-between items-center">
          <button
            disabled={page === 1}
            onClick={() => {
              const next = Math.max(1, page - 1);
              setPage(next);
              setSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v)), page: next });
            }}
            className="px-4 py-2 border rounded hover:glass-panel/10 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-gray-300">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => {
              const next = page + 1;
              setPage(next);
              setSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v)), page: next });
            }}
            className="px-4 py-2 border rounded hover:glass-panel/10 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {selectedLog && (
        <LogDetailModal
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
          onPrev={
            logs.indexOf(selectedLog) > 0
              ? () => setSelectedLog(logs[logs.indexOf(selectedLog) - 1])
              : null
          }
          onNext={
            logs.indexOf(selectedLog) !== -1 && logs.indexOf(selectedLog) < logs.length - 1
              ? () => setSelectedLog(logs[logs.indexOf(selectedLog) + 1])
              : null
          }
        />
      )}
    </div>
  );
};

export default LogExplorer;
