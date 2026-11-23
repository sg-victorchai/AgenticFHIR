import React from 'react';
import type { AuthoringTheme } from './Phase0Authoring';

interface AuthoringSendButtonProps {
  label: string;
  disabled: boolean;
  theme: AuthoringTheme;
  type?: 'button' | 'submit';
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

const AuthoringSendButton: React.FC<AuthoringSendButtonProps> = ({
  label,
  disabled,
  theme,
  type = 'button',
  onClick,
}) => {
  const themeClasses =
    theme === 'blue-horizon'
      ? 'bg-[#477bea] hover:bg-[#3568d4]'
      : 'bg-[#262626] hover:bg-[#404040]';

  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`absolute bottom-[14px] right-1 flex h-9 w-10 items-center justify-center rounded-xl text-white transition-colors disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 ${themeClasses}`}
    >
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m9 10-5 5 5 5M4 15h11a4 4 0 0 0 4-4V4" />
      </svg>
    </button>
  );
};

export default AuthoringSendButton;
