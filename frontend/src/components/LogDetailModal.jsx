import React from 'react';

const LogDetailModal = ({ log, onClose }) => {
  if (!log) return null;

  const entries = Object.entries(log.parsedData || {}).filter(([_, v]) => v !== undefined && v !== null && v !== '');

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <p className="text-xs text-gray-500">Log Detail</p>
            <h3 className="text-lg font-semibold text-gray-900">{new Date(log.timestamp).toLocaleString()}</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-sm px-3 py-1 border rounded-lg">
            Close
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500">Source</p>
              <p className="font-medium text-gray-900 capitalize">{log.sourceType || log.appInfo?.source || 'app'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">App / VM</p>
              <p className="font-medium text-gray-900">{log.appInfo?.name || 'unknown'} / {log.appInfo?.vmId || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">IP</p>
              <p className="font-medium text-gray-900">{log.parsedData?.ip || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">UID</p>
              <p className="font-medium text-gray-900">{log.parsedData?.uid || '—'}</p>
            </div>
          </div>

          <div className="border rounded-lg p-3 bg-gray-50">
            <p className="text-xs text-gray-500 mb-1">Raw Message</p>
            <pre className="text-xs text-gray-800 whitespace-pre-wrap break-words">{log.rawMessage}</pre>
          </div>

          <div className="border rounded-lg p-3 bg-gray-50">
            <p className="text-xs text-gray-500 mb-1">Parsed Fields</p>
            <div className="grid grid-cols-2 gap-2">
              {entries.length === 0 && <p className="text-sm text-gray-500">No parsed fields found.</p>}
              {entries.map(([key, value]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-gray-600">{key}</span>
                  <span className="font-mono text-gray-900 text-right">{String(value)}</span>
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
