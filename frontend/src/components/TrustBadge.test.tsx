import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrustBadge } from './TrustBadge';

describe('TrustBadge', () => {
  it('renders the mapped label for a known tier', () => {
    render(<TrustBadge tier="trusted" />);
    expect(screen.getByText('Trusted host')).toBeInTheDocument();
  });

  it('falls back to the raw tier value for an unrecognized tier', () => {
    render(<TrustBadge tier="unknown_tier" />);
    expect(screen.getByText('unknown_tier')).toBeInTheDocument();
  });

  it('renders nothing for tier when tier is not provided', () => {
    render(<TrustBadge tier={null} />);
    expect(screen.queryByText(/host|Standard/)).not.toBeInTheDocument();
  });

  it('renders the average rating when provided', () => {
    render(<TrustBadge tier={null} avgRating={4.567} />);
    expect(screen.getByText('★ 4.6')).toBeInTheDocument();
  });

  it('renders nothing for rating when avgRating is null', () => {
    render(<TrustBadge tier={null} avgRating={null} />);
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
  });
});
