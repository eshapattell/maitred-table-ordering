import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PendingRequests from './PendingRequests.jsx';

describe('PendingRequests', () => {
  it('returns null on empty requests array', () => {
    const { container } = render(<PendingRequests requests={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when requests is missing or not an array', () => {
    const { container } = render(<PendingRequests />);
    expect(container.firstChild).toBeNull();
  });

  it('renders heading "Join requests" when requests is non-empty', () => {
    const requests = [{ id: 'req-1', nickname: 'Asha' }];
    render(<PendingRequests requests={requests} />);
    expect(screen.getByRole('heading', { name: /join requests/i })).toBeInTheDocument();
  });

  it('renders nickname and "wants to join your table"', () => {
    const requests = [{ id: 'req-1', nickname: 'Asha' }];
    render(<PendingRequests requests={requests} />);
    expect(screen.getByText('Asha')).toBeInTheDocument();
    expect(screen.getByText(/wants to join your table/i)).toBeInTheDocument();
  });

  it('provides accessible labels on both buttons', () => {
    const requests = [{ id: 'req-1', nickname: 'Asha' }];
    render(<PendingRequests requests={requests} />);
    expect(screen.getByRole('button', { name: 'Approve Asha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline Asha' })).toBeInTheDocument();
  });

  it('calls onApprove with id when approve button is clicked', () => {
    const onApprove = vi.fn();
    const requests = [{ id: 'req-1', nickname: 'Asha' }];
    render(<PendingRequests requests={requests} onApprove={onApprove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve Asha' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith('req-1');
  });

  it('calls onReject with id when decline button is clicked', () => {
    const onReject = vi.fn();
    const requests = [{ id: 'req-1', nickname: 'Asha' }];
    render(<PendingRequests requests={requests} onReject={onReject} />);
    fireEvent.click(screen.getByRole('button', { name: 'Decline Asha' }));
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledWith('req-1');
  });

  it('disables buttons when busy is true', () => {
    const requests = [{ id: 'req-1', nickname: 'Asha' }];
    render(<PendingRequests requests={requests} busy={true} />);
    expect(screen.getByRole('button', { name: 'Approve Asha' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decline Asha' })).toBeDisabled();
  });
});
