import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { RepeatFrequency, RecurrencePattern } from '../../services/teamTodoTypes';
import './RepeatSelector.css';

interface RepeatOption {
  id: string;
  label: string;
  type: RepeatFrequency;
  weekDays?: number[];
  weekOfMonth?: number;
}

interface RepeatSelectorProps {
  selectedDate: string | null; // YYYY-MM-DD format
  value: RecurrencePattern | null;
  onChange: (pattern: RecurrencePattern | null) => void;
  onCustomClick: () => void;
  disabled?: boolean;
}

// Day names
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Get ordinal suffix (1st, 2nd, 3rd, 4th)
const getOrdinal = (n: number): string => {
  if (n === -1) return 'last';
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
};

// Get week of month for a date (1st, 2nd, 3rd, 4th, or -1 for last)
const getWeekOfMonth = (date: Date): number => {
  const dayOfMonth = date.getDate();
  const weekNum = Math.ceil(dayOfMonth / 7);

  // Check if this is the last occurrence of this weekday in the month
  const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const daysUntilEndOfMonth = lastDayOfMonth.getDate() - dayOfMonth;

  if (daysUntilEndOfMonth < 7) {
    return weekNum; // Could return -1 for "last" but keeping it simple
  }

  return weekNum;
};

// Generate repeat options based on selected date
const generateOptions = (dateStr: string | null): RepeatOption[] => {
  const options: RepeatOption[] = [
    { id: 'none', label: 'Does not repeat', type: 'none' },
    { id: 'daily', label: 'Daily', type: 'daily' },
  ];

  if (dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    const dayName = DAY_NAMES[dayOfWeek];
    const weekOfMonth = getWeekOfMonth(date);

    options.push(
      { id: 'weekly', label: `Weekly on ${dayName}`, type: 'weekly', weekDays: [dayOfWeek] },
      { id: 'biweekly', label: `Biweekly on ${dayName}`, type: 'biweekly', weekDays: [dayOfWeek] },
      { id: 'monthly', label: `Monthly on the ${getOrdinal(weekOfMonth)} ${dayName}`, type: 'monthly', weekDays: [dayOfWeek], weekOfMonth }
    );
  } else {
    // Generic options when no date selected
    options.push(
      { id: 'weekly', label: 'Weekly', type: 'weekly' },
      { id: 'biweekly', label: 'Biweekly', type: 'biweekly' },
      { id: 'monthly', label: 'Monthly', type: 'monthly' }
    );
  }

  options.push(
    { id: 'weekdays', label: 'Every weekday (Monday to Friday)', type: 'weekdays', weekDays: [1, 2, 3, 4, 5] },
    { id: 'custom', label: 'Custom...', type: 'custom' }
  );

  return options;
};

// Get display label for current selection
const getDisplayLabel = (value: RecurrencePattern | null, selectedDate: string | null): string => {
  if (!value || value.type === 'none') {
    return 'Does not repeat';
  }

  if (value.type === 'custom' && value.interval && value.unit) {
    const unitLabel = value.interval === 1 ? value.unit : `${value.unit}s`;
    let label = `Every ${value.interval === 1 ? '' : value.interval + ' '}${unitLabel}`;

    if (value.unit === 'week' && value.weekDays && value.weekDays.length > 0) {
      const dayLabels = value.weekDays.map(d => DAY_NAMES[d].substring(0, 3)).join(', ');
      label += ` on ${dayLabels}`;
    }

    return label;
  }

  // For standard types, use generated options
  const options = generateOptions(selectedDate);
  const option = options.find(o => o.type === value.type);
  return option?.label || 'Does not repeat';
};

export default function RepeatSelector({
  selectedDate,
  value,
  onChange,
  onCustomClick,
  disabled = false,
}: RepeatSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const options = generateOptions(selectedDate);

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

  const handleSelect = (option: RepeatOption) => {
    if (option.type === 'custom') {
      setIsOpen(false);
      onCustomClick();
      return;
    }

    if (option.type === 'none') {
      onChange(null);
    } else {
      const pattern: RecurrencePattern = {
        type: option.type,
        interval: option.type === 'biweekly' ? 2 : 1,
        unit: option.type === 'daily' ? 'day' : option.type === 'monthly' ? 'month' : 'week',
        weekDays: option.weekDays,
        weekOfMonth: option.weekOfMonth,
        endType: 'never',
      };
      onChange(pattern);
    }
    setIsOpen(false);
  };

  const currentLabel = getDisplayLabel(value, selectedDate);
  const currentType = value?.type || 'none';

  return (
    <div className="repeat-selector-wrapper" ref={containerRef}>
      <button
        type="button"
        className="repeat-selector-input"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className={value && value.type !== 'none' ? 'has-value' : 'placeholder'}>
          {currentLabel}
        </span>
        <ChevronDown size={18} className={`chevron-icon ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="repeat-selector-dropdown">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`repeat-option ${currentType === option.type ? 'selected' : ''}`}
              onClick={() => handleSelect(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
