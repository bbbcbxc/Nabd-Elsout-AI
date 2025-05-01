import React, { useState, useEffect, useRef } from 'react';
import { User, Bot, Pause, Play, Copy, Check, Youtube, Mic, Volume2, VolumeX, Volume1 } from 'lucide-react'; // Import Pause, Play, Copy, and Check icons, and new icons
import { Message, YoutubeVideoResult } from '../types';
import ReactMarkdown, { Components } from 'react-markdown'; // Import react-markdown and Components type
import rehypeRaw from 'rehype-raw'; // Import rehype-raw
import { CSSProperties } from 'react'; // Import CSSProperties
import copy from 'copy-to-clipboard'; // Import copy-to-clipboard
import ReactPlayer from 'react-player/youtube'; // Import ReactPlayer specifically for YouTube

interface ChatMessageProps {
    message: Message;
    language: 'en' | 'ar'; // Add language prop
isYoutubeSearchMode?: boolean;
    currentYoutubeIndex?: number;
}

// Helper to check if content is a video result
function isYoutubeVideoResult(content: any): content is YoutubeVideoResult {
    return typeof content === 'object' && content !== null && 'link' in content && 'title' in content;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
message,
language,
    isYoutubeSearchMode = false,
    currentYoutubeIndex = -1
}) => {
    const isUser = message.role === 'user';
    const [isPlaying, setIsPlaying] = useState(false); // State for play/pause
    const [utterance, setUtterance] = useState<SpeechSynthesisUtterance | null>(null); // Store the utterance
    const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({}); // State to track copied status per code block

    // State for Text-to-Speech (TTS)
    const [isTTSEnabled, setIsTTSEnabled] = useState(false); // Control TTS playback
    const [isTTSPlaying, setIsTTSPlaying] = useState(false);
    const [ttsUtterance, setTtsUtterance] = useState<SpeechSynthesisUtterance | null>(null);

    // NEW: State for gTTS Arabic audio
    const [arabicAudio, setArabicAudio] = useState<HTMLAudioElement | null>(null);

    // State & Ref for Video Player Control
    const playerRef = useRef<ReactPlayer>(null);
    const [videoPlaying, setVideoPlaying] = useState<boolean>(false);
    const [videoVolume, setVideoVolume] = useState<number>(0.8); // Default volume
    const [showControlsTemporarily, setShowControlsTemporarily] = useState(false);

    // State & Ref for Video Voice Commands
    const [isListeningForVideoCommands, setIsListeningForVideoCommands] = useState(false);
    const videoRecognitionRef = useRef<SpeechRecognition | null>(null);

    // --- YouTube Video Play/Pause Control via Global Events ---
    useEffect(() => {
        if (message.type === 'youtube_video') {
            const handlePlay = (e: any) => {
                if (typeof currentYoutubeIndex === 'number' && currentYoutubeIndex >= 0) {
                    // Only play if this is the current video
                    if (isYoutubeSearchMode && currentYoutubeIndex === messageIndex) {
                        setVideoPlaying(true);
                    }
                }
            };
            const handlePause = (e: any) => {
                if (typeof currentYoutubeIndex === 'number' && currentYoutubeIndex >= 0) {
                    // Only pause if this is the current video
                    if (isYoutubeSearchMode && currentYoutubeIndex === messageIndex) {
                        setVideoPlaying(false);
                    }
                }
            };
            window.addEventListener("youtube-play-video", handlePlay);
            window.addEventListener("youtube-pause-video", handlePause);
            return () => {
                window.removeEventListener("youtube-play-video", handlePlay);
                window.removeEventListener("youtube-pause-video", handlePause);
            };
        }
    }, [isYoutubeSearchMode, currentYoutubeIndex, message.type]);

    // --- Ensure only the current video plays in YouTube mode ---
    // messageIndex: index of this message among all messages (needed for multi-video control)
    const [messageIndex, setMessageIndex] = useState<number>(-1);
    useEffect(() => {
        // Find this message's index among all assistant youtube_video messages
        if (message.type === 'youtube_video') {
            // Find index among all youtube_video assistant messages
            const all = document.querySelectorAll('[data-youtube-message]');
            all.forEach((el, idx) => {
                if (el === refDiv.current) setMessageIndex(idx);
            });
        }
    }, [message]);

    // Ref for this message's root div (for index tracking)
    const refDiv = useRef<HTMLDivElement>(null);

    // Sync videoPlaying state with currentYoutubeIndex and isYoutubeSearchMode
    useEffect(() => {
        if (message.type === 'youtube_video') {
            if (isYoutubeSearchMode && messageIndex === currentYoutubeIndex) {
                setVideoPlaying(true);
            } else {
                setVideoPlaying(false);
            }
        }
    }, [isYoutubeSearchMode, currentYoutubeIndex, messageIndex, message.type]);

    useEffect(() => {
        if (!isUser && message.role === 'assistant' && typeof message.content === 'string' && !utterance) {
            const newUtterance = createUtterance(message.content);
            setUtterance(newUtterance);
        }

        return () => {
            if (utterance) {
                speechSynthesis.cancel(); // Stop speaking when component unmounts or message changes
            }
        };
    }, [message, isUser, utterance]);

    const createUtterance = (text: string): SpeechSynthesisUtterance => {
        const newUtterance = new SpeechSynthesisUtterance(text);
        newUtterance.lang = isArabic(text) ? 'ar-SA' : 'en-US'; // Set language
        newUtterance.voice = getVoice(newUtterance.lang);  // Set voice based on language

        // Log the selected voice for debugging:
        console.log("Speaking with voice:", newUtterance.voice ? newUtterance.voice.name : 'Default');

        newUtterance.onstart = () => setIsPlaying(true);
newUtterance.onend = () => setIsPlaying(false);
newUtterance.onpause = () => setIsPlaying(false); // Update isPlaying on pause
newUtterance.onresume = () => setIsPlaying(true);  // Update isPlaying on resume

return newUtterance;
    };

    const speakMessage = (utteranceInstance: SpeechSynthesisUtterance) => {
// Ensure voices are loaded before speaking
if (speechSynthesis.getVoices().length === 0) {
speechSynthesis.onvoiceschanged = () => {
utteranceInstance.voice = getVoice(utteranceInstance.lang); // Re-assign voice
speechSynthesis.speak(utteranceInstance);
};
        } else {
speechSynthesis.speak(utteranceInstance);
        }
    };

const pauseResumeSpeech = () => {
if (!utterance) return;
if (speechSynthesis.speaking) {
if (isPlaying) {
speechSynthesis.pause();
setIsPlaying(false);
} else {
speechSynthesis.resume();
setIsPlaying(true);
            }
} else if (utterance) { // If not speaking but utterance exists, start it
speakMessage(utterance);
        }
    };

    const isArabic = (text: string): boolean => {
// Basic check: look for Arabic characters
return /[\u0600-\u06FF]/.test(text);
    };

const getVoice = (lang: string): SpeechSynthesisVoice | null => {
const voices = speechSynthesis.getVoices();
if (!voices.length) {
console.warn('Speech synthesis voices not loaded yet.');
return null; // Voices not ready
        }
const maleVoices = voices.filter(voice => voice.lang === lang && voice.name.toLowerCase().includes('male'));
if (maleVoices.length > 0) return maleVoices[0];
const languageVoices = voices.filter(voice => voice.lang === lang);
if (languageVoices.length > 0) return languageVoices[0];
console.warn(`No voice found for language: ${lang}. Using default.`);
return null;
    };

// Function to handle copying code
const handleCopy = (code: string, index: string) => {
copy(code);
setCopiedStates(prev => ({ ...prev, [index]: true }));
setTimeout(() => {
setCopiedStates(prev => ({ ...prev, [index]: false }));
}, 1500); // Reset icon after 1.5 seconds
    };

// Define components for ReactMarkdown
const markdownComponents: Components = {
h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-3 mt-2" {...props} />,
h2: ({node, ...props}) => <h2 className="text-xl font-semibold mb-2 mt-1" {...props} />,
h3: ({node, ...props}) => <h3 className="text-lg font-semibold mb-2" {...props} />,
p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
ul: ({node, ...props}) => <ul className="list-disc list-inside mb-2 ml-1" {...props} />,
ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-2 ml-1" {...props} />,
li: ({node, ...props}) => <li className="mb-1" {...props} />,
code: ({node, className, children, ...props}) => {
const isBlock = className && className.startsWith('language-');
const codeBlockId = React.useId();
const codeString = String(children).replace(/n$/, '');

return isBlock ? (
<div className="relative group my-2">
<pre 
className="bg-zinc-800 text-sm text-gray-200 rounded-md p-3 overflow-x-auto border border-zinc-600"
                    >
<code>{codeString}</code>
</pre>
<button
onClick={() => handleCopy(codeString, codeBlockId)}
className="absolute top-2 right-2 p-1.5 bg-zinc-600 rounded-md text-gray-300 hover:bg-zinc-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150"
title="Copy code"
                    >
{copiedStates[codeBlockId] ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
</button>
</div>
) : (
                <code className="bg-zinc-600 text-sm text-amber-300 rounded px-1 py-0.5 mx-0.5">
{children}
</code>
            );
        },
a: ({node, ...props}) => <a className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
strong: ({node, ...props}) => <strong className="font-bold" {...props} />,
em: ({node, ...props}) => <em className="italic" {...props} />,
blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-gray-500 pl-3 italic text-gray-400 my-2" {...props} />,
    };

// --- TTS Logic ---
useEffect(() => {
// Initialize or clear TTS utterance when message content changes
if (!isUser && message.role === 'assistant' && typeof message.content === 'string') {
const newUtterance = createUtterance(message.content);
setTtsUtterance(newUtterance);
} else {
setTtsUtterance(null); // Clear if not eligible
        }

// Cleanup: Cancel speech if component unmounts or utterance changes
return () => {
// Check if speech is active before cancelling
if (speechSynthesis.speaking || speechSynthesis.pending) {
speechSynthesis.cancel();
            }
        };
}, [message.content, isUser]); // Re-evaluate if the message content changes

// NEW: Helper to normalize Arabic text by removing diacritics (tashkeel)
const normalizeArabic = (text: string): string => {
        return text.replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06ED]/g, '');
    };

