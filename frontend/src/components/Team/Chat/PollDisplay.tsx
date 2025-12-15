/**
 * PollDisplay - Interactive poll component for chat messages
 * Displays poll options with voting functionality and results
 */

import { useState } from 'react';
import { BarChart2, Check, Users } from 'lucide-react';
import { Poll } from '../../../services/teamChatTypes';
import './PollDisplay.css';

interface PollDisplayProps {
  poll: Poll;
  messageId: string;
  currentUserEmail: string;
  onVote: (messageId: string, optionId: string) => Promise<void>;
}

export default function PollDisplay({
  poll,
  messageId,
  currentUserEmail,
  onVote,
}: PollDisplayProps) {
  const [voting, setVoting] = useState<string | null>(null);

  // Calculate total unique voters (not total votes, since multi-select counts per option)
  const allVoters = new Set<string>();
  poll.options.forEach(opt => opt.votes.forEach(v => allVoters.add(v)));
  const totalVoters = allVoters.size;

  // Check which options the current user has voted for
  const userVotedOptions = poll.options
    .filter(opt => opt.votes.includes(currentUserEmail))
    .map(opt => opt.id);

  const hasVoted = userVotedOptions.length > 0;

  // Handle vote click
  const handleVote = async (optionId: string) => {
    if (voting) return; // Prevent double-clicking

    // For single-select polls, if user already voted for a different option, prevent
    if (!poll.allowMultiple && hasVoted && !userVotedOptions.includes(optionId)) {
      // User needs to unvote first (click their current vote to toggle)
      return;
    }

    setVoting(optionId);
    try {
      await onVote(messageId, optionId);
    } catch (error) {
      console.error('Vote failed:', error);
    } finally {
      setVoting(null);
    }
  };

  // Calculate percentage for each option
  const getPercentage = (voteCount: number) => {
    if (totalVoters === 0) return 0;
    return Math.round((voteCount / totalVoters) * 100);
  };

  return (
    <div className="poll-display">
      {/* Poll header */}
      <div className="poll-header">
        <BarChart2 size={18} className="poll-icon" />
        <span className="poll-question">{poll.question}</span>
      </div>

      {/* Poll options */}
      <div className="poll-options">
        {poll.options.map((option) => {
          const voteCount = option.votes.length;
          const percentage = getPercentage(voteCount);
          const isVoted = userVotedOptions.includes(option.id);
          const isVoting = voting === option.id;
          const isDisabled = !poll.allowMultiple && hasVoted && !isVoted;

          return (
            <button
              key={option.id}
              className={`poll-option ${isVoted ? 'voted' : ''} ${isDisabled ? 'disabled' : ''}`}
              onClick={() => handleVote(option.id)}
              disabled={isVoting || isDisabled}
            >
              {/* Progress bar background */}
              <div
                className="poll-option-progress"
                style={{ width: `${percentage}%` }}
              />

              {/* Option content */}
              <div className="poll-option-content">
                <div className="poll-option-left">
                  {/* Checkbox/radio indicator */}
                  <div className={`poll-option-indicator ${poll.allowMultiple ? 'multi' : 'single'} ${isVoted ? 'checked' : ''}`}>
                    {isVoted && <Check size={12} />}
                  </div>
                  <span className="poll-option-text">{option.text}</span>
                </div>

                <div className="poll-option-right">
                  <span className="poll-option-percentage">{percentage}%</span>
                  <span className="poll-option-count">({voteCount})</span>
                </div>
              </div>

              {/* Loading indicator when voting */}
              {isVoting && <div className="poll-option-loading" />}
            </button>
          );
        })}
      </div>

      {/* Poll footer */}
      <div className="poll-footer">
        <div className="poll-voters">
          <Users size={14} />
          <span>{totalVoters} vote{totalVoters !== 1 ? 's' : ''}</span>
        </div>
        <div className="poll-type">
          {poll.allowMultiple ? 'Multiple selections allowed' : 'Single selection'}
        </div>
      </div>
    </div>
  );
}
