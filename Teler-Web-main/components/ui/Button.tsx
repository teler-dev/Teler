import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  children: React.ReactNode;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({ 
  variant = 'primary', 
  children, 
  className = '', 
  ...props 
}) => {
  const baseStyles = "px-6 py-3 rounded-lg font-medium transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2";
  
  const variants = {
    primary: "bg-cyan-500 text-navy-900 hover:bg-cyan-400 hover:shadow-[0_0_20px_rgba(19,214,255,0.4)] font-bold",
    secondary: "bg-navy-700 text-white border border-white/10 hover:bg-navy-600 hover:border-cyan-500/50",
    outline: "bg-transparent border border-cyan-500 text-cyan-500 hover:bg-cyan-500/10",
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`} 
      {...props}
    >
      {children}
    </button>
  );
};