// Updated: Helper function to call backend gTTS and play audio for Arabic text with enhanced human-like parameters
const playArabicAudio = (text: string) => {
const normalizedText = normalizeArabic(text);
// Added parameters: tld=com for a natural voice variation, and slow=false for a normal speaking rate.
fetch(`/api/gtts?text=${encodeURIComponent(normalizedText)}&lang=ar&tld=com&slow=false`)
.then(res => res.blob())
.then(blob => {
const url = URL.createObjectURL(blob);
const audio = new Audio(url);
audio.onended = () => {
setIsTTSPlaying(false);
                };
setArabicAudio(audio);
setIsTTSPlaying(true);
audio.play();
            })
.catch(err => console.error("gTTS error:", err));
    };

const toggleTTS = () => {
if (!ttsUtterance) return;
// NEW: For Arabic text, use the gTTS-based audio instead of speechSynthesis
if (typeof message.content === 'string' && isArabic(message.content)) {
if (arabicAudio) {
if (!arabicAudio.paused) {
arabicAudio.pause();
setIsTTSPlaying(false);
} else {
                    arabicAudio.play();
setIsTTSPlaying(true);
                }
} else {
playArabicAudio(message.content);
            }
return;
        }
// ...existing non-Arabic TTS logic...
if (isTTSEnabled) {
if (isTTSPlaying) {
speechSynthesis.pause();
} else {
speechSynthesis.resume();
            }
setIsTTSEnabled(false);
} else {
const freshUtterance = createUtterance(ttsUtterance.text);
setTtsUtterance(freshUtterance);
speakMessage(freshUtterance);
setIsTTSEnabled(true);
        }
    };

