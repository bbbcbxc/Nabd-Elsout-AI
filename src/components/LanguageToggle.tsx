import React from 'react';
import { Languages } from 'lucide-react';

interface LanguageToggleProps {
  language: 'en' | 'ar';
  onToggle: (lang: 'en' | 'ar') => void;
}

export const LanguageToggle: React.FC<LanguageToggleProps> = ({ language, onToggle }) => {
  return (
    <button
      onClick={() => onToggle(language === 'en' ? 'ar' : 'en')}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
    >
      <Languages className="w-4 h-4 text-white" />
      <span className="text-sm text-white font-medium">
        {language === 'en' ? 'English' : 'العربية'}
      </span>
    </button>
  );
};