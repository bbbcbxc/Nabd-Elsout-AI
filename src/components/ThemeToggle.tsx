import React from 'react';
import { Moon, Sun } from 'lucide-react';

export const ThemeToggle: React.FC = () => {
    const [isDarkMode, setIsDarkMode] = React.useState(false); // Replace with your theme context

    const toggleTheme = () => {
        setIsDarkMode(!isDarkMode);
        // Implement your theme switching logic here (e.g., update a CSS class on the body)
        document.documentElement.classList.toggle('dark');
    };

    return (
        <button
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
            {isDarkMode ? <Sun className="w-5 h-5 text-gray-500" /> : <Moon className="w-5 h-5 text-gray-500" />}
        </button>
    );
};