// --- Video Player Controls Logic ---
const handleVideoPlayPause = () => setVideoPlaying(prev => !prev);
const handleVideoVolumeChange = (increase: boolean) => {
setVideoVolume(prev => {
const newVolume = increase ? Math.min(prev + 0.15, 1) : Math.max(prev - 0.15, 0);
return newVolume;
});
    };
const handleVideoSeek = (forward: boolean) => {
const currentTime = playerRef.current?.getCurrentTime() || 0;
const seekTime = forward ? currentTime + 10 : currentTime - 10;
playerRef.current?.seekTo(seekTime, 'seconds');
    };

// --- Video Voice Command Logic ---
const startVideoCommandRecognition = () => {
if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
console.error("Speech recognition not supported");
return;
        }
if (videoRecognitionRef.current) {
console.log("Video command recognition already active for this message");
return;
        }

const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
videoRecognitionRef.current = new SpeechRecognitionAPI();
const recognition = videoRecognitionRef.current;

recognition.continuous = true; // اجعلها مستمرة فعليًا
recognition.interimResults = false;
recognition.lang = language === 'ar' ? 'ar-SA' : 'en-US';
console.log(`Starting video command recognition in ${language}`);

recognition.onresult = (event: SpeechRecognitionEvent) => {
const transcript = event.results[0][0].transcript.toLowerCase().trim();
console.log("Video Command Heard:", transcript);
if (transcript.includes('pause') || transcript.includes('ايقاف') || transcript.includes('خلاص')) {
setVideoPlaying(false);
} else if (transcript.includes('play') || transcript.includes('continue') || transcript.includes('تشغيل') || transcript.includes('استمر')) {
setVideoPlaying(true);
} else if (transcript.includes('increase volume') || transcript.includes('volume up') || transcript.includes('ارفع الصوت') || transcript.includes('ارفع')) {
handleVideoVolumeChange(true);
} else if (transcript.includes('decrease volume') || transcript.includes('volume down') || transcript.includes('اخفض الصوت')) {
handleVideoVolumeChange(false);
} else if (transcript.includes('forward') || transcript.includes('تقدم')) {
handleVideoSeek(true);
} else if (transcript.includes('back') || transcript.includes('ارجع')) {
handleVideoSeek(false);
            }
        };

recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
console.error("Video Command Recognition Error:", event.error);
setIsListeningForVideoCommands(false);
            videoRecognitionRef.current = null;
        };

recognition.onend = () => {
console.log("Video command recognition ended");
setIsListeningForVideoCommands(false);
videoRecognitionRef.current = null;
// Wait 1 second, then restart for another 60 seconds
setTimeout(() => {
startVideoCommandRecognition();
}, 1000); // <-- 1 second only
        };

try {
recognition.start();
setIsListeningForVideoCommands(true);
// Stop after 60 seconds, then will auto-restart after 1 second via onend
setTimeout(() => {
if (videoRecognitionRef.current) {
                    videoRecognitionRef.current.stop();
                }
}, 60000);
} catch (e) {
console.error("Error starting video command recognition:", e);
setIsListeningForVideoCommands(false);
videoRecognitionRef.current = null;
        }
    };

const stopVideoCommandRecognition = () => {
if (videoRecognitionRef.current) {
videoRecognitionRef.current.stop();
// onend should handle cleanup
        }
    };

// Cleanup effect for video command recognition
useEffect(() => {
return () => {
stopVideoCommandRecognition();
        };
}, []);

useEffect(() => {
// When the message changes, stop any active video command recognition.
stopVideoCommandRecognition();
}, [message]);

useEffect(() => {
// Start the main recognition when the component mounts
// Define the startMainRecognition function or remove this line if not needed
console.warn("startMainRecognition is not implemented.");

// Automatically play YouTube video if the message is of type 'youtube_video'
if (message.type === 'youtube_video' && isYoutubeVideoResult(message.content)) {
console.log("Auto-playing YouTube video...");
setVideoPlaying(true); // Start playing the video
        }

return () => {
stopVideoCommandRecognition(); // Cleanup video recognition
        };
}, []);

