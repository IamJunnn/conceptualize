import { forwardRef } from 'react';
import DatePicker from 'react-datepicker';
import { Calendar } from 'lucide-react';
import 'react-datepicker/dist/react-datepicker.css';
import './CustomDatePicker.css';

interface CustomDatePickerProps {
  selected: Date | null;
  onChange: (date: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
  placeholderText?: string;
  disabled?: boolean;
  id?: string;
}

// Custom input component for the date picker
const CustomInput = forwardRef<HTMLButtonElement, { value?: string; onClick?: () => void; placeholder?: string; disabled?: boolean }>(
  ({ value, onClick, placeholder, disabled }, ref) => (
    <button
      type="button"
      className="custom-datepicker-input"
      onClick={onClick}
      ref={ref}
      disabled={disabled}
    >
      <span className={value ? 'has-value' : 'placeholder'}>
        {value || placeholder || 'Select date'}
      </span>
      <Calendar size={18} className="calendar-icon" />
    </button>
  )
);

CustomInput.displayName = 'CustomInput';

export default function CustomDatePicker({
  selected,
  onChange,
  minDate,
  maxDate,
  placeholderText = 'Select date',
  disabled = false,
  id,
}: CustomDatePickerProps) {
  return (
    <div className="custom-datepicker-wrapper" id={id}>
      <DatePicker
        selected={selected}
        onChange={onChange}
        minDate={minDate}
        maxDate={maxDate}
        placeholderText={placeholderText}
        disabled={disabled}
        customInput={<CustomInput placeholder={placeholderText} disabled={disabled} />}
        dateFormat="MMM d, yyyy"
        showPopperArrow={false}
        popperPlacement="bottom-start"
        calendarClassName="custom-calendar"
        todayButton="Today"
        dayClassName={(date) => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const compareDate = new Date(date);
          compareDate.setHours(0, 0, 0, 0);
          return compareDate.getTime() === today.getTime() ? 'today-date' : '';
        }}
      />
    </div>
  );
}
