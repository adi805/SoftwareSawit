import React, { useRef, useEffect, useState } from 'react';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface LogWindowProps {
  logs: LogEntry[];
  onCopy: (entry: LogEntry) => void;
  onClear: () => void;
}

const LogWindow: React.FC<LogWindowProps> = ({ logs, onCopy, onClear }) => {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<string>('ALL');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Format timestamp for display
  const formatTimestamp = (isoString: string): string => {
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  };

  // Get color class for log level
  const getLevelColor = (level: string): string => {
    switch (level.toUpperCase()) {
      case 'ERROR':
        return 'text-red-600';
      case 'WARN':
      case 'WARNING':
        return 'text-amber-600';
      case 'INFO':
        return 'text-blue-600';
      case 'DEBUG':
        return 'text-purple-600';
      default:
        return 'text-gray-600';
    }
  };

  // Get background color for log level
  const getLevelBgColor = (level: string): string => {
    switch (level.toUpperCase()) {
      case 'ERROR':
        return 'bg-red-50';
      case 'WARN':
      case 'WARNING':
        return 'bg-amber-50';
      case 'INFO':
        return 'bg-blue-50';
      case 'DEBUG':
        return 'bg-purple-50';
      default:
        return 'bg-gray-50';
    }
  };

  // Handle copy with visual feedback
  const handleCopy = (entry: LogEntry, index: number) => {
    onCopy(entry);
    setCopiedId(index);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Handle Ctrl+C on selected log entry
  const handleKeyDown = (e: React.KeyboardEvent, entry: LogEntry, index: number) => {
    if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      handleCopy(entry, index);
    }
  };

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    if (filter === 'ALL') return true;
    return log.level.toUpperCase() === filter;
  });

  // Copy all logs
  const handleCopyAll = () => {
    const allText = logs
      .map((log) => `[${formatTimestamp(log.timestamp)}] [${log.level}] ${log.message}`)
      .join('\n');
    navigator.clipboard.writeText(allText);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-gray-700">Log Window</h2>
          <button
            onClick={onClear}
            className="px-3 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded transition-colors"
            title="Clear logs"
          >
            Clear
          </button>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Filter:</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All</option>
            <option value="INFO">Info</option>
            <option value="WARN">Warn</option>
            <option value="ERROR">Error</option>
            <option value="DEBUG">Debug</option>
          </select>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={logContainerRef}
        className="flex-1 overflow-y-auto log-window p-2 space-y-1"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-center text-gray-400 py-8 text-sm">
            No log entries
          </div>
        ) : (
          filteredLogs.map((log, index) => (
            <div
              key={index}
              className={`p-2 rounded text-xs selectable cursor-pointer transition-colors ${getLevelBgColor(log.level)} hover:bg-opacity-75`}
              onClick={() => handleCopy(log, index)}
              onKeyDown={(e) => handleKeyDown(e, log, index)}
              tabIndex={0}
              title="Click or press Ctrl+C to copy"
            >
              <div className="flex items-start gap-2">
                <span className="text-gray-400 whitespace-nowrap">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span className={`font-medium whitespace-nowrap ${getLevelColor(log.level)}`}>
                  [{log.level}]
                </span>
                <span className="text-gray-700 flex-1 break-all">
                  {log.message}
                </span>
                {copiedId === index && (
                  <span className="text-green-600 text-xs">Copied!</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer with copy all button */}
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
        <button
          onClick={handleCopyAll}
          className="w-full px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
        >
          Copy All Logs
        </button>
      </div>
    </div>
  );
};

export default LogWindow;