return (
<div
className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
            ref={refDiv}
            data-youtube-message={message.type === 'youtube_video' ? '1' : undefined}
        >
<div className={`flex items-start gap-3 max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
<div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-blue-600' : 'bg-teal-600'}`}>
{isUser ? <User size={18} className="text-white" /> : <Bot size={18} className="text-white" />}
</div>

{/* Content Bubble or Video Player */}
{message.role === 'assistant' && message.type === 'youtube_video' && isYoutubeVideoResult(message.content) ? (
// Render YouTube Video Player
<div className="bg-zinc-700 rounded-lg shadow-md overflow-hidden p-2 inline-block relative group">
{/* Optional: Title above player */}
                        <a
href={message.content.link}
target="_blank"
rel="noopener noreferrer"
className="text-xs font-medium text-red-300 hover:text-red-200 line-clamp-1 mb-2 block px-1"
title={message.content.title}
style={{ maxWidth: '400px' }}
                        >
{message.content.title}
</a>
{/* Remove aspect ratio container, set fixed dimensions on player */}
<div className="overflow-hidden rounded-md relative"
onMouseEnter={() => setShowControlsTemporarily(true)}
onMouseLeave={() => setShowControlsTemporarily(false)}
                        >
<ReactPlayer
ref={playerRef}
url={message.content.link}
playing={videoPlaying}
volume={videoVolume}
controls={true}
width="400px"
height="256px"
className="react-player"
onPlay={() => {
console.log("Video started playing.");
setVideoPlaying(true);
startVideoCommandRecognition(); // تشغيل ميكروفون الأوامر عند تشغيل الفيديو
                                }}
onPause={() => {
console.log("Video paused.");
setVideoPlaying(false);
stopVideoCommandRecognition(); // إيقاف ميكروفون الأوامر عند إيقاف الفيديو
                                }}
                            />
{/* Voice Control Button Overlay */}
<button
onClick={isListeningForVideoCommands ? stopVideoCommandRecognition : startVideoCommandRecognition}
className={`absolute bottom-2 right-2 z-10 p-1.5 rounded-full transition-all duration-200 ${isListeningForVideoCommands ? 'bg-red-500 text-white scale-110' : 'bg-black bg-opacity-40 text-gray-200 hover:bg-opacity-60 scale-100' + (showControlsTemporarily || isListeningForVideoCommands ? ' opacity-100' : ' opacity-0 group-hover:opacity-100')}`}
title={language === 'en' ? 'Voice Commands' : 'أوامر صوتية'}
                            >
<Mic size={14} />
</button>
</div>
{/* Custom Volume Display (Optional) */}
<div className="flex items-center justify-end text-xs px-1 pt-1 text-gray-400">
{videoVolume === 0 ? <VolumeX size={12}/> : videoVolume < 0.5 ? <Volume1 size={12}/> : <Volume2 size={12}/> }
<span className="ml-1">{Math.round(videoVolume * 100)}%</span>
</div>
</div>
) : typeof message.content === 'string' ? (
// Render Standard Text Bubble (User or Assistant Text)
<div className={`rounded-lg px-4 py-3 shadow-md ${isUser ? 'bg-blue-700 text-white' : 'bg-zinc-700 text-gray-200'}`}>
<ReactMarkdown
rehypePlugins={[rehypeRaw]}
components={markdownComponents}
                        >
{message.content}
</ReactMarkdown>
{/* Add Play/Pause button for assistant text messages */}
{!isUser && typeof message.content === 'string' && utterance && (
<button
onClick={toggleTTS}
className={`mt-2 text-xs flex items-center gap-1 ${isTTSEnabled ? 'text-blue-300' : 'text-gray-400 hover:text-gray-200'}`}
                            >
{isTTSPlaying ? <Pause size={12} /> : <Play size={12} />}
{isTTSEnabled ? (isArabic(message.content) ? 'إيقاف الصوت' : 'Stop Speech') : (isArabic(message.content) ? 'تشغيل الصوت' : 'Play Speech')}
</button>
                        )}
</div>
) : (
// Fallback for unexpected content type (should not happen with current logic)
<div className={`rounded-lg px-4 py-3 shadow-md bg-red-800 text-white text-xs italic`}>
[Error: Unexpected message content format]
</div>
                )}
</div>
</div>
    );
};
