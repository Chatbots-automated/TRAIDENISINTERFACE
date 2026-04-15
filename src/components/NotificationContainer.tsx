import React from 'react';
import NotificationToast, { NotificationType } from './NotificationToast';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
}

interface NotificationContainerProps {
  notifications: Notification[];
  onRemove: (id: string) => void;
}

export default function NotificationContainer({ notifications, onRemove }: NotificationContainerProps) {
  const orderedNotifications = [...notifications].reverse();

  return (
    <>
      <div
        className="notification-stack"
        style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          pointerEvents: 'none',
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
          width: '360px',
          background: 'transparent',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}
      >
        {orderedNotifications.map((notification) => (
          <div key={notification.id} style={{ pointerEvents: 'auto' }}>
            <NotificationToast
              type={notification.type}
              title={notification.title}
              message={notification.message}
              onClose={() => onRemove(notification.id)}
              duration={5000}
            />
          </div>
        ))}
      </div>
      <style>{`
        .notification-stack::-webkit-scrollbar {
          width: 0;
          height: 0;
        }
      `}</style>
    </>
  );
}
