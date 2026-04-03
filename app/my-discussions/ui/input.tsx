import { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export function Input({ className = '', ...props }: InputProps) {
  return (
    <input
      className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-800 placeholder-slate-400
        focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent
        disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    />
  );
}
