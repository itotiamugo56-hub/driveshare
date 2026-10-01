import { request } from '../client';

export const logisticsApi = {
  requestDelivery: (tripId: string, dropoffLocation: Record<string, unknown>, feeCents: number, token?: string | null) =>
    request({ method: 'POST', url: '/logistics/delivery-requests', data: { tripId, dropoffLocation, feeCents }, token }),

  getDeliveryRequest: (requestId: string, token?: string | null) =>
    request({ method: 'GET', url: `/logistics/delivery-requests/${requestId}`, token }),

  assignDelivery: (requestId: string, assignedTo: string, token?: string | null) =>
    request({ method: 'PUT', url: `/logistics/delivery-requests/${requestId}/assign`, data: { assignedTo }, token }),

  getRedistributionSuggestions: (ownerId: string, token?: string | null) =>
    request({ method: 'POST', url: `/logistics/fleet/${ownerId}/redistribution-suggestions`, token }),

  bulkCreateListings: (ownerId: string, listings: Record<string, unknown>[], token?: string | null) =>
    request({ method: 'POST', url: `/logistics/fleet/${ownerId}/bulk-listings`, data: { listings }, token }),

  syncCalendar: (ownerId: string, token?: string | null) =>
    request({ method: 'PUT', url: `/logistics/fleet/${ownerId}/calendar-sync`, token }),

  createMaintenanceHold: (ownerId: string, body: Record<string, unknown>, token?: string | null) =>
    request({ method: 'POST', url: `/logistics/fleet/${ownerId}/maintenance-schedule`, data: body, token }),
};
