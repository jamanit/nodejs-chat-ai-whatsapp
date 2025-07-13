const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const axios = require("axios");
const qrcode = require("qrcode-terminal");

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  const sock = makeWASocket({
    auth: state,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("\n🔳 Scan the QR Code below:\n");
      qrcode.generate(qr, { small: true });
      console.log("\n➡️ WhatsApp > Tap 3 dots > Linked Devices > Scan QR\n");
    }

    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("❌ Connection closed. Reconnect?", shouldReconnect);

      if (shouldReconnect) {
        setTimeout(() => startSock(), 3000); // Wait 3 seconds before reconnect
      }
    }

    if (connection === "open") {
      console.log("✅ Connected to WhatsApp!");
    }
  });

  // Handle incoming messages
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    const msg = messages[0];

    if (!msg || type !== "notify" || msg.key.fromMe) return;

    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    const from = msg.key.remoteJid;

    if (!text) return;

    console.log(`📩 Message from ${from}: ${text}`);

    const resetKeywords = ["reset", "clear", "hapus"];
    if (resetKeywords.includes(text.toLowerCase())) {
      try {
        await axios.delete("http://127.0.0.1:8000/api/chat-ai/clear-history", {
          data: { from: from },
        });

        await sock.sendMessage(from, {
          text: "✅ Your chat history has been cleared.",
        });
      } catch (err) {
        console.error("❌ Failed to reset history:", err.message);
        await sock.sendMessage(from, {
          text: "❌ Failed to reset your chat history. Please try again later.",
        });
      }

      return;
    }

    try {
      const res = await axios.post("http://127.0.0.1:8000/api/chat-ai/chat", {
        text: text,
        from: from,
      });

      const reply = res.data.reply || "Sorry, I can't respond right now.";
      await sock.sendMessage(from, { text: reply });
    } catch (err) {
      console.error("❌ Error sending to API:", err.message);
      await sock.sendMessage(from, {
        text: "❌ Sorry, a system error occurred. Please try again later.",
      });
    }
  });
}

startSock();
