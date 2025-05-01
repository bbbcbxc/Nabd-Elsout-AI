import React from 'react';
import { Book, Home, Plus, Trash2 } from 'lucide-react';

interface SidebarProps {
    onNewChat: () => void;
    onClearChat: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNewChat, onClearChat }) => {
    return (
        <nav className="bg-zinc-900 rounded-xl shadow-md p-4 space-y-3 flex flex-col h-full">
            <h2 className="text-lg font-semibold mb-2 text-gray-200"></h2>
            <h2 className="text-lg font-semibold mb-2 text-gray-200">SideBar</h2>
            <h2 className="text-lg font-semibold mb-2 text-gray-200">_______________________</h2>
            <ul className="space-y-2">
                <li>
                    <a href="#" className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-zinc-800 transition-colors text-gray-300">
                        <Home className="w-4 h-4" />
                        <span>Home</span>
                    </a>
                </li>
                <li>
                    <button onClick={onNewChat} className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-zinc-800 transition-colors text-gray-300 w-full text-left">
                        <Plus className="w-4 h-4" />
                        <span>New Chat</span>
                    </button>
                </li>
                <li>
                    <button onClick={onClearChat} className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-zinc-800 transition-colors text-gray-300 w-full text-left">
                        <Trash2 className="w-4 h-4" />
                        <span>Clear Chat</span>
                    </button>
                </li>
                <li>
                    <a href="#" className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-zinc-800 transition-colors text-gray-300">
                        <Book className="w-4 h-4" />
                        <span>Books</span>
                    </a>
                </li>
            </ul>
        </nav>
    );
};
