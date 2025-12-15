/**
 * RecordingSavingIndicator - Shows when recordings are being processed/saved
 * This persists even after the call ends to reassure users their recording is safe
 */

import { useState, useEffect, useRef } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import {
  ProcessingRecording,
  subscribeToProcessingRecordings,
} from '../../../services/recordingService';
import './RecordingSavingIndicator.css';

interface RecordingSavingIndicatorProps {
  // Optional: position of the indicator
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
}

export default function RecordingSavingIndicator({
  position = 'bottom-right',
}: RecordingSavingIndicatorProps) {
  const [processingRecordings, setProcessingRecordings] = useState<ProcessingRecording[]>([]);
  const [completedRecordings, setCompletedRecordings] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  // Use ref to track previous IDs without causing re-renders
  const previousIdsRef = useRef<string[]>([]);
  const dismissedRef = useRef<string[]>([]);

  // Keep dismissedRef in sync
  useEffect(() => {
    dismissedRef.current = dismissed;
  }, [dismissed]);

  useEffect(() => {
    const unsubscribe = subscribeToProcessingRecordings((recordings) => {
      const currentIds = recordings.map(r => r.id);

      // Find recordings that were processing but are no longer
      const nowCompleted = previousIdsRef.current.filter(
        id => !currentIds.includes(id) && !dismissedRef.current.includes(id)
      );

      if (nowCompleted.length > 0) {
        setCompletedRecordings(prev => [...prev, ...nowCompleted]);
        // Auto-dismiss completed after 5 seconds
        nowCompleted.forEach(id => {
          setTimeout(() => {
            setCompletedRecordings(prev => prev.filter(cid => cid !== id));
          }, 5000);
        });
      }

      // Update ref for next comparison
      previousIdsRef.current = currentIds;
      setProcessingRecordings(recordings);
    });

    return () => unsubscribe();
  }, []); // Empty dependency array - runs once on mount

  const handleDismiss = (recordingId: string) => {
    setDismissed(prev => [...prev, recordingId]);
  };

  const handleDismissCompleted = (recordingId: string) => {
    setCompletedRecordings(prev => prev.filter(id => id !== recordingId));
  };

  // Filter out dismissed recordings
  const visibleRecordings = processingRecordings.filter(r => !dismissed.includes(r.id));

  if (visibleRecordings.length === 0 && completedRecordings.length === 0) {
    return null;
  }

  return (
    <div className={`recording-saving-indicator ${position}`}>
      {/* Processing recordings */}
      {visibleRecordings.map((recording) => (
        <div key={recording.id} className="saving-item processing">
          <div className="saving-icon">
            <Loader2 size={20} className="spinning" />
          </div>
          <div className="saving-content">
            <div className="saving-title">Saving Recording</div>
            <div className="saving-subtitle">
              {recording.channelName} - {recording.type === 'video' ? 'Video' : 'Audio'}
            </div>
            <div className="saving-message">
              Your recording is being saved. You can safely leave this page.
            </div>
          </div>
          <button
            className="saving-dismiss"
            onClick={() => handleDismiss(recording.id)}
            title="Dismiss (recording will continue saving)"
          >
            <X size={16} />
          </button>
        </div>
      ))}

      {/* Completed recordings notification */}
      {completedRecordings.map((recordingId) => (
        <div key={`completed-${recordingId}`} className="saving-item completed">
          <div className="saving-icon completed-icon">
            <Check size={20} />
          </div>
          <div className="saving-content">
            <div className="saving-title">Recording Saved</div>
            <div className="saving-message">
              Your recording is ready to view in the Recordings panel.
            </div>
          </div>
          <button
            className="saving-dismiss"
            onClick={() => handleDismissCompleted(recordingId)}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
