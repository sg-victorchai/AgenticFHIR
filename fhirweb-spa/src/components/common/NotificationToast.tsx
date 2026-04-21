import React, { useEffect, useState } from 'react';
import { FHIREventNotification } from '../../hooks/useSSESubscription';

interface NotificationToastProps {
  event: FHIREventNotification;
  onClose: () => void;
  duration?: number; // Auto-dismiss duration in ms
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  event,
  onClose,
  duration = 5000,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for fade-out animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create':
        return 'bg-green-500';
      case 'update':
        return 'bg-blue-500';
      case 'delete':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'create':
        return '➕';
      case 'update':
        return '✏️';
      case 'delete':
        return '🗑️';
      default:
        return '📋';
    }
  };

  return (
    <div
      className={`fixed top-20 right-4 max-w-sm w-full bg-white shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <span className="text-2xl">{getActionIcon(event.action)}</span>
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-gray-900">
              {event.resourceType} {event.action}d
            </p>
            <p className="mt-1 text-sm text-gray-500">
              ID: <span className="font-mono text-xs">{event.resourceId}</span>
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {new Date(event.timestamp).toLocaleTimeString()}
            </p>
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            <button
              className="bg-white rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none"
              onClick={() => {
                setIsVisible(false);
                setTimeout(onClose, 300);
              }}
            >
              <span className="sr-only">Close</span>
              <svg
                className="h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
        <div
          className={`mt-2 h-1 ${getActionColor(event.action)} rounded`}
        ></div>
      </div>
    </div>
  );
};

interface NotificationContainerProps {
  events: FHIREventNotification[];
}

export const NotificationContainer: React.FC<NotificationContainerProps> = ({
  events,
}) => {
  const [displayedEvents, setDisplayedEvents] = useState<
    { id: string; event: FHIREventNotification }[]
  >([]);

  useEffect(() => {
    if (events.length > 0) {
      const latestEvent = events[0];
      const id = `${latestEvent.resourceType}-${latestEvent.resourceId}-${latestEvent.timestamp}`;

      // Check if this event is already displayed
      if (!displayedEvents.find((e) => e.id === id)) {
        setDisplayedEvents((prev) =>
          [{ id, event: latestEvent }, ...prev].slice(0, 3),
        ); // Max 3 toasts
      }
    }
  }, [events]);

  const handleClose = (id: string) => {
    setDisplayedEvents((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <div className="fixed top-0 right-0 z-50 pointer-events-none">
      <div className="flex flex-col gap-4 pt-20 pr-4">
        {displayedEvents.map((item) => (
          <NotificationToast
            key={item.id}
            event={item.event}
            onClose={() => handleClose(item.id)}
          />
        ))}
      </div>
    </div>
  );
};
