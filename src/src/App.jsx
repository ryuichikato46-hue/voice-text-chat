src/App.jsx
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

export default function App() {
  const [room, setRoom] = useState("");
  const [msg, setMsg] = useState("");
  const [messages, setMessages] = useState([]);

  async function joinRoom() {
    const { data: existing } = await supabase
      .from("messages")
      .select("*")
      .eq("room_code", room);

    setMessages(existing || []);

    supabase
      .channel("room-" + room)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (payload) => {
          if (payload.new.room_code === room) {
            setMessages((prev) => [...prev, payload.new]);
          }
        }
      )
      .subscribe();
  }

  async function send() {
    await supabase.from("messages").insert({
      room_code: room,
      content: msg,
      message_type: "text",
      session_id: crypto.randomUUID()
    });
    setMsg("");
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Voice Chat</h1>
      <input
        placeholder="Room code"
        value={room}
        onChange={(e) => setRoom(e.target.value)}
      />
      <button onClick={joinRoom}>Join</button>

      <div style={{ marginTop: 20 }}>
        <h3>Messages</h3>
        {messages.map((m, i) => (
          <div key={i}>{m.content}</div>
        ))}
      </div>

      <input
        placeholder="Message"
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
      />
      <button onClick={send}>Send</button>
    </div>
  );
}
