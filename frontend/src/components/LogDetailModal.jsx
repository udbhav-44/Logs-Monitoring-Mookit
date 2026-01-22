import React from 'react';

const LogDetailModal = ({ log, onClose }) => {
  if (!log) return null;

  const keyLabels = {
    ip: 'IP',
    uid: 'UID',
    url: 'URL',
    method: 'Method',
    status: 'Status',
    responseSize: 'Response Size',
    responseTimeMs: 'Response Time (ms)',
    userAgent: 'User Agent',
    referrer: 'Referrer',
    message: 'Message',
    course: 'Course'
  };

  const longFields = new Set(['url', 'userAgent', 'referrer', 'message']);

  const entries = Object.entries(log.parsedData || {})
    .filter(([_, v]) => v !== undefined && v !== null && v !== '')
    .map(([key, value]) => ({
      key,
      label: keyLabels[key] || key,
      value: String(value),
      fullWidth: longFields.has(key) || String(value).length > 48
    }));

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <p className="text-xs text-gray-500">Log Detail</p>
            <h3 className="text-lg font-semibold text-gray-900">{new Date(log.timestamp).toLocaleString()}</h3>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-900 text-sm px-3 py-1 border border-gray-200 rounded-lg bg-white">
            Close
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500">Source</p>
              <p className="font-semibold text-gray-900 capitalize">{log.sourceType || log.appInfo?.source || 'app'}</p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500">App / VM</p>
              <p className="font-semibold text-gray-900">{log.appInfo?.name || 'unknown'} / {log.appInfo?.vmId || '-'}</p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500">IP</p>
              <p className="font-mono text-sm text-gray-900 break-all">{log.parsedData?.ip || '—'}</p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500">UID</p>
              <p className="font-mono text-sm text-gray-900 break-all">{log.parsedData?.uid || '—'}</p>
            </div>
          </div>

          <div className="border border-gray-100 rounded-lg p-4 bg-gray-50">
            <p className="text-xs text-gray-500 mb-2">Raw Message</p>
            <pre className="text-xs text-gray-800 whitespace-pre-wrap break-words font-mono leading-relaxed">{log.rawMessage}</pre>
          </div>

          <div className="border border-gray-100 rounded-lg p-4 bg-gray-50">
            <p className="text-xs text-gray-500 mb-2">Parsed Fields</p>
            {entries.length === 0 && <p className="text-sm text-gray-500">No parsed fields found.</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {entries.map((entry) => (
                <div key={entry.key} className={`space-y-1 ${entry.fullWidth ? 'md:col-span-2' : ''}`}>
                  <p className="text-xs text-gray-500">{entry.label}</p>
                  <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 font-mono break-words leading-relaxed">
                    {entry.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LogDetailModal;
