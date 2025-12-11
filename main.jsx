/*
voice-text-chat-react
Single-file React component (default export) using Tailwind.

Usage:
1) Paste your Supabase Project URL and anon key into the SUPABASE_URL and SUPABASE_KEY constants below.
2) Run in a React environment (Vite / Create React App / Next.js client component). Tailwind classes used but not required.
3) If you don't provide keys, the app falls back to a LocalStorage demo for quick testing between two tabs.

Notes:
- This is a frontend-only prototype. For production you must secure the anon key (use RLS, server functions, etc.).
- Table: `messages` with columns: id (uuid), created_at (timestamp), room_code (text), content (text), message_type (text), session_id (text)
- Replace SUPABASE_* constants with your Project URL and anon public key.
*/

import React, { useEffect, useState, useRef } from "react";
// If you deploy, ensure @supabase/supabase-js is installed and imported dynamically if needed
import { createClient } from "@supabase/supabase-js";

// ====== CONFIG: paste your values here ======
const SUPABASE_URL = ""; // e.g. https://xxxxx.supabase.co
const SUPABASE_KEY = ""; // anon public key
// ============================================

const useSupabase = (url, key) => {
  const [client, setClient] = useState(null);
  useEffect(() => {
    if (url && key) setClient(createClient(url, key));
  }, [url, key]);
  return client;
};

