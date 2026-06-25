import { create } from 'zustand';
import { apiClient } from '@/features/auth/api';

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  meta?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

interface NotificationsStore {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;

  fetchNotifications: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (ids?: number[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  removeFriendRequestNotifications: (requesterId: number, notificationId?: number) => void;
}

export const useNotificationsStore = create<NotificationsStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: async () => {
    try {
      set({ loading: true });
      const { data } = await apiClient.get<AppNotification[]>('/notifications', {
        params: { limit: 50 },
      });
      const unread = data.filter((n) => !n.read).length;
      set({ notifications: data, unreadCount: unread, loading: false });
    } catch (err) {
      console.error('fetchNotifications error:', err);
      set({ loading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const { data } = await apiClient.get<{ count: number }>('/notifications/unread-count');
      set({ unreadCount: data.count });
    } catch (err) {
      console.error('fetchUnreadCount error:', err);
    }
  },

  markAsRead: async (ids) => {
    try {
      await apiClient.post('/notifications/read', { ids });
      set((state) => ({
        notifications: state.notifications.map((n) =>
          !ids || ids.includes(n.id) ? { ...n, read: true } : n
        ),
        unreadCount: ids
          ? Math.max(0, state.unreadCount - ids.length)
          : 0,
      }));
    } catch (err) {
      console.error('markAsRead error:', err);
    }
  },

  markAllAsRead: async () => {
    try {
      await apiClient.post('/notifications/read', {});
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch (err) {
      console.error('markAllAsRead error:', err);
    }
  },

  removeFriendRequestNotifications: (requesterId, notificationId) => {
    set((state) => {
      const idsToRemove = new Set<number>();
      if (notificationId) idsToRemove.add(notificationId);
      state.notifications.forEach((notification) => {
        if (
          notification.type === 'FRIEND_REQUEST' &&
          Number(notification.meta?.requesterId) === requesterId
        ) {
          idsToRemove.add(notification.id);
        }
      });
      if (idsToRemove.size === 0) return state;

      const unreadRemoved = state.notifications.filter(
        (notification) => idsToRemove.has(notification.id) && !notification.read
      ).length;

      return {
        notifications: state.notifications.filter(
          (notification) => !idsToRemove.has(notification.id)
        ),
        unreadCount: Math.max(0, state.unreadCount - unreadRemoved),
      };
    });
  },
}));
