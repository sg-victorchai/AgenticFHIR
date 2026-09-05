// Shared visual building blocks for the Care Coordinator feature
// (CareCoordinatorPage + MissionHistoryPage): icons, status badge,
// timestamp formatting, and the CarePlan review row.
import React from 'react';
import { Link } from 'react-router-dom';
import { useGetResourceByIdQuery } from '../../services/fhir/client';
import { MissionExecutionResult } from '../../types/agent';
import { CarePlan } from 'fhir/r5';

type IconProps = { className?: string };

export const IconSend: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M21 3 3 11l7 2 2 7 9-17Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconClockHistory: React.FC<IconProps> = ({
  className = 'h-4 w-4',
}) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="1.75" />
    <path
      d="M12 9v4l3 2"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9 2.5A9.7 9.7 0 0 1 12 2"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

export const IconCheckCircle: React.FC<IconProps> = ({
  className = 'h-4 w-4',
}) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <path
      d="M8 12.5l2.5 2.5L16 9"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconXCircle: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <path
      d="M9.5 9.5l5 5m0-5-5 5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

export const IconAlertTriangle: React.FC<IconProps> = ({
  className = 'h-4 w-4',
}) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M12 3.5 21 19H3L12 3.5Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    />
    <path
      d="M12 9.5v4M12 16.2h.01"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

export const IconArrowLeft: React.FC<IconProps> = ({
  className = 'h-4 w-4',
}) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M19 12H5M11 5l-6 7 6 7"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconArrowRight: React.FC<IconProps> = ({
  className = 'h-4 w-4',
}) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M5 12h14M13 5l6 7-6 7"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconRefresh: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M5.5 9a7 7 0 0 1 12.2-3.4M18.5 15a7 7 0 0 1-12.2 3.4"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
    <path
      d="M17.5 4.8v4.4h-4.4M6.5 19.2v-4.4h4.4"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconSpinner: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`}>
    <circle
      cx="12"
      cy="12"
      r="9"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeOpacity="0.25"
    />
    <path
      d="M21 12a9 9 0 0 0-9-9"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

export const IconClipboardList: React.FC<IconProps> = ({
  className = 'h-6 w-6',
}) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <rect
      x="6"
      y="4"
      width="12"
      height="17"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M9 4V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5V4"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M9 10.5h6M9 14h6M9 17.5h3.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export const IconInbox: React.FC<IconProps> = ({ className = 'h-6 w-6' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M4 12h4.5l1.5 3h4l1.5-3H20"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M5.5 6 4 12v6a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 18v-6l-1.5-6a1.5 1.5 0 0 0-1.46-1.15H6.96A1.5 1.5 0 0 0 5.5 6Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconUser: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M5.5 20a6.5 6.5 0 0 1 13 0"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

// ─── Status presentation ────────────────────────────────────────────────────

type StatusMeta = {
  label: string;
  badgeClass: string;
  Icon: React.FC<IconProps>;
  iconSpin?: boolean;
};

const STATUS_META: Record<MissionExecutionResult['status'], StatusMeta> = {
  PENDING: {
    label: 'Pending',
    badgeClass: 'text-gray-700 bg-gray-50 border-gray-200',
    Icon: IconClockHistory,
  },
  RUNNING: {
    label: 'Running',
    badgeClass: 'text-blue-700 bg-blue-50 border-blue-200',
    Icon: IconSpinner,
    iconSpin: true,
  },
  AWAITING_INTERVENTION: {
    label: 'Awaiting Review',
    badgeClass: 'text-amber-700 bg-amber-50 border-amber-200',
    Icon: IconAlertTriangle,
  },
  COMPLETED: {
    label: 'Completed',
    badgeClass: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    Icon: IconCheckCircle,
  },
  FAILED: {
    label: 'Failed',
    badgeClass: 'text-red-700 bg-red-50 border-red-200',
    Icon: IconXCircle,
  },
  CANCELLED: {
    label: 'Cancelled',
    badgeClass: 'text-slate-700 bg-slate-50 border-slate-200',
    Icon: IconXCircle,
  },
};

export const statusMeta = (status: MissionExecutionResult['status']) =>
  STATUS_META[status] || STATUS_META.PENDING;

export const MissionStatusBadge: React.FC<{
  status: MissionExecutionResult['status'];
  size?: 'sm' | 'md';
}> = ({ status, size = 'sm' }) => {
  const meta = statusMeta(status);
  const Icon = meta.Icon;
  const padding = size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${padding} ${meta.badgeClass}`}
    >
      <Icon className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
      {meta.label}
    </span>
  );
};

export const isCancellableStatus = (status: MissionExecutionResult['status']) =>
  status === 'PENDING' ||
  status === 'RUNNING' ||
  status === 'AWAITING_INTERVENTION';

export const riskClassColor = (riskClass: string) => {
  switch (riskClass) {
    case 'HIGH':
      return 'text-red-700 bg-red-50 border-red-200';
    case 'MEDIUM':
      return 'text-amber-700 bg-amber-50 border-amber-200';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
};

// ─── Time formatting ────────────────────────────────────────────────────────

export const formatDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString() : '—';

export const formatRelativeTime = (iso?: string): string => {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
};

// ─── Generated CarePlan row ─────────────────────────────────────────────────

// Resolves a generated CarePlan's owning patient so we can deep-link into the
// existing patient-scoped CarePlan CRUD page for review/update.
export const CarePlanReviewRow: React.FC<{
  carePlanId: string;
  label?: string;
}> = ({ carePlanId, label }) => {
  const { data: carePlanResource, isLoading } = useGetResourceByIdQuery(
    { resourceType: 'CarePlan', id: carePlanId },
    { skip: !carePlanId },
  );
  const carePlan = carePlanResource as CarePlan | undefined;

  const patientId = carePlan?.subject?.reference?.split('/').pop();

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-b-0">
      <div>
        <p className="text-sm font-medium text-gray-800">
          {label || carePlan?.title || `CarePlan/${carePlanId}`}
        </p>
        <p className="text-xs text-gray-400 font-mono">{carePlanId}</p>
      </div>
      {isLoading ? (
        <span className="text-xs text-gray-400">Resolving…</span>
      ) : patientId ? (
        <Link
          to={`/patient/${patientId}/careplan/crud/${carePlanId}`}
          className="text-sm font-semibold text-amber-600 hover:text-amber-800"
        >
          Review / Update →
        </Link>
      ) : (
        <span className="text-xs text-red-500">Unable to resolve patient</span>
      )}
    </div>
  );
};
