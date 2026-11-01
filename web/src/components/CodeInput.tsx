import { forwardRef, useState } from 'react';

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  tone?: 'dark' | 'light';
  disabled?: boolean;
}

/**
 * Tek bir gerçek <input> üstüne çizilmiş 6 kutu. Ayrı ayrı input'lara göre
 * Android klavyelerinde silme, yapıştırma ve SMS otomatik doldurma sorunsuz çalışır.
 */
export const CodeInput = forwardRef<HTMLInputElement, Props>(function CodeInput({ id, value, onChange, tone = 'dark', disabled }, ref) {
  const [focused, setFocused] = useState(false);
  const digits = value.padEnd(6, ' ').split('').slice(0, 6);
  const active = Math.min(value.length, 5);

  return (
    <label className={`otp otp-${tone}`} htmlFor={id}>
      <input
        ref={ref}
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        aria-label="6 haneli kod"
      />
      {digits.map((d, i) => (
        <span key={i} className={`cell${focused && i === active ? ' active' : ''}${d.trim() ? ' filled' : ''}`} aria-hidden="true">
          {d.trim()}
        </span>
      ))}
    </label>
  );
});
