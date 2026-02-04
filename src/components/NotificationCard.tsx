import React from 'react';
import { Check, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { notificationStyles } from '../lib/designSystem';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface NotificationCardProps {
  type: NotificationType;
  title: string;
  message: string;
  onClose?: () => void;
  autoClose?: boolean;
  duration?: number;
}

export default function NotificationCard({
  type,
  title,
  message,
  onClose,
  autoClose = false,
  duration = 5000
}: NotificationCardProps) {
  const [isVisible, setIsVisible] = React.useState(true);

  React.useEffect(() => {
    if (autoClose && isVisible) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onClose?.();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [autoClose, duration, isVisible, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };

  if (!isVisible) return null;

  const styles = notificationStyles[type];

  const icons = {
    success: Check,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  };

  const Icon = icons[type];

  return (
    <div
      className="notification-card"
      style={{
        width: '100%',
        maxWidth: '420px',
        minHeight: '80px',
        borderRadius: '12px',
        padding: '10px 15px',
        background: styles.background,
        boxShadow: 'rgba(149, 157, 165, 0.2) 0px 8px 24px',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        gap: '15px',
        animation: 'slideInRight 0.3s ease-out'
      }}
    >
      <style>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes fadeOut {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }
      `}</style>

      {/* Decorative Wave */}
      <svg
        className="wave"
        viewBox="0 0 1440 320"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          position: 'absolute',
          transform: 'rotate(90deg)',
          left: '-31px',
          top: '32px',
          width: '80px',
          fill: styles.waveFill,
          opacity: 0.6
        }}
      >
        <path
          d="M0,256L11.4,240C22.9,224,46,192,69,192C91.4,192,114,224,137,234.7C160,245,183,235,206,213.3C228.6,192,251,160,274,149.3C297.1,139,320,149,343,181.3C365.7,213,389,267,411,282.7C434.3,299,457,277,480,250.7C502.9,224,526,192,549,181.3C571.4,171,594,181,617,208C640,235,663,277,686,256C708.6,235,731,149,754,122.7C777.1,96,800,128,823,165.3C845.7,203,869,245,891,224C914.3,203,937,117,960,112C982.9,107,1006,181,1029,197.3C1051.4,213,1074,171,1097,144C1120,117,1143,107,1166,133.3C1188.6,160,1211,224,1234,218.7C1257.1,213,1280,139,1303,133.3C1325.7,128,1349,192,1371,192C1394.3,192,1417,128,1429,96L1440,64L1440,320L1428.6,320C1417.1,320,1394,320,1371,320C1348.6,320,1326,320,1303,320C1280,320,1257,320,1234,320C1211.4,320,1189,320,1166,320C1142.9,320,1120,320,1097,320C1074.3,320,1051,320,1029,320C1005.7,320,983,320,960,320C937.1,320,914,320,891,320C868.6,320,846,320,823,320C800,320,777,320,754,320C731.4,320,709,320,686,320C662.9,320,640,320,617,320C594.3,320,571,320,549,320C525.7,320,503,320,480,320C457.1,320,434,320,411,320C388.6,320,366,320,343,320C320,320,297,320,274,320C251.4,320,229,320,206,320C182.9,320,160,320,137,320C114.3,320,91,320,69,320C45.7,320,23,320,11,320L0,320Z"
          fillOpacity="1"
        />
      </svg>

      {/* Icon Container */}
      <div
        style={{
          width: '40px',
          height: '40px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: styles.iconBg,
          borderRadius: '50%',
          marginLeft: '8px',
          flexShrink: 0
        }}
      >
        <Icon
          style={{
            width: '20px',
            height: '20px',
            color: styles.iconColor,
            strokeWidth: 2.5
          }}
        />
      </div>

      {/* Message Text */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          flexGrow: 1,
          minWidth: 0
        }}
      >
        <p
          style={{
            margin: 0,
            color: styles.titleColor,
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'default',
            lineHeight: 1.4
          }}
        >
          {title}
        </p>
        <p
          style={{
            margin: 0,
            fontSize: '13px',
            color: styles.textColor,
            cursor: 'default',
            lineHeight: 1.5,
            marginTop: '2px'
          }}
        >
          {message}
        </p>
      </div>

      {/* Close Icon */}
      {onClose && (
        <button
          onClick={handleClose}
          style={{
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            color: '#8a857f',
            transition: 'color 0.2s ease',
            flexShrink: 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#3d3935';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#8a857f';
          }}
        >
          <X style={{ width: '18px', height: '18px' }} />
        </button>
      )}
    </div>
  );
}

// Container component for managing multiple notifications
interface NotificationContainerProps {
  notifications: Array<{
    id: string;
    type: NotificationType;
    title: string;
    message: string;
  }>;
  onClose: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center';
}

export function NotificationContainer({
  notifications,
  onClose,
  position = 'top-right'
}: NotificationContainerProps) {
  const positionStyles = {
    'top-right': { top: '24px', right: '24px' },
    'top-left': { top: '24px', left: '24px' },
    'bottom-right': { bottom: '24px', right: '24px' },
    'bottom-left': { bottom: '24px', left: '24px' },
    'top-center': { top: '24px', left: '50%', transform: 'translateX(-50%)' },
  };

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxWidth: '420px',
        ...positionStyles[position]
      }}
    >
      {notifications.map((notification) => (
        <NotificationCard
          key={notification.id}
          type={notification.type}
          title={notification.title}
          message={notification.message}
          onClose={() => onClose(notification.id)}
          autoClose={true}
          duration={5000}
        />
      ))}
    </div>
  );
}
