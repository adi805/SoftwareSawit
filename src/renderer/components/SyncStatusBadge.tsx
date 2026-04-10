import React, { useState } from 'react';

export type SyncStatusValue = 'synced' | 'pending' | 'failed' | 'conflict';

interface SyncStatusBadgeProps {
  /** Current sync status of the transaction */
  status: SyncStatusValue;
  /** Optional last sync timestamp for tooltip */
  lastSyncAt?: string | null;
  /** Optional error message for failed/conflict status */
  errorMessage?: string | null;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show tooltip on hover */
  showTooltip?: boolean;
}

const statusConfig = {
  synced: {
    label: 'Tersinkronkan',
    color: 'green',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    borderColor: 'border-green-300',
    icon: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  pending: {
    label: 'Pending',
    color: 'yellow',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-700',
    borderColor: 'border-yellow-300',
    icon: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  failed: {
    label: 'Gagal',
    color: 'red',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    borderColor: 'border-red-300',
    icon: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  conflict: {
    label: 'Konflik',
    color: 'orange',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
    borderColor: 'border-orange-300',
    icon: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
};

const sizeClasses = {
  sm: {
    badge: 'px-1.5 py-0.5 text-xs',
    icon: 'w-3 h-3',
  },
  md: {
    badge: 'px-2 py-1 text-xs',
    icon: 'w-3.5 h-3.5',
  },
  lg: {
    badge: 'px-3 py-1.5 text-sm',
    icon: 'w-4 h-4',
  },
};

function formatTimestamp(dateString: string | null | undefined): string {
  if (!dateString) return 'Belum pernah';
  return new Date(dateString).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * SyncStatusBadge component displays sync status with colored badge and tooltip
 * 
 * Features:
 * - Shows colored badge (green/yellow/red/orange) based on status
 * - Displays icon and label
 * - Shows tooltip on hover with details (last sync time, error message)
 */
export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({
  status,
  lastSyncAt,
  errorMessage,
  size = 'md',
  showTooltip = true,
}) => {
  const [showTooltipContent, setShowTooltipContent] = useState(false);
  
  const config = statusConfig[status] || statusConfig.pending;
  const sizeClass = sizeClasses[size] || sizeClasses.md;

  // Build tooltip content
  const tooltipContent = () => {
    const lines = [
      `Status: ${config.label}`,
    ];
    
    if (lastSyncAt) {
      lines.push(`Terakhir sync: ${formatTimestamp(lastSyncAt)}`);
    } else {
      lines.push('Terakhir sync: Belum pernah');
    }
    
    if (errorMessage) {
      lines.push(`Error: ${errorMessage}`);
    }
    
    return lines.join('\n');
  };

  return (
    <div className="relative inline-block">
      <span
        className={`inline-flex items-center gap-1 rounded-full border font-medium ${config.bgColor} ${config.textColor} ${config.borderColor} ${sizeClass.badge}`}
        onMouseEnter={() => showTooltip && setShowTooltipContent(true)}
        onMouseLeave={() => setShowTooltipContent(false)}
      >
        {config.icon}
        <span>{config.label}</span>
      </span>
      
      {/* Tooltip */}
      {showTooltip && showTooltipContent && (
        <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-pre-line">
          {tooltipContent()}
          {/* Arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
};

/**
 * Compact version of SyncStatusBadge for table cells
 */
export const SyncStatusBadgeCompact: React.FC<{
  status: SyncStatusValue;
  lastSyncAt?: string | null;
  errorMessage?: string | null;
}> = ({ status, lastSyncAt, errorMessage }) => {
  const config = statusConfig[status] || statusConfig.pending;
  
  return (
    <div className="relative group">
      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${config.bgColor} ${config.textColor}`}>
        {config.icon}
      </span>
      
      {/* Tooltip on hover */}
      <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-pre-line opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="font-medium mb-1">{config.label}</div>
        {lastSyncAt && <div>Terakhir: {formatTimestamp(lastSyncAt)}</div>}
        {errorMessage && <div className="text-red-300 mt-1">Error: {errorMessage}</div>}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
      </div>
    </div>
  );
};

export default SyncStatusBadge;
