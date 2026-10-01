import { request } from '../client';

export const accessIotApi = {
  registerDevice: (vehicleId: string, deviceType: string, vendorRef: string, token?: string | null) =>
    request({ method: 'POST', url: '/access/devices', data: { vehicleId, deviceType, vendorRef }, token }),

  getDeviceHealth: (deviceId: string, token?: string | null) =>
    request({ method: 'GET', url: `/access/devices/${deviceId}/health`, token }),

  issueKey: (
    body: { tripId: string; vehicleId: string; renterId: string; validFrom: string; validUntil: string },
    token?: string | null,
  ) => request({ method: 'POST', url: '/access/keys', data: body, token }),

  revokeKey: (keyId: string, token?: string | null) =>
    request({ method: 'POST', url: `/access/keys/${keyId}/revoke`, token }),

  getKey: (keyId: string, token?: string | null) =>
    request({ method: 'GET', url: `/access/keys/${keyId}`, token }),

  unlock: (keyId: string, token?: string | null) =>
    request({ method: 'POST', url: `/access/keys/${keyId}/unlock`, token }),

  lock: (keyId: string, token?: string | null) =>
    request({ method: 'POST', url: `/access/keys/${keyId}/lock`, token }),

  startIgnition: (keyId: string, token?: string | null) =>
    request({ method: 'POST', url: `/access/keys/${keyId}/start-ignition`, token }),

  immobilize: (vehicleId: string, justification: string, token?: string | null) =>
    request({ method: 'POST', url: `/access/vehicles/${vehicleId}/immobilize`, data: { justification }, token }),

  setGeofence: (
    vehicleId: string,
    tripId: string,
    polygon: Record<string, unknown>,
    breachAction: string | undefined,
    token?: string | null,
  ) => request({ method: 'POST', url: `/access/vehicles/${vehicleId}/geofence`, data: { tripId, polygon, breachAction }, token }),

  getLocation: (vehicleId: string, token?: string | null) =>
    request({ method: 'GET', url: `/access/vehicles/${vehicleId}/location`, token }),

  handleTelematicsWebhook: (
    vehicleId: string,
    eventType: string,
    payload: Record<string, unknown>,
    token?: string | null,
  ) => request({ method: 'POST', url: '/access/webhooks/telematics-event', data: { vehicleId, eventType, payload }, token }),
};
