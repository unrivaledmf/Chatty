import express from "express";
import path from "path";
import { createServer } from "http";
import { Server } from "socket.io";
import { db } from "./server/storage";
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

const PORT = 3000;

// API Routes

app.post("/api/register", (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }
  const id = uuidv4();
  const user = db.createUser(id, username);
  if (!user) {
    return res.status(400).json({ error: "Username already taken" });
  }
  res.json(user);
});

app.post("/api/login", (req, res) => {
  const { username } = req.body;
  const user = db.getUserByUsername(username);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(user);
});

app.get("/api/users/search", (req, res) => {
  const query = req.query.q as string;
  const excludeId = req.query.excludeId as string;
  if (!query) return res.json([]);
  const users = db.getSearchUsers(query, excludeId);
  res.json(users);
});

app.get("/api/users/:id", (req, res) => {
  const user = db.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

app.post("/api/chats", (req, res) => {
  const { userId, targetUserId } = req.body;
  if (!userId || !targetUserId) {
    return res.status(400).json({ error: "Invalid payload" });
  }
  
  let chat = db.getChatByParticipants([userId, targetUserId]);
  if (!chat) {
    chat = db.createChat(uuidv4(), [userId, targetUserId]);
  }
  res.json(chat);
});

app.get("/api/chats/:userId", (req, res) => {
  const chats = db.getUserChats(req.params.userId);
  res.json(chats);
});

app.get("/api/chats/:chatId/messages", (req, res) => {
  const messages = db.getChatMessages(req.params.chatId);
  res.json(messages);
});

// Contacts & Requests

app.post("/api/contacts/requests", (req, res) => {
  const { senderId, receiverId } = req.body;
  if (!senderId || !receiverId) return res.status(400).json({ error: "Invalid payload" });
  
  // Check if existing
  let existing = db.getContactRequestBetween(senderId, receiverId);
  if (existing) {
    if (existing.status === 'rejected') {
      // Create new or update
      existing.status = 'pending';
      existing.senderId = senderId;
      existing.receiverId = receiverId;
      existing.timestamp = Date.now();
      db.save();
    }
  } else {
    existing = db.createContactRequest(uuidv4(), senderId, receiverId);
  }
  
  // Notify receiver
  io.to(`user:${receiverId}`).emit("contactRequest", existing);
  res.json(existing);
});

app.get("/api/contacts/requests/pending/:userId", (req, res) => {
  const incoming = db.getPendingRequestsForUser(req.params.userId);
  // Also get outgoing just in case
  const outgoing = Array.from(db.contactRequests.values())
    .filter(r => r.senderId === req.params.userId && r.status === 'pending');
  res.json({ incoming, outgoing });
});

app.post("/api/contacts/requests/:requestId/accept", (req, res) => {
  const request = db.acceptContactRequest(req.params.requestId);
  if (request) {
      io.to(`user:${request.senderId}`).emit("contactAccepted", request);
      io.to(`user:${request.receiverId}`).emit("contactAccepted", request);
  }
  res.json(request || {});
});

app.post("/api/contacts/requests/:requestId/reject", (req, res) => {
  const request = db.rejectContactRequest(req.params.requestId);
  if (request) {
      io.to(`user:${request.senderId}`).emit("contactRejected", request);
  }
  res.json(request || {});
});

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  // Authenticate socket user
  socket.on("auth", (userId) => {
    socket.join(`user:${userId}`); // Personal room for notifications
  });

  socket.on("joinChat", (chatId) => {
    socket.join(`chat:${chatId}`);
  });

  socket.on("leaveChat", (chatId) => {
    socket.leave(`chat:${chatId}`);
  });

  socket.on("sendMessage", (payload) => {
    const { chatId, senderId, text } = payload;
    const msg = {
      id: uuidv4(),
      chatId,
      senderId,
      text,
      timestamp: Date.now(),
    };
    db.addMessage(msg);
    
    // Broadcast to chat room
    io.to(`chat:${chatId}`).emit("newMessage", msg);

    // Also notify users in their personal rooms so they can update their chat list preview
    const chat = db.getChat(chatId);
    if (chat) {
        chat.participants.forEach(pId => {
            io.to(`user:${pId}`).emit("chatUpdated", chat);
        });
    }
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected", socket.id);
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
