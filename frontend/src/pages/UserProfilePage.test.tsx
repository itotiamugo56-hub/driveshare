import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { UserProfilePage } from './UserProfilePage';
import * as useUserProfileModule from '../hooks/useUserProfile';

vi.mock('../hooks/useUserProfile');

function renderAt(userId: string) {
  return render(
    <MemoryRouter initialEntries={[`/users/${userId}`]}>
      <Routes>
        <Route path="/users/:userId" element={<UserProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockReviews(overrides: Partial<ReturnType<typeof useUserProfileModule.useUserReviewHistory>>) {
  vi.mocked(useUserProfileModule.useUserReviewHistory).mockReturnValue({
    isLoading: false,
    isError: false,
    data: undefined,
    error: null,
    ...overrides,
  } as ReturnType<typeof useUserProfileModule.useUserReviewHistory>);
}

function mockBadges(data: useUserProfileModule.UserBadge[] = []) {
  vi.mocked(useUserProfileModule.useUserBadges).mockReturnValue({
    isLoading: false,
    isError: false,
    data,
    error: null,
  } as ReturnType<typeof useUserProfileModule.useUserBadges>);
}

describe('UserProfilePage', () => {
  it('shows a loading state', () => {
    mockReviews({ isLoading: true });
    mockBadges();
    renderAt('user-1');
    expect(screen.getByText('Loading profile…')).toBeInTheDocument();
  });

  it('shows a sign-in-required error state (matches the backend not being @Public())', () => {
    mockReviews({ isError: true, error: new Error('Request failed with status code 401') });
    mockBadges();
    renderAt('user-1');
    expect(screen.getByRole('alert')).toHaveTextContent('401');
  });

  it('renders average rating, review count, badges, and review list', () => {
    mockReviews({
      data: {
        userId: 'user-1',
        reviewCount: 2,
        averageRating: 4.5,
        reviews: [
          {
            id: 'r1',
            tripId: 't1',
            authorUserId: 'a1',
            subjectUserId: 'user-1',
            rating: 5,
            comment: 'Great host!',
            mediaRefs: [],
            visibility: 'visible',
            submittedAt: new Date('2026-01-01').toISOString(),
            revealedAt: new Date('2026-01-01').toISOString(),
          },
        ],
      },
    });
    mockBadges([
      { id: 'b1', userId: 'user-1', badgeType: 'super_host', earnedAt: new Date().toISOString(), rollingWindowMetrics: {} },
    ]);
    renderAt('user-1');

    expect(screen.getByText('★ 4.5')).toBeInTheDocument();
    expect(screen.getByText('2 reviews')).toBeInTheDocument();
    expect(screen.getByText('Super Host')).toBeInTheDocument();
    expect(screen.getByText('Great host!')).toBeInTheDocument();
  });

  it('shows "No ratings yet" when averageRating is null', () => {
    mockReviews({ data: { userId: 'user-1', reviewCount: 0, averageRating: null, reviews: [] } });
    mockBadges();
    renderAt('user-1');
    expect(screen.getByText('No ratings yet')).toBeInTheDocument();
    expect(screen.getByText('No visible reviews yet.')).toBeInTheDocument();
  });
});
