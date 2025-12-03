import React, { useRef, useEffect } from 'react';

interface EditInputProps {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  isFile?: boolean;
}

const EditInput: React.FC<EditInputProps> = ({ initialValue, onSave, onCancel, isFile = false }) => {
  // Strip .md extension for display if it's a file
  const displayValue = isFile && initialValue.endsWith('.md')
    ? initialValue.slice(0, -3)
    : initialValue;

  const [value, setValue] = React.useState(displayValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Only save if there's a value, otherwise cancel
      if (value.trim()) {
        // Add .md extension back when saving if it's a file and doesn't already have it
        const savedValue = isFile && !value.endsWith('.md') ? `${value}.md` : value;
        onSave(savedValue);
      } else {
        onCancel();
      }
    }
    if (e.key === 'Escape') onCancel();
  };

  const handleBlur = () => {
    // Only save if there's a value, otherwise cancel
    if (value.trim()) {
      // Add .md extension back when saving if it's a file and doesn't already have it
      const savedValue = isFile && !value.endsWith('.md') ? `${value}.md` : value;
      onSave(savedValue);
    } else {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={{
        marginLeft: '4px',
        backgroundColor: '#1e1e1e',
        color: '#e0e0e0',
        border: '1px solid #555',
        borderRadius: '4px',
        padding: '2px 6px',
        width: '100%',
        fontSize: '13px',
        outline: 'none',
      }}
    />
  );
};

export default EditInput;