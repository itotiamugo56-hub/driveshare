import { request } from '../../client';

export const adminModerationApi = {
  flag: (itemType: string, itemId: string, flaggedReason: string, token?: string | null) =>
    request({ method: 'POST', url: '/admin/moderation/flag', data: { itemType, itemId, flaggedReason }, token }),

  queue: (status: string | undefined, token?: string | null) =>
    request({ method: 'GET', url: '/admin/moderation/queue', params: { status }, token }),

  resolve: (queueItemId: string, status: string, reason: string, token?: string | null) =>
    request({ method: 'POST', url: `/admin/moderation/queue/${queueItemId}/resolve`, data: { status, reason }, token }),

  fraudTriageQueue: (token?: string | null) =>
    request({ method: 'GET', url: '/admin/moderation/fraud-triage-queue', token }),

  disputeMediatorWorkbench: (token?: string | null) =>
    request({ method: 'GET', url: '/admin/moderation/dispute-mediator-workbench', token }),
};
