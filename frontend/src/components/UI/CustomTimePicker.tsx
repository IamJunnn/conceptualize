import { useState, useRef, useEffect } from 'react';
import { Clock } from 'lucide-react';
import './CustomTimePicker.css';

interface CustomTimePickerProps {
  value: string; // HH:MM format (24h)
  onChange: (time: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

// Generate time slots in 15-minute intervals
const generateTimeSlots = (): string[] => {
  const slots: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const h = String(hour).padStart(2, '0');
      const m = String(minute).padStart(2, '0');
      slots.push(`${h}:${m}`);
    }
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

// Format 24h time to 12h display
const formatTime12h = (time24: string): string => {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
};

export default function CustomTimePicker({
  value,
  onChange,
  disabled = false,
  placeholder = 'Select time',
}: CustomTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Scroll to selected time when dropdown opens
  useEffect(() => {
    if (isOpen && listRef.current && value) {
      const selectedIndex = TIME_SLOTS.indexOf(value);
      if (selectedIndex !== -1) {
        const itemHeight = 40;
        listRef.current.scrollTop = Math.max(0, selectedIndex * itemHeight - 80);
      }
    }
  }, [isOpen, value]);

  const handleSelect = (time: string) => {
    onChange(time);
    setIsOpen(false);
  };

  return (
    <div className="custom-timepicker-wrapper" ref={containerRef}>
      <button
        type="button"
        className="custom-timepicker-input"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className={value ? 'has-value' : 'placeholder'}>
          {value ? formatTime12h(value) : placeholder}
        </span>
        <Clock size={18} className="clock-icon" />
      </button>

      {isOpen && (
        <div className="timepicker-dropdown" ref={listRef}>
          {TIME_SLOTS.map((time) => (
            <button
              key={time}
              type="button"
              className={`timepicker-option ${time === value ? 'selected' : ''}`}
              onClick={() => handleSelect(time)}
            >
              {formatTime12h(time)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper function to get the next 15-minute slot from current time
export const getNextTimeSlot = (): string => {
  const now = new Date();
  const minutes = now.getMinutes();
  const hours = now.getHours();

  // Round up to next 15-minute interval
  const roundedMinutes = Math.ceil(minutes / 15) * 15;

  let newHours = hours;
  let newMinutes = roundedMinutes;

  if (roundedMinutes >= 60) {
    newMinutes = 0;
    newHours = (hours + 1) % 24;
  }

  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
};

// Helper function to add hours to a time string
export const addHoursToTime = (time: string, hoursToAdd: number): string => {
  const [hours, minutes] = time.split(':').map(Number);
  let newHours = (hours + hoursToAdd) % 24;
  return `${String(newHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};
