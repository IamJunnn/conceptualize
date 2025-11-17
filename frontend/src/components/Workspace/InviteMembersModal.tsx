import React, { useState } from 'react';
import { X, UserPlus, Mail } from 'lucide-react';
import { WorkspaceRole } from '../../services/workspaceService';
import './InviteMembersModal.css';

interface InviteMembersModalProps {
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
  onInvite: (email: string, role: WorkspaceRole) => Promise<void>;
}

const InviteMembersModal: React.FC<InviteMembersModalProps> = ({
  workspaceId,
  workspaceName,
  onClose,
  onInvite
}) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('member');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsSending(true);
    setError(null);
    setSuccess(null);

    try {
      await onInvite(email.trim(), role);
      setSuccess(`Invitation sent to ${email}`);
      // Reset form
      setEmail('');
      setRole('member');

      // Auto-close after a short delay
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to send invitation');
      setIsSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="invite-members-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-content">
            <UserPlus size={24} />
            <h2>Invite Team Members</h2>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close">
            <X size={24} />
          </button>
        </div>

        <div className="modal-content">
          <div className="workspace-info">
            <Mail size={16} />
            <span>Inviting to: <strong>{workspaceName}</strong></span>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="invite-email">Email Address</label>
              <input
                id="invite-email"
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSending}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="invite-role">Role</label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value as WorkspaceRole)}
                disabled={isSending}
              >
                <option value="member">Member</option>
                <option value="leader">Leader</option>
                <option value="admin">Admin</option>
              </select>
              <div className="role-description">
                {role === 'member' && 'Can view and edit notes, collaborate in real-time'}
                {role === 'leader' && 'Can manage members and access team features'}
                {role === 'admin' && 'Full control - can invite users and manage roles'}
              </div>
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            {success && (
              <div className="success-message">
                ✓ {success}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
                disabled={isSending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={isSending || !email.trim()}
              >
                {isSending ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </form>

          <div className="info-box">
            <h4>What happens next?</h4>
            <ul>
              <li>An email will be sent to the invitee</li>
              <li>They'll download the app and sign in</li>
              <li>They'll join your workspace with the selected role</li>
              <li>You can change their role anytime from the Admin Dashboard</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InviteMembersModal;
