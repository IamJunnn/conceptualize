import { User } from '../../services/authServiceTauri';
import './JoinTeamModal.css';

interface JoinTeamModalProps {
  user: User;
  onClose: () => void;
  onTeamJoined: () => void;
}

export default function JoinTeamModal({ user, onClose, onTeamJoined }: JoinTeamModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal-content join-team-modal">
        <h2>Join Existing Team</h2>

        <div className="join-team-info">
          <p>
            If you've been invited to a team, you're already signed up with the email address
            your team admin used to invite you.
          </p>
        </div>

        <div className="info-box">
          <strong>How it works:</strong>
          <ul>
            <li>Your team admin adds you by email</li>
            <li>You receive an invitation email</li>
            <li>When you sign up with that email, you automatically join the team</li>
            <li>No invite codes needed!</li>
          </ul>
        </div>

        <div className="current-user-info">
          <strong>Your email:</strong> {user.email}
        </div>

        <div className="info-box info-box-success">
          <p>
            ✓ You're signed in with <strong>{user.email}</strong>. If you were invited with this email,
            you should already be part of your team. Close this dialog and check your team list.
          </p>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              onTeamJoined();
              onClose();
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
