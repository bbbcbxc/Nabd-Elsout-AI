import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI, Content, Part, GenerationConfig, ModelParams, TextPart } from '@google/generative-ai';
import { Send, Loader2, BookOpen, AlertCircle, Paperclip, Book, Brain, Globe2, Clock, Mic, Youtube, X } from 'lucide-react';
import axios from 'axios';
import { ChatMessage } from './components/ChatMessage';
import { LanguageToggle } from './components/LanguageToggle';
import { FunctionSquare } from 'lucide-react';
import { Message, ChatState, YoutubeVideoResult } from './types';
import { Sidebar } from './components/Sidebar';

// Add interfaces for SpeechRecognition events if @types/dom-speech-recognition doesn't cover everything
interface SpeechRecognitionEvent extends Event {
    resultIndex: number;
    results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
}

// --- Constants ---
const MAX_HISTORY_MESSAGES = 20; // Max messages for API history
const MAX_LOCAL_STORAGE_MESSAGES = 50; // Max messages to store locally
const LOCAL_STORAGE_KEY = 'nabdElsoutChatHistory'; // Key for local storage

function App() {
    const [chatState, setChatState] = useState<ChatState>(() => {
        // Auto-detect default language based on the device's language
        const defaultLang = navigator.language.startsWith('ar') ? 'ar' : 'en';
        // Initialize state from localStorage or default
        const storedMessages = localStorage.getItem(LOCAL_STORAGE_KEY);
        let initialMessages: Message[] = [];
        if (storedMessages) {
            try {
                const parsedMessages = JSON.parse(storedMessages);
                // Ensure loaded messages have Date objects
                initialMessages = parsedMessages.map((msg: any) => ({
                    ...msg,
                    // Ensure content is correctly typed (might need deeper check if loading video results)
                    content: msg.content,
                    timestamp: new Date(msg.timestamp) // Rehydrate Date object
                }));
            } catch (e) {
                console.error("Failed to parse messages from localStorage", e);
                localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear invalid data
            }
        }
        return {
            messages: initialMessages,
            isLoading: false,
            selectedLanguage: defaultLang // Default language, could also store/load this
        };
    });
    const [input, setInput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isRecording, setIsRecording] = useState(false);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    
    // State for YouTube Search Mode
    const [isYoutubeSearchMode, setIsYoutubeSearchMode] = useState(false);

    // State for YouTube video history and current playing index
    const [youtubeHistory, setYoutubeHistory] = useState<YoutubeVideoResult[]>([]);
    const [currentYoutubeIndex, setCurrentYoutubeIndex] = useState<number>(-1);

    // State for typing timeout
    const [typingTimeout, setTypingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

    // --- Effects ---

    // Scroll to bottom when messages change
    useEffect(() => {
        scrollToBottom();
    }, [chatState.messages]);

    // Auto-clear error message
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    // Save messages to localStorage when they change
    useEffect(() => {
        try {
            // Store only the last N messages
            const messagesToStore = chatState.messages.slice(-MAX_LOCAL_STORAGE_MESSAGES);
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(messagesToStore));
        } catch (e) {
            console.error("Failed to save messages to localStorage", e);
        }
    }, [chatState.messages]);

    // Speech recognition cleanup
    useEffect(() => {
        // Cleanup function
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
                recognitionRef.current = null;
                setIsRecording(false);
            }
            // Also cancel any ongoing speech synthesis
            speechSynthesis.cancel();
        };
    }, []); // Run only on mount/unmount

    useEffect(() => {
        // Welcome message for English only
        if (chatState.selectedLanguage === 'en') {
            const welcomeMessage = "Welcome to Nabd Elsout AI! How can I help you today?";
            const utterance = new SpeechSynthesisUtterance(welcomeMessage);
            utterance.lang = 'en-US';
            speechSynthesis.speak(utterance);
        }
    }, [chatState.selectedLanguage]);

    useEffect(() => {
        // Play welcome audio and then start speech recognition immediately after
        const audio = new Audio('/aseen.mp3'); // Path to your audio file in the public directory
        audio.play();
        audio.onended = () => {
            console.log("Welcome audio has finished playing.");
            startRecognition();  // Start the mic automatically
        };
        audio.onerror = (event) => {
            console.error("Error playing audio:", event);
            setError(chatState.selectedLanguage === 'en' ? "Error playing welcome audio." : "خطأ في تشغيل الصوت الترحيبي.");
            startRecognition();  // Start the mic even if audio fails
        };

        // Automatically start recognition after a delay if audio doesn't play
        const fallbackTimeout = setTimeout(() => {
            if (!isRecording) {
                console.log("Fallback: Starting recognition after delay.");
                startRecognition();
            }
        }, 5000); // 5 seconds fallback

        return () => clearTimeout(fallbackTimeout); // Cleanup fallback timer
    }, []);

    useEffect(() => {
        if (input.trim() === '') {
            // إذا كان الإدخال فارغًا، لا تفعل شيئًا
            return;
        }

        // إعادة ضبط المؤقت عند كل تغيير في الإدخال
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }

        // إعداد مؤقت لإرسال الرسالة بعد 5 ثوانٍ من التوقف عن الكتابة
        const timeout = setTimeout(() => {
            handleSend(); // استدعاء وظيفة الإرسال
        }, 5000); // تقليل الوقت إلى 5 ثوانٍ

        setTypingTimeout(timeout);

        // تنظيف المؤقت عند إلغاء التأثير
        return () => clearTimeout(timeout);
    }, [input]);

    useEffect(() => {
        // تشغيل الصوت تلقائيًا عند إضافة رسالة جديدة من البوت
        if (chatState.messages.length > 0) {
            const lastMessage = chatState.messages[chatState.messages.length - 1];
            if (lastMessage.role === 'assistant' && typeof lastMessage.content === 'string') {
                const utterance = new SpeechSynthesisUtterance(lastMessage.content);
                utterance.lang = chatState.selectedLanguage === 'ar' ? 'ar-SA' : 'en-US';

                // اختيار صوت عربي أجمل إذا كان متاحًا
                const voices = speechSynthesis.getVoices();
                if (chatState.selectedLanguage === 'ar') {
                    const arabicVoice = voices.find(voice => voice.lang === 'ar-SA' && voice.name.includes('Google'));
                    if (arabicVoice) {
                        utterance.voice = arabicVoice;
                    }
                }

                // التأكد من تشغيل الصوت فورًا
                utterance.onstart = () => {
                    console.log("Speech synthesis started for message:", lastMessage.content);
                };

                utterance.onerror = (event) => {
                    console.error("Speech synthesis error:", event.error);
                };

                utterance.onend = () => {
                    console.log("Speech synthesis finished for message:", lastMessage.content);
                };

                // تشغيل صوت منخفض جدًا لإيهام المتصفح
                const playSilentSound = () => {
                    const silentUtterance = new SpeechSynthesisUtterance(" ");
                    silentUtterance.volume = 0.01; // صوت منخفض جدًا
                    silentUtterance.lang = 'en-US'; // لغة افتراضية
                    speechSynthesis.speak(silentUtterance);
                };

                // تشغيل الصوت مع صوت منخفض جدًا
                playSilentSound();
                setTimeout(() => {
                    speechSynthesis.cancel(); // إلغاء أي صوت قيد التشغيل
                    speechSynthesis.speak(utterance); // تشغيل الصوت الفعلي
                }, 100); // تأخير بسيط لضمان تشغيل الصوت المنخفض أولاً
            }
        }
    }, [chatState.messages]);

    // --- Functions ---

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const startRecognition = () => {
        if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
            setError(chatState.selectedLanguage === 'en' ? "Speech recognition not supported." : "التعرف على الصوت غير مدعوم.");
            return;
        }

        if (recognitionRef.current) {
            console.log('Recognition already in progress');
            return;
        }

        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognitionAPI();
        const recognition = recognitionRef.current;

        recognition.continuous = true; // اجعل التعرف على الصوت مستمرًا
        recognition.interimResults = true; // عرض النتائج المؤقتة
        recognition.lang = chatState.selectedLanguage === 'ar' ? 'ar-SA' : 'en-US'; // ضبط اللغة بناءً على اللغة المحددة

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            console.log("Recognized Text:", finalTranscript); // طباعة النص المعترف به

            if (finalTranscript.trim()) {
                const keyPhrase = finalTranscript.toLowerCase().trim();
                console.log("Normalized Text:", keyPhrase); // طباعة النص بعد المعالجة

                if (keyPhrase.includes("open youtube") || keyPhrase.includes("افتح اليوتيوب") || keyPhrase.includes("انبت يوتيوب")) {
                    console.log("YouTube mode activated!");
                    setIsYoutubeSearchMode(true); // تفعيل وضع YouTube
                    setInput(''); // مسح الإدخال عند التبديل إلى وضع YouTube
                    setChatState(prev => ({ ...prev, isLoading: false })); // منع البوت من الرد
                    setCurrentYoutubeIndex(youtubeHistory.length - 1); // Show last video if any
                    // Voice feedback for YouTube activation
                    setTimeout(() => {
                        const msg = chatState.selectedLanguage === 'ar'
                            ? "تم تنفيذ الأمر، تم تفعيل وضع يوتيوب."
                            : "Command executed, YouTube mode activated.";
                        const utter = new window.SpeechSynthesisUtterance(msg);
                        utter.lang = chatState.selectedLanguage === 'ar' ? 'ar-SA' : 'en-US';
                        const voices = window.speechSynthesis.getVoices();
                        if (chatState.selectedLanguage === 'ar') {
                            const arabicVoice = voices.find(
                                (voice) => voice.lang === "ar-SA" && voice.name.includes("Google")
                            );
                            if (arabicVoice) utter.voice = arabicVoice;
                        }
                        window.speechSynthesis.speak(utter);
                    }, 200);
                    return;
                } else if (keyPhrase.includes("stop youtube") || keyPhrase.includes("ايقاف اليوتيوب")) {
                    console.log("YouTube mode deactivated! Returning to chatbot mode.");
                    setIsYoutubeSearchMode(false); // إيقاف وضع YouTube
                    setInput(''); // مسح الإدخال عند العودة إلى وضع البوت
                    setCurrentYoutubeIndex(-1); // No video playing
                    // Voice feedback for YouTube deactivation
                    setTimeout(() => {
                        const msg = chatState.selectedLanguage === 'ar'
                            ? "تم إغلاق اليوتيوب والرجوع للدردشة مع البوت."
                            : "YouTube closed, returned to chat with the bot.";
                        const utter = new window.SpeechSynthesisUtterance(msg);
                        utter.lang = chatState.selectedLanguage === 'ar' ? 'ar-SA' : 'en-US';
                        const voices = window.speechSynthesis.getVoices();
                        if (chatState.selectedLanguage === 'ar') {
                            const arabicVoice = voices.find(
                                (voice) => voice.lang === "ar-SA" && voice.name.includes("Google")
                            );
                            if (arabicVoice) utter.voice = arabicVoice;
                        }
                        window.speechSynthesis.speak(utter);
                    }, 200);
                    return;
                } else if (keyPhrase.includes("ايقاف البوت") || keyPhrase.includes("stop bot")) {
                    window.speechSynthesis.pause();
                    return;
                } else if (
                    keyPhrase.includes("اشتغل") ||
                    keyPhrase.includes("تشغيل البوت") ||
                    keyPhrase.includes("start bot") ||
                    keyPhrase.includes("resume bot")
                ) {
                    window.speechSynthesis.resume();
                    // Force replay last assistant message if not speaking
                    const lastMsg = chatState.messages[chatState.messages.length - 1];
                    if (
                        lastMsg &&
                        lastMsg.role === "assistant" &&
                        typeof lastMsg.content === "string" &&
                        !window.speechSynthesis.speaking
                    ) {
                        const utterance = new SpeechSynthesisUtterance(lastMsg.content);
                        utterance.lang = chatState.selectedLanguage === "ar" ? "ar-SA" : "en-US";
                        const voices = window.speechSynthesis.getVoices();
                        if (chatState.selectedLanguage === "ar") {
                            const arabicVoice = voices.find(
                                (voice) => voice.lang === "ar-SA" && voice.name.includes("Google")
                            );
                            if (arabicVoice) {
                                utterance.voice = arabicVoice;
                            }
                        }
                        window.speechSynthesis.speak(utterance);
                    }
                    return;
                } else if (isYoutubeSearchMode) {
                    // --- YouTube navigation commands ---
                    if (keyPhrase.includes("الفديو السابق") || keyPhrase.includes("previous video")) {
                        if (currentYoutubeIndex > 0) {
                            setCurrentYoutubeIndex(currentYoutubeIndex - 1);
                            // Replace last assistant message with previous video
                            const prevVideo = youtubeHistory[currentYoutubeIndex - 1];
                            if (prevVideo) {
                                const assistantVideoMessage: Message = {
                                    content: prevVideo,
                                    role: 'assistant',
                                    timestamp: new Date(),
                                    type: 'youtube_video'
                                };
                                setChatState(prev => ({
                                    ...prev,
                                    messages: [...prev.messages.slice(0, -1), assistantVideoMessage]
                                }));
                            }
                        }
                        return;
                    }
                    if (keyPhrase.includes("الفديو التالي") || keyPhrase.includes("next video")) {
                        if (currentYoutubeIndex < youtubeHistory.length - 1) {
                            setCurrentYoutubeIndex(currentYoutubeIndex + 1);
                            // Replace last assistant message with next video
                            const nextVideo = youtubeHistory[currentYoutubeIndex + 1];
                            if (nextVideo) {
                                const assistantVideoMessage: Message = {
                                    content: nextVideo,
                                    role: 'assistant',
                                    timestamp: new Date(),
                                    type: 'youtube_video'
                                };
                                setChatState(prev => ({
                                    ...prev,
                                    messages: [...prev.messages.slice(0, -1), assistantVideoMessage]
                                }));
                            }
                        }
                        return;
                    }
                    // ثابت: أمر صوتي لتشغيل الفيديو الحالي في وضع اليوتيوب
                    if (keyPhrase.includes("شغل الفيديو") || keyPhrase.includes("play video")) {
                        // إرسال أمر ثابت لتشغيل الفيديو الحالي (يمكنك ربطه مع مكون الفيديو عبر props/state)
                        window.dispatchEvent(new CustomEvent("youtube-play-video", { detail: { index: currentYoutubeIndex } }));
                        return;
                    }
                    if (keyPhrase.includes("وقف الفيديو") || keyPhrase.includes("ايقاف الفيديو") || keyPhrase.includes("pause video")) {
                        window.dispatchEvent(new CustomEvent("youtube-pause-video", { detail: { index: currentYoutubeIndex } }));
                        return;
                    }
                    console.log("Appending text in YouTube mode:", finalTranscript); // طباعة النص في وضع YouTube
                    setInput(finalTranscript); // تعيين النص المدخل في وضع YouTube
                } else {
                    console.log("Appending text in Chat mode:", finalTranscript); // طباعة النص في وضع البوت
                    setInput(prevInput => prevInput + ' ' + finalTranscript); // إضافة النص إلى الإدخال في وضع البوت
                }
            }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.error("Speech Recognition Error:", event.error);
            const errorMessage = chatState.selectedLanguage === 'en'
                ? "Speech recognition error."
                : "خطأ في التعرف على الصوت.";
            setError(errorMessage);
            setIsRecording(false);
            recognitionRef.current = null;
        };

        recognition.onstart = () => {
            console.log("Speech recognition started");
            setIsRecording(true);
        };

        recognition.onend = () => {
            console.log("Speech recognition ended");
            setIsRecording(false);
            recognitionRef.current = null;

            // إعادة تشغيل التعرف على الصوت تلقائيًا
            setTimeout(() => {
                startRecognition();
            }, 2000);
        };

        try {
            recognition.start();
        } catch (e) {
            console.error("Error starting speech recognition:", e);
            setError(chatState.selectedLanguage === 'en' ? "Error starting recognition." : "خطأ في بدء التعرف.");
            setIsRecording(false);
            recognitionRef.current = null;
        }
    };

    const stopRecognition = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            // onend handler should set isRecording to false and clear ref
        }
    };

    const mindbot_api_url = "https://mindbotai.netlify.app/v1/models/mindbot1-4/request";
    console.log("Connect Successfully to ", mindbot_api_url);
    const SERPER_API_KEY = import.meta.env.VITE_SERPER_API_KEY;
    const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

    // New function for handling YouTube video search triggered from main input
    const handleYoutubeVideoSearch = async (query: string) => {
        setError(null); // Clear previous errors
        setChatState(prev => ({ ...prev, isLoading: true })); // Set loading specific to this action

        if (!SERPER_API_KEY) {
            console.error("Serper API key missing.");
            setError(chatState.selectedLanguage === 'en' ? 'YouTube search config error.' : 'خطأ في إعدادات بحث يوتيوب.');
            setChatState(prev => ({ ...prev, isLoading: false }));
            return;
        }

        try {
            const response = await axios.post(`https://google.serper.dev/videos`, { q: query }, {
                headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' }
            });

            if (response.data && response.data.videos && response.data.videos.length > 0) {
                const firstVideo = response.data.videos[0];
                const videoResult: YoutubeVideoResult = {
                    title: firstVideo.title,
                    link: firstVideo.link,
                    snippet: firstVideo.snippet,
                    thumbnailUrl: firstVideo.imageUrl // Assuming imageUrl for /videos
                };

                // Add new video to history and set as current
                setYoutubeHistory(prev => [...prev, videoResult]);
                setCurrentYoutubeIndex(prev => prev + 1);

                const assistantVideoMessage: Message = {
                    content: videoResult,
                    role: 'assistant',
                    timestamp: new Date(),
                    type: 'youtube_video'
                };

                setChatState(prev => ({
                    ...prev,
                    messages: [...prev.messages, assistantVideoMessage],
                    isLoading: false
                }));
            } else {
                setError(chatState.selectedLanguage === 'en'
                    ? `Couldn't find a YouTube video for "${query}".`
                    : `لم نتمكن من العثور على فيديو يوتيوب لـ "${query}".`);
                setChatState(prev => ({ ...prev, isLoading: false }));
            }
        } catch (err) {
            console.error('Error fetching YouTube video:', err);
            setError(chatState.selectedLanguage === 'en'
                ? 'Error searching YouTube. Please try again.'
                : 'خطأ أثناء البحث في يوتيوب. يرجى المحاولة مرة أخرى.');
            setChatState(prev => ({ ...prev, isLoading: false }));
        }
    };

    const handleSend = async () => {
        const trimmedInput = input.trim();

        // منع الإرسال إذا كان في وضع YouTube
        if (isYoutubeSearchMode) {
            console.log("YouTube mode is active. Handling YouTube search.");
            if (!trimmedInput) {
                setError(chatState.selectedLanguage === 'en' ? 'Please enter a video description.' : 'الرجاء إدخال وصف فيديو.');
                return;
            }
            await handleYoutubeVideoSearch(trimmedInput); // تنفيذ البحث في YouTube
            setInput(''); // مسح الإدخال بعد البحث
            return;
        }

        // Play voice message confirming the message is being sent
        const playConfirmationSound = () => {
            const audio = new Audio('/audio/message-sent.mp3'); // Path to your audio file
            audio.play();
        };

        // Play voice message indicating the message was sent
        const playResponseSound = () => {
            const utterance = new SpeechSynthesisUtterance(
                chatState.selectedLanguage === 'en'
                    ? "The message has been sent. Please wait for a response."
                    : "تم إرسال الرسالة. يرجى الانتظار للحصول على الرد."
            );
            utterance.lang = chatState.selectedLanguage === 'ar' ? 'ar-SA' : 'en-US';
            speechSynthesis.speak(utterance);
        };

        // Delay sending the message by 10 seconds
        setTimeout(async () => {
            const userMessageContent = file ? `Attached file: ${file.name}\n${trimmedInput}` : trimmedInput;
            const newUserMessage: Message = {
                content: userMessageContent || (isYoutubeSearchMode ? "(YouTube Search Query)" : "(Empty Message)"),
                role: 'user',
                timestamp: new Date(),
                type: 'text' // User messages are always text
            };

            setChatState(prev => ({
                ...prev,
                messages: [...prev.messages, newUserMessage], // Add user message
                isLoading: true // Start loading
            }));
            setInput('');
            setFile(null);

            if (!GEMINI_API_KEY) {
                console.error("Gemini API key missing.");
                setError(chatState.selectedLanguage === 'en' ? 'Configuration error.' : 'خطأ في الإعدادات.');
                setChatState(prev => ({ ...prev, isLoading: false }));
                return;
            }

            const history: Content[] = chatState.messages
                .slice(-MAX_HISTORY_MESSAGES)
                .map((msg: Message): Content => ({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: typeof msg.content === 'string' ? msg.content : '[Sent a YouTube Video Result]' }],
                }));

            const systemInstructionContent: Content = {
                role: 'user',
                parts: [{text: `You are Nabd Elsout AI, a helpful chatbot developed by yaseenalawamy, powered by Google Gemini and MindBot Ai.\nYour primary functions are:\n- Analyzing PDF documents provided by the user.\n- Assisting with Quranic studies, interpretation, and related questions.\n- Discussing literature, providing summaries, analysis, and recommendations.\n- General academic research assistance.\n\nIMPORTANT: Do NOT introduce yourself or mention your capabilities unless the user specifically asks \"Who are you?\", \"What can you do?\", or a similar direct question about your identity or functions. Focus directly on answering the user\'s query based on the provided context and conversation history.\n\nAlways respond in the user\'s preferred language (${chatState.selectedLanguage === 'en' ? 'English' : 'Arabic'}).`}]
            };

            const userParts: Part[] = [];
            if (typeof newUserMessage.content === 'string') {
                userParts.push({ text: newUserMessage.content });
            } else {
                console.warn("User message content was not a string:", newUserMessage.content);
                userParts.push({ text: '[User sent non-text content]' });
            }

            if (file) {
                try {
                    const fileBase64 = await readFileAsBase64(file);
                    userParts.unshift({ text: `Analyze the content of the attached document (${file.name}) and answer the user's query based on it, considering the conversation history. Prioritize information from the document.\n\nUser query: ` });
                    userParts.push({
                        inlineData: { data: fileBase64, mimeType: file.type || "application/pdf" }
                    });
                } catch (readError) {
                    console.error("Error reading file:", readError);
                    setError(chatState.selectedLanguage === 'en' ? 'Error processing file.' : 'خطأ في معالجة الملف.');
                    setChatState(prev => ({ ...prev, isLoading: false }));
                    return;
                }
            }

            const finalContents: Content[] = [
                systemInstructionContent,
                ...history,
                { role: 'user', parts: userParts }
            ];

            const generationConfig: GenerationConfig = { maxOutputTokens: 2048 };

            try {
                const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

                const result = await model.generateContent({ contents: finalContents, generationConfig });
                const response = await result.response;
                const text = response.text();

                const assistantMessage: Message = {
                    content: text,
                    role: 'assistant',
                    timestamp: new Date(),
                    type: 'text'
                };

                setChatState(prev => ({
                    ...prev,
                    messages: [...prev.messages, assistantMessage],
                    isLoading: false
                }));
            } catch (error) {
                setError(chatState.selectedLanguage === 'en' ? 'Error processing request.' : 'خطأ في معالجة الطلب.');
                console.error('Gemini Error:', error);
                setChatState(prev => ({ ...prev, isLoading: false }));
            }
        }, 10000); // 10-second delay

        // Play confirmation sound immediately
        playConfirmationSound();
    };

    const readFileAsBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64String = reader.result?.toString().split(',')[1] || '';
                resolve(base64String);
            };
            reader.onerror = (error) => {
                console.error("FileReader Error:", error);
                reject(error);
            };
            reader.readAsDataURL(file);
        });
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (selectedFile && selectedFile.type === 'application/pdf') {
            setFile(selectedFile);
            setError(null);
        } else if (selectedFile) {
            setFile(null);
            setError(chatState.selectedLanguage === 'en' ? "Please select a valid PDF file." : "الرجاء تحديد ملف PDF صالح.");
        }
        // Clear the input field value regardless of success/failure to allow re-selecting the same file
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleAttachmentClick = () => {
        fileInputRef.current?.click();
    };

    const handleNewChat = () => {
        setChatState(prev => ({ ...prev, messages: [], isLoading: false }));
        setInput('');
        setFile(null);
        setIsYoutubeSearchMode(false);
        setError(null);
        localStorage.removeItem(LOCAL_STORAGE_KEY);
    };

    const handleClearChat = () => {
        setChatState(prev => ({ ...prev, messages: [], isLoading: false }));
        setInput('');
        setFile(null);
        setIsYoutubeSearchMode(false);
        setError(null);
        localStorage.removeItem(LOCAL_STORAGE_KEY);
    };

    const toggleRecording = () => {
        if (isRecording) {
            stopRecognition();
        } else {
            startRecognition();
        }
    };

    const toggleYoutubeSearchMode = () => {
        setIsYoutubeSearchMode(prev => !prev);
        setInput('');
    };

    const isSendDisabled = chatState.isLoading || (!file && !input.trim() && !isYoutubeSearchMode);

    return (
        <div className="h-screen bg-gray-950 text-gray-100 font-sans flex flex-col relative">
            <div className="container max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row lg:space-x-6 flex-grow min-h-0">
                <aside className="lg:w-64 flex-shrink-0 mb-6 lg:mb-0 hidden md:block">
                    <Sidebar onNewChat={handleNewChat} onClearChat={handleClearChat} />
                </aside>

                <main className="flex-1 h-full flex flex-col min-h-0">
                    <div className="bg-zinc-900 rounded-xl shadow-md flex flex-col overflow-hidden h-full">

                        <div className="bg-teal-800 p-6 flex items-center justify-between rounded-t-xl shadow-sm">
                            <div className="flex items-center gap-3">
                                <BookOpen className="w-8 h-8 text-white" />
                                <div>
                                    <h1 className="text-white text-2xl font-bold">Nabd Elsout AI</h1>
                                    <p className="text-teal-200 text-sm">Developed by yaseenalawamy | MindBot Ai</p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <LanguageToggle
                                    language={chatState.selectedLanguage}
                                    onToggle={(lang) => setChatState(prev => ({ ...prev, selectedLanguage: lang }))}
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-900 border-l-4 border-red-300 p-4 flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-red-300" />
                                <p className="text-red-300">{error}</p>
                            </div>
                        )}

                        <div className="bg-zinc-800 p-3 border-b border-gray-700 flex gap-4 overflow-x-auto">
                            <button
                                onClick={toggleYoutubeSearchMode}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                                    isYoutubeSearchMode
                                        ? 'bg-red-800 ring-2 ring-red-500'
                                        : 'hover:bg-zinc-700'
                                }`}
                                title={chatState.selectedLanguage === 'en' ? 'Toggle YouTube Search' : 'تبديل البحث في يوتيوب'}
                            >
                                <Youtube className={`w-5 h-5 ${isYoutubeSearchMode ? 'text-white' : 'text-red-500'}`} />
                                <span className={`text-sm ${isYoutubeSearchMode ? 'text-white' : 'text-gray-300'}`}>
                                    {chatState.selectedLanguage === 'en' ? 'YouTube' : 'يوتيوب'}
                                </span>
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors">
                                <Book className="w-5 h-5 text-teal-300" />
                                <span className="text-sm text-gray-300">
                                    {chatState.selectedLanguage === 'en' ? 'Book Analysis' : 'تحليل الكتب'}
                                </span>
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors">
                                <Brain className="w-5 h-5 text-teal-300" />
                                 <span className="text-sm text-gray-300">
                                     {chatState.selectedLanguage === 'en' ? 'Literature' : 'الأدب'}
                                 </span>
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors">
                                <Globe2 className="w-5 h-5 text-teal-300" />
                                 <span className="text-sm text-gray-300">
                                     {chatState.selectedLanguage === 'en' ? 'History' : 'التاريخ'}
                                 </span>
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors">
                                <Clock className="w-5 h-5 text-teal-300" />
                                 <span className="text-sm text-gray-300">
                                     {chatState.selectedLanguage === 'en' ? 'Science' : 'العلوم'}
                                 </span>
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors">
                                <FunctionSquare className="w-5 h-5 text-teal-300" />
                                 <span className="text-sm text-gray-300">
                                     {chatState.selectedLanguage === 'en' ? 'Math' : 'الرياضيات'}
                                                                 </span>
                            </button>
                        </div>

                        <div className="flex-1 p-6 space-y-4 overflow-y-auto chat-messages min-h-0">
                            {chatState.messages.map((message, index) => (
                                <ChatMessage
                                    key={index}
                                    message={message}
                                    language={chatState.selectedLanguage}
                                    isYoutubeSearchMode={isYoutubeSearchMode}
                                    currentYoutubeIndex={currentYoutubeIndex}
                                />
                            ))}
                            {chatState.isLoading && chatState.messages[chatState.messages.length -1]?.role === 'user' && (
                                <div className="flex items-center justify-start py-4 pl-12">
                                    <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="border-t border-gray-700 p-4 bg-zinc-800">
                            <div className="flex gap-3 items-end">
                                {file && !isYoutubeSearchMode ? (
                                    <div className="flex items-center gap-2 bg-zinc-700 p-2 rounded-lg">
                                        <Paperclip className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                        <span className="text-sm truncate" title={file.name}>{file.name}</span>
                                        <button
                                            type="button"
                                            onClick={() => setFile(null)}
                                            className="text-sm text-red-400 hover:text-red-200 ml-2 flex-shrink-0"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <textarea
                                        value={input} // Bind the input field to the `input` state
                                        onChange={(e) => setInput(e.target.value)} // Update the state on user input
                                        placeholder={
                                            isYoutubeSearchMode
                                                ? (chatState.selectedLanguage === 'en' ? 'Enter YouTube video description...' : 'أدخل وصف فيديو يوتيوب للبحث...')
                                                : (chatState.selectedLanguage === 'en' ? 'Ask about books, Quran, or literature...' : 'اسأل عن الكتب والقرآن أو الأدب...')
                                        }
                                        className="flex-1 rounded-xl border border-gray-700 bg-zinc-700 text-gray-200 px-4 py-3 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 shadow-sm"
                                        dir={chatState.selectedLanguage === 'ar' ? 'rtl' : 'ltr'}
                                        rows={1}
                                        style={{ resize: 'none', overflowY: 'hidden' }}
                                        onInput={(e) => {
                                            const target = e.target as HTMLTextAreaElement;
                                            target.style.height = 'auto';
                                            target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                                            target.style.overflowY = target.scrollHeight > 120 ? 'auto' : 'hidden';
                                        }}
                                    />
                                )}

                                {!file && !isYoutubeSearchMode && (
                                    <button
                                        type="button"
                                        onClick={handleAttachmentClick}
                                        className="p-3 rounded-xl hover:bg-zinc-700 transition-colors"
                                        title={chatState.selectedLanguage === 'en' ? 'Attach PDF' : 'إرفاق ملف PDF'}
                                    >
                                        <Paperclip className='w-6 h-6 text-gray-400' />
                                    </button>
                                )}
                                <input
                                    type="file"
                                    accept="application/pdf"
                                    onChange={handleFileChange}
                                    className="hidden"
                                    ref={fileInputRef}
                                />
                                <button
                                    type="button"
                                    onClick={toggleRecording}
                                    className={`p-3 rounded-xl hover:bg-zinc-700 transition-colors ${isYoutubeSearchMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    title={chatState.selectedLanguage === 'en' ? 'Speech Recognition' : 'التعرف على الصوت'}
                                    disabled={isYoutubeSearchMode}
                                >
                                    <Mic className={`w-6 h-6 ${isRecording ? 'text-teal-500 animate-pulse' : 'text-gray-400'} ${isYoutubeSearchMode ? 'text-gray-600' : ''}`} />
                                </button>
                                <button
                                    onClick={handleSend}
                                    disabled={isSendDisabled}
                                    className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-6 py-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 self-end"
                                >
                                    <Send className="w-5 h-5" />
                                    <span>{chatState.selectedLanguage === 'en' ? 'Send' : 'إرسال'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}

export default App;
