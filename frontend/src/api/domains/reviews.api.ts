import { request } from '../client';

export const reviewsApi = {
  submit: (tripId: string, subjectUserId: string, rating: number, comment: string, token?: string | null) =>
    request({ method: 'POST', url: '/reviews', data: { tripId, subjectUserId, rating, comment }, token }),

  getForTrip: (tripId: string, token?: string | null) =>
    request({ method: 'GET', url: `/reviews/${tripId}`, token }),

  getUserHistory: (userId: string, token?: string | null) =>
    request({ method: 'GET', url: `/reviews/users/${userId}`, token }),

  attachMedia: (reviewId: string, mediaRefs: string[], token?: string | null) =>
    request({ method: 'POST', url: `/reviews/${reviewId}/media`, data: { mediaRefs }, token }),

  getBadges: (userId: string, token?: string | null) =>
    request({ method: 'GET', url: `/badges/users/${userId}`, token }),

  evaluateBadges: (userId: string, token?: string | null) =>
    request({ method: 'POST', url: '/badges/evaluate', data: { userId }, token }),
};
