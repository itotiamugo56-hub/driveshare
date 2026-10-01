import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBanner } from './StatusBanner';

describe('StatusBanner', () => {
  it('renders the given message', () => {
    render(<StatusBanner kind="loading" message="Loading listings…" />);
    expect(screen.getByText('Loading listings…')).toBeInTheDocument();
  });

  it('uses role="alert" for the error kind, so screen readers announce it', () => {
    render(<StatusBanner kind="error" message="Something failed" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something failed');
  });

  it('uses role="status" for non-error kinds', () => {
    render(<StatusBanner kind="empty" message="Nothing here" />);
    expect(screen.getByRole('status')).toHaveTextContent('Nothing here');
  });
});
