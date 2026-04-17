import { useCallback, useState } from 'react';
import type { Notification } from '../NotificationContainer';
import { formatErrorForToast, formatToastMessage } from '../../lib/notificationUtils';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((type: 'success' | 'error' | 'info', title: string, message: string) => {
    const id = `notification-${Date.now()}-${Math.random()}`;
    setNotifications(prev => [...prev, { id, type, title: formatToastMessage(title, 50), message: formatToastMessage(message) }]);
  }, []);

  const addErrorNotification = useCallback((title: string, error: unknown, fallback: string) => {
    addNotification('error', title, formatErrorForToast(error, fallback));
  }, [addNotification]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  return {
    notifications,
    addNotification,
    addErrorNotification,
    removeNotification
  };
}
