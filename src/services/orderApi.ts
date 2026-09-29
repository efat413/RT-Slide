import { Order } from '../types';
import { isSessionUnauthorizedError, notifyAuthUnauthorized } from './authApi';

export interface OrderApiResponse<T = any> {
  success: boolean;
  message?: string;
  error?: string;
  orders?: Order[];
  order?: Order;
  data?: T;
  trackingCode?: string;
  tracking_code?: string;
  consignmentId?: string;
  consignment_id?: string;
}

const API_BASE = '/api';

function getHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  };
}

/**
 * Client service to communicate with Cloudflare D1 Database via Cloudflare Worker/API.
 * Strongly validates HTTP status, JSON payload, and D1 database responses.
 * Uses pure HttpOnly cookie authentication (credentials: 'include').
 */
export const orderApi = {
  /**
   * Fetches all orders from Cloudflare D1 central database
   */
  async getOrders(search?: string): Promise<{ success: boolean; orders: Order[]; error?: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const url = new URL(`${API_BASE}/orders`, window.location.origin);
      if (search) url.searchParams.set('search', search);

      const res = await fetch(url.toString(), {
        method: 'GET',
        credentials: 'include',
        headers: getHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data: OrderApiResponse = await res.json().catch(() => ({ success: false }));
      if (!res.ok) {
        const errorMsg = data.error || data.message || `HTTP ${res.status}: Failed to fetch orders from D1`;
        if (isSessionUnauthorizedError(res.status, errorMsg)) {
          notifyAuthUnauthorized({ url: url.toString(), error: errorMsg });
        }
        throw new Error(errorMsg);
      }

      if (data.success && Array.isArray(data.orders)) {
        return { success: true, orders: data.orders };
      }
      return { success: false, orders: [], error: data.error || 'Invalid orders payload returned by server' };
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.warn('orderApi.getOrders error:', err?.message || err);
      if (err?.name === 'AbortError' || err?.message?.toLowerCase().includes('abort')) {
        return { success: false, orders: [], error: 'Request timed out while contacting the server. Please try again.' };
      }
      return { success: false, orders: [], error: err?.message || 'Network error fetching orders' };
    }
  },

  /**
   * Permanently saves a new order to Cloudflare D1 database.
   * Awaits D1 confirmation and returns the canonical inserted order.
   * Supports Idempotency-Key for network retries and duplicate avoidance.
   */
  async createOrder(order: Order, idempotencyKey?: string): Promise<OrderApiResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const headers = getHeaders();
      if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
      }

      const res = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ order, idempotencyKey }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errorMsg = data.error || data.message || `HTTP ${res.status}: Database rejected order creation`;
        return { success: false, error: errorMsg };
      }

      return {
        success: true,
        order: data.order || order,
        message: data.message || 'Order successfully persisted in Cloudflare D1',
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('orderApi.createOrder error:', err);
      if (err?.name === 'AbortError' || err?.message?.toLowerCase().includes('abort')) {
        return { success: false, error: 'Request timed out while contacting the server. Please try again.' };
      }
      return { success: false, error: err?.message || 'Network error creating order' };
    }
  },

  /**
   * Updates an existing order in Cloudflare D1 database.
   * Strongly verifies response and returns updated canonical order.
   */
  async updateOrder(orderId: string, updates: Partial<Order>): Promise<OrderApiResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ updates }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errorMsg = data.error || data.message || `HTTP ${res.status}: Failed to update order in D1`;
        if (res.status === 401) {
          notifyAuthUnauthorized({ url: `${API_BASE}/orders/${encodeURIComponent(orderId)}`, error: errorMsg });
        }
        return { success: false, error: errorMsg };
      }

      return {
        success: true,
        order: data.order,
        message: data.message || 'Order successfully updated in Cloudflare D1',
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('orderApi.updateOrder error:', err);
      if (err?.name === 'AbortError' || err?.message?.toLowerCase().includes('abort')) {
        return { success: false, error: 'Request timed out while contacting the server. Please try again.' };
      }
      return { success: false, error: err?.message || 'Network error updating order' };
    }
  },

  /**
   * Permanently deletes an order from Cloudflare D1 database.
   */
  async deleteOrder(orderId: string): Promise<OrderApiResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errorMsg = data.error || `HTTP ${res.status}: Failed to delete order`;
        if (res.status === 401) {
          notifyAuthUnauthorized({ url: `${API_BASE}/orders/${encodeURIComponent(orderId)}`, error: errorMsg });
        }
        return { success: false, error: errorMsg };
      }

      return { success: true, message: data.message || 'Order deleted from D1' };
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('orderApi.deleteOrder error:', err);
      if (err?.name === 'AbortError' || err?.message?.toLowerCase().includes('abort')) {
        return { success: false, error: 'Request timed out while contacting the server. Please try again.' };
      }
      return { success: false, error: err?.message || 'Network error deleting order' };
    }
  },

  /**
   * Tests Steadfast Courier API connection and fetches balance via secure server-side proxy
   */
  async testSteadfastConnection(credentials?: {
    apiKey?: string;
    secretKey?: string;
    baseUrl?: string;
  }): Promise<{ success: boolean; message: string; balance?: number; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/courier/steadfast/test`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify(credentials || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        return {
          success: true,
          message: data.message || 'Connected successfully to Steadfast Courier API!',
          balance: data.current_balance ?? data.balance,
        };
      }
      const errorMsg = data.error || 'Failed to connect to Steadfast API';
      return {
        success: false,
        message: errorMsg,
        error: data.error,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Network error while testing Steadfast API',
        error: err?.message,
      };
    }
  },

  /**
   * Dispatches parcel via secure server-side proxy (credentials strictly managed by server)
   */
  async dispatchCourier(order: Order, parcelData?: any, courier?: any): Promise<OrderApiResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const res = await fetch(`${API_BASE}/courier/dispatch`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({
          order,
          parcelData,
          courier,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errorMsg = data.error || `HTTP ${res.status}: Courier dispatch rejected`;
        if (res.status === 401) {
          notifyAuthUnauthorized({ url: `${API_BASE}/courier/dispatch`, error: errorMsg });
        }
        return {
          success: false,
          error: errorMsg,
        };
      }

      return {
        success: true,
        trackingCode: data.tracking_code || data.trackingCode,
        consignmentId: data.consignment_id || data.consignmentId,
        data: data.data,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError' || err?.message?.toLowerCase().includes('abort')) {
        return { success: false, error: 'Request timed out while contacting the server. Please try again.' };
      }
      return { success: false, error: err?.message || 'Network error dispatching courier' };
    }
  },

  /**
   * Tracks customer order delivery status using order number and contact phone number.
   * Leverages server-side privacy filtering and abuse rate limiting.
   */
  async trackOrder(orderNumber: string, phone: string): Promise<{
    success: boolean;
    order?: Order;
    error?: string;
    isRateLimited?: boolean;
    retryAfter?: number;
  }> {
    try {
      const cleanNum = orderNumber.trim();
      const cleanPhone = phone.replace(/\D/g, '');
      const url = `${API_BASE}/orders/${encodeURIComponent(cleanNum)}?phone=${encodeURIComponent(cleanPhone)}`;
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: getHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10);
        return {
          success: false,
          error: data.error || 'Too many tracking attempts. Please wait before trying again.',
          isRateLimited: true,
          retryAfter,
        };
      }
      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || 'Order not found or contact number does not match.',
        };
      }
      return {
        success: true,
        order: data.order,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error while querying order tracking.',
      };
    }
  },

  /**
   * Checks courier parcel tracking status via secure server-side proxy
   */
  async checkCourierStatus(consignmentId: string, phone?: string): Promise<any> {
    try {
      const queryParam = phone ? `?phone=${encodeURIComponent(phone)}` : '';
      const url = `${API_BASE}/courier/status/${encodeURIComponent(consignmentId)}${queryParam}`;
      const res = await fetch(url, {
        credentials: 'include',
        headers: getHeaders(),
      });
      return await res.json().catch(() => ({ success: false }));
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  },

  /**
   * Synchronizes single order courier delivery status from Steadfast and updates D1
   */
  async syncSingleCourierOrder(orderId: string): Promise<{ success: boolean; order?: Order; message?: string; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/courier/sync/${encodeURIComponent(orderId)}`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errorMsg = data.error || `Failed to sync order courier status (HTTP ${res.status})`;
        if (res.status === 401) {
          notifyAuthUnauthorized({ url: `${API_BASE}/courier/sync/${encodeURIComponent(orderId)}`, error: errorMsg });
        }
        return {
          success: false,
          error: errorMsg,
        };
      }
      return {
        success: true,
        order: data.order,
        message: data.message,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error synchronizing courier status',
      };
    }
  },

  /**
   * Synchronizes all active non-final courier orders from Steadfast and updates D1
   */
  async syncAllCourierOrders(): Promise<{ success: boolean; totalChecked?: number; updatedCount?: number; message?: string; errors?: string[]; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/courier/sync`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errorMsg = data.error || `Courier sync failed (HTTP ${res.status})`;
        if (res.status === 401) {
          notifyAuthUnauthorized({ url: `${API_BASE}/courier/sync`, error: errorMsg });
        }
        return {
          success: false,
          error: errorMsg,
        };
      }
      return {
        success: true,
        totalChecked: data.totalChecked,
        updatedCount: data.updatedCount,
        message: data.message,
        errors: data.errors,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error syncing all courier orders',
      };
    }
  },
};
