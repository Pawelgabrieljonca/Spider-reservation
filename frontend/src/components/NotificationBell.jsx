import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Bell,
  CalendarCheck,
  CheckCheck,
  Clock,
  TrendingUp,
  Users,
} from 'lucide-react';
import apiClient from '../api/client';
import { formatDateTime24 } from '../utils/dateUtils';

function NotificationCategoryIcon({ category }) {
  if (category === 'BOOKING_NEW' || category === 'BOOKING_CONFIRMED') {
    return (
      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
        <CalendarCheck className="w-4 h-4" />
      </div>
    );
  }
  if (category === 'BOOKING_CANCELLED') {
    return (
      <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center shrink-0">
        <AlertCircle className="w-4 h-4" />
      </div>
    );
  }
  if (category === 'GROUP_SPOT_FREED') {
    return (
      <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
        <Users className="w-4 h-4" />
      </div>
    );
  }
  if (category === 'PROGRESS_ADDED') {
    return (
      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
        <TrendingUp className="w-4 h-4" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
      <Clock className="w-4 h-4" />
    </div>
  );
}

export default function NotificationBell({ onNavigate }) {
  const navigate = useNavigate();
  const containerRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(() => {
    apiClient
      .get('/api/v1/notifications', { params: { limit: 25 } })
      .then((res) => {
        const data = res.data || {};
        setItems(Array.isArray(data.items) ? data.items : []);
        setUnreadCount(Number(data.unread_count) || 0);
      })
      .catch(() => {
        // Ciche pominięcie błędu tła – nie blokuje paska nawigacji
      });
  }, []);

  useEffect(() => {
    let active = true;
    apiClient
      .get('/api/v1/notifications', { params: { limit: 25 } })
      .then((res) => {
        if (!active) return;
        const data = res.data || {};
        setItems(Array.isArray(data.items) ? data.items : []);
        setUnreadCount(Number(data.unread_count) || 0);
      })
      .catch(() => {});

    const intervalId = window.setInterval(() => {
      fetchNotifications();
    }, 30000);

    const handleRefreshEvent = () => fetchNotifications();
    window.addEventListener('spider:notifications-refresh', handleRefreshEvent);
    window.addEventListener('focus', handleRefreshEvent);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('spider:notifications-refresh', handleRefreshEvent);
      window.removeEventListener('focus', handleRefreshEvent);
    };
  }, [fetchNotifications]);

  // Zamykanie panelu po kliknięciu poza obszarem dzwonka
  useEffect(() => {
    if (!open) return undefined;
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  const handleToggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      fetchNotifications();
    }
  };

  const handleMarkAllRead = async () => {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      await apiClient.post('/api/v1/notifications/read-all');
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // Ciche pominięcie
    } finally {
      setMarkingAll(false);
    }
  };

  const handleClickItem = async (notif) => {
    if (!notif.is_read) {
      setItems((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      apiClient.patch(`/api/v1/notifications/${notif.id}/read`).catch(() => {});
    }
    setOpen(false);
    if (onNavigate) onNavigate();
    if (notif.link_url) {
      navigate(notif.link_url);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-label={
          unreadCount > 0
            ? `Powiadomienia (${unreadCount} nieprzeczytane)`
            : 'Powiadomienia'
        }
        className={`relative inline-flex items-center justify-center min-h-[42px] min-w-[42px] rounded-lg border transition-colors ${
          open
            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 active:bg-slate-100'
        }`}
      >
        <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Centrum powiadomień"
          className="fixed sm:absolute right-3 left-3 sm:left-auto sm:right-0 top-[64px] sm:top-full sm:mt-2 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">Powiadomienia</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900">
                  {unreadCount} nowe
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                disabled={markingAll}
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Oznacz wszystkie</span>
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
            {items.length === 0 ? (
              <div className="p-6 text-center space-y-1.5">
                <Bell className="w-7 h-7 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-700">Brak powiadomień</p>
                <p className="text-xs text-slate-500">
                  Tutaj pojawią się przypomnienia o treningach, zapisy na dyżur oraz zwolnione
                  miejsca w grupach.
                </p>
              </div>
            ) : (
              items.map((notif) => (
                <button
                  key={notif.id}
                  type="button"
                  onClick={() => handleClickItem(notif)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                    notif.is_read
                      ? 'bg-white hover:bg-slate-50'
                      : 'bg-emerald-50/60 hover:bg-emerald-50'
                  }`}
                >
                  <NotificationCategoryIcon category={notif.category} />

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`text-xs sm:text-sm leading-snug ${
                          notif.is_read
                            ? 'font-semibold text-slate-800'
                            : 'font-bold text-slate-950'
                        }`}
                      >
                        {notif.title}
                      </span>
                      {!notif.is_read && (
                        <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0 mt-1.5" />
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{notif.body}</p>
                    <div className="text-[11px] text-slate-400 pt-0.5">
                      {formatDateTime24(notif.created_at)}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

