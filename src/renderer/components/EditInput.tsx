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
      // Add .md extension back when saving if it's a file and doesn't already have it
      const savedValue = isFile && !value.endsWith('.md') ? `${value}.md` : value;
      onSave(savedValue);
    }
    if (e.key === 'Escape') onCancel();
  };

  const handleBlur = () => {
    // Add .md extension back when saving if it's a file and doesn't already have it
    const savedValue = isFile && !value.endsWith('.md') ? `${value}.md` : value;
    onSave(savedValue);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="ml-2 bg-gray-900 text-white border border-blue-500 rounded px-1 w-full"
    />
  );
};

export default EditInput;