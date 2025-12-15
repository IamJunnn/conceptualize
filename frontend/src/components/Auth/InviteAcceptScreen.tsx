import React from 'react';
import { UserPlus, Crown, Star, User } from 'lucide-react';
import { DeepLinkInvitation } from '../../services/deepLinkService';
import './ModeSelectionScreen.css'; // Reuse the same styles

interface InviteAcceptScreenProps {
  invitation: DeepLinkInvitation;
  onSignIn: () => void;
  onCancel: () => void;
}

const InviteAcceptScreen: React.FC<InviteAcceptScreenProps> = ({
  invitation,
  onSignIn,
  onCancel
}) => {
  const getRoleIcon = () => {
    switch (invitation.role) {
      case 'admin':
        return <Crown size={48} />;
      case 'leader':
        return <Star size={48} />;
      case 'member':
        return <User size={48} />;
      default:
        return <UserPlus size={48} />;
    }
  };

  const getRoleColor = () => {
    switch (invitation.role) {
      case 'admin':
        return '#c44fc4';
      case 'leader':
        return '#d69e2e';
      case 'member':
        return '#319795';
      default:
        return '#64c8ca';
    }
  };

  const getRoleDescription = () => {
    switch (invitation.role) {
      case 'admin':
        return 'Full workspace control, invite users, and manage all roles';
      case 'leader':
        return 'Manage team members and access all team features';
      case 'member':
        return 'Create and edit notes, collaborate in real-time';
      default:
        return '';
    }
  };

  return (
    <div className="mode-selection-screen">
      <div className="mode-selection-container">
        <div className="mode-header">
          <img src="/logo.svg" alt="Conceptualize" className="mode-logo" />
          <h1>Conceptualize</h1>
          <p className="mode-subtitle">Collaborative Knowledge Management</p>
        </div>

        <div className="mode-content">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${getRoleColor()} 0%, ${getRoleColor()}dd 100%)`,
                color: 'white',
                marginBottom: '16px'
              }}
            >
              {getRoleIcon()}
            </div>
          </div>

          <h2 style={{ textAlign: 'center', marginBottom: '12px' }}>
            You've Been Invited!
          </h2>

          <p className="mode-description">
            You've been invited to join{' '}
            <strong>{invitation.workspaceName}</strong> as a{' '}
            <strong style={{ color: getRoleColor() }}>
              {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
            </strong>
            .
          </p>

          <div
            style={{
              background: 'linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px'
            }}
          >
            <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#1a202c' }}>
              What you can do:
            </h4>
            <p style={{ margin: 0, fontSize: '14px', color: '#4a5568', lineHeight: '1.6' }}>
              {getRoleDescription()}
            </p>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#1a202c' }}>
              Next steps:
            </h4>
            <ol
              style={{
                margin: 0,
                paddingLeft: '20px',
                fontSize: '14px',
                color: '#4a5568',
                lineHeight: '1.8'
              }}
            >
              <li>Sign in with your Google account</li>
              <li>You'll automatically join the workspace</li>
              <li>Start collaborating with your team!</li>
            </ol>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
            <button
              onClick={onCancel}
              style={{
                flex: 1,
                padding: '14px 24px',
                fontSize: '15px',
                fontWeight: 600,
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                border: '2px solid #e2e8f0',
                background: 'white',
                color: '#4a5568',
                fontFamily: 'inherit'
              }}
            >
              Cancel
            </button>
            <button
              onClick={onSignIn}
              style={{
                flex: 2,
                padding: '14px 24px',
                fontSize: '15px',
                fontWeight: 600,
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                border: 'none',
                background: `linear-gradient(135deg, ${getRoleColor()} 0%, ${getRoleColor()}dd 100%)`,
                color: 'white',
                fontFamily: 'inherit',
                boxShadow: `0 4px 12px ${getRoleColor()}40`
              }}
            >
              Sign In to Accept
            </button>
          </div>

          <p
            style={{
              marginTop: '24px',
              textAlign: 'center',
              fontSize: '13px',
              color: '#718096'
            }}
          >
            By accepting, you agree to join this workspace and collaborate with the team.
          </p>
        </div>
      </div>
    </div>
  );
};

export default InviteAcceptScreen;
