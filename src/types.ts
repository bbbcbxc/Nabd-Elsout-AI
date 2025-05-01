export interface YoutubeVideoResult {
  title: string;
  link: string;
  snippet?: string; // Keep snippet potentially
  thumbnailUrl?: string;
}

export interface Message {
  content: string | YoutubeVideoResult; // Content can be string or video object
  role: 'user' | 'assistant';
  timestamp: Date;
  type?: 'text' | 'youtube_video'; // Optional type discriminator
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  selectedLanguage: 'en' | 'ar';
}

export interface YoutubeVideo {
  id: string;
  title: string;
  link: string;
  snippet: string;
  thumbnailUrl?: string;
}