export default function VoiceTextChat() {
  const supabase = useSupabase(SUPABASE_URL, SUPABASE_KEY);
  const [room, setRoom] = useState("");
  const [joined, setJoined] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sessionId] = useState(() => Math.random().toString(36).slice(2, 9));
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [mode, setMode] = useState("text"); // 'text' or 'voice'
  const [listening, setListening] = useState(false);
  const synthRef = useRef(window.speechSynthesis);

  // LocalStorage fallback channel name
  const LS_CHANNEL = "vtc-local-messages";

  useEffect(() => {
    if (!joined) return;
    if (supabase) {
      // subscribe to real-time inserts
      const channel = supabase
        .channel("public:messages")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
          const msg = payload.new;
          if (msg.room_code !== room) return;
          setMessages((m) => [...m, msg]);
          // read aloud if message_type is 'text' and not from this session
          if (msg.message_type === "text" && msg.session_id !== sessionId) {
            speak(msg.content);
          }
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      // LocalStorage poll fallback
      const onStorage = (e) => {
        if (e.key !== LS_CHANNEL) return;
        try {
          const items = JSON.parse(localStorage.getItem(LS_CHANNEL) || "[]");
          const newItems = items.filter((it) => it.room_code === room && !messagesRef.current.find(m => m.id === it.id));
          if (newItems.length) {
            setMessages((m) => [...m, ...newItems]);
            newItems.forEach(it => {
              if (it.session_id !== sessionId && it.message_type === 'text') speak(it.content);
            });
          }
        } catch (err) {
          console.error(err);
        }
      };
      window.addEventListener("storage", onStorage);
      // also poll on interval for same-tab writes
      const timer = setInterval(() => {
        const items = JSON.parse(localStorage.getItem(LS_CHANNEL) || "[]");
        const newItems = items.filter((it) => it.room_code === room && !messagesRef.current.find(m => m.id === it.id));
        if (newItems.length) {
          setMessages((m) => [...m, ...newItems]);
          newItems.forEach(it => {
            if (it.session_id !== sessionId && it.message_type === 'text') speak(it.content);
          });
        }
      }, 600);
      return () => {
        window.removeEventListener("storage", onStorage);
        clearInterval(timer);
      };
    }
  }, [joined, supabase, room, sessionId]);

  const speak = (text) => {
    if (!text) return;
    if (!synthRef.current) return;
    const utter = new SpeechSynthesisUtterance(text);
    // basic voice selection: use default
    synthRef.current.cancel();
    synthRef.current.speak(utter);
  };

  const sendMessage = async (content, message_type = "text") => {
    const payload = {
      id: Math.random().toString(36).slice(2) + Date.now(),
      room_code: room,
      content,
      message_type,
      session_id: sessionId,
      created_at: new Date().toISOString(),
    };

    if (supabase) {
      const { error } = await supabase.from("messages").insert([payload]);
      if (error) console.error(error);
    } else {
      // localstorage fallback
      const items = JSON.parse(localStorage.getItem(LS_CHANNEL) || "[]");
      items.push(payload);
      localStorage.setItem(LS_CHANNEL, JSON.stringify(items));
      // trigger storage event for same-tab listeners
      window.dispatchEvent(new StorageEvent('storage', { key: LS_CHANNEL, newValue: JSON.stringify(items) }));
      setMessages((m) => [...m, payload]);
    }
  };

  // STT using Web Speech API
  const recognitionRef = useRef(null);
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'ja-JP';
    rec.onresult = (e) => {
      const t = e.results[0][0].transcript;
      sendMessage(t, 'text');
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
  }, []);

  const startListening = () => {
    if (!recognitionRef.current) return alert('ブラウザが音声認識に対応していません');
    setListening(true);
    recognitionRef.current.start();
  };

  const joinRoom = () => {
    if (!room) return alert('ルームコードを入力してください');
    setJoined(true);
    setMessages([]);
    // If using Supabase, fetch last 50 messages
    (async () => {
      if (supabase) {
        const { data, error } = await supabase.from('messages').select('*').eq('room_code', room).order('created_at', { ascending: true }).limit(200);
        if (error) console.error(error);
        else setMessages(data || []);
      } else {
        const items = JSON.parse(localStorage.getItem(LS_CHANNEL) || '[]');
        const filtered = items.filter(it => it.room_code === room);
        setMessages(filtered);
      }
    })();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-6">
        <h1 className="text-2xl font-bold mb-4">Voice ↔ Text Chat (Prototype)</h1>

        <div className="mb-3">
          <label className="block text-sm font-medium">Room Code</label>
          <div className="flex gap-2 mt-1">
            <input value={room} onChange={(e) => setRoom(e.target.value)} className="flex-1 border rounded px-3 py-2" placeholder="e.g. room123" />
            <button onClick={() => { if(!room) setRoom('room' + Math.random().toString(36).slice(2,6)); joinRoom(); }} className="px-4 py-2 bg-blue-600 text-white rounded">Create / Join</button>
          </div>
          <p className="text-xs text-gray-500 mt-1">Supabase: {SUPABASE_URL ? 'configured' : 'not configured (Local demo mode)'} • Session: {sessionId}</p>
        </div>

        <div className="mb-3 flex gap-2">
          <button onClick={() => setMode('text')} className={`px-3 py-1 rounded ${mode==='text'?'bg-gray-200':''}`}>Text Mode</button>
          <button onClick={() => setMode('voice')} className={`px-3 py-1 rounded ${mode==='voice'?'bg-gray-200':''}`}>Voice Mode</button>
          <button onClick={() => { navigator.clipboard.writeText(location.href + (location.search || '') + (room ? '#'+room : '')); alert('URL copied'); }} className="ml-auto px-3 py-1 border rounded">Copy Link</button>
        </div>

        <div className="border rounded p-3 h-64 overflow-auto mb-3 bg-gray-50">
          {messages.map((m) => (
            <div key={m.id} className={`mb-2 p-2 rounded ${m.session_id === sessionId ? 'bg-blue-50 ml-auto text-right' : 'bg-white'}`}>
              <div className="text-sm text-gray-600">{m.created_at ? new Date(m.created_at).toLocaleTimeString() : ''}</div>
              <div className="text-base">{m.content}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input className="flex-1 border rounded px-3 py-2" placeholder={mode==='text'?'Type a message...':'Press mic to speak...'} value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter'){ sendMessage(input||'', 'text'); setInput(''); } }} />
          {mode==='text' ? (
            <button onClick={()=>{ sendMessage(input||'', 'text'); setInput(''); }} className="px-4 py-2 bg-green-600 text-white rounded">Send</button>
          ) : (
            <button onClick={()=>{ listening ? recognitionRef.current && recognitionRef.current.stop() : startListening(); }} className="px-4 py-2 bg-red-600 text-white rounded">{listening?'Stop':'Mic'}</button>
          )}
        </div>

        <div className="mt-3 text-sm text-gray-500">
          Tip: Share the page URL and the room code with your friend. If Supabase is not configured, open two tabs and enter the same room code.
        </div>

        <div className="mt-4 text-xs text-gray-400">
          Security: This prototype uses the anon key in-browser. For production, move write permissions to a server or use RLS and server-side auth.
        </div>
      </div>
    </div>
  );
}
