const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let waitingUsers = [];

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

io.on("connection", (socket) => {
    console.log(`New user connected to the server: ${socket.id}`);
    socket.messageQueue = []; // Hold messages while waiting for a partner

    // Find a random chat partner
    socket.on("findPartner", () => {
        if (waitingUsers.length > 0) {
            const partner = waitingUsers.shift();

            socket.partner = partner.id;
            partner.partner = socket.id;

            const room = `room-${partner.id}-${socket.id}`;
            socket.join(room);
            partner.join(room);

            // Notify both users
            io.to(room).emit("chatMessage", {
                message: "✅ Now you are connected, Say hello to your random chat partner!",
                sender: "system",
            });

            // Send queued messages when partner connects
            if (socket.messageQueue.length > 0) {
                socket.messageQueue.forEach((msg) => {
                    io.to(room).emit("chatMessage", msg);
                });
                socket.messageQueue = []; // Clear queue after sending
            }
        } else {
            waitingUsers.push(socket);
            // Send waiting message
            socket.emit("chatMessage", {
                message: "⏳ Waiting for a random chat partner...",
                sender: "system",
            });
        }
    });

    // Handle chat messages
    socket.on("chatMessage", (message) => {
        const privateRoom = Array.from(socket.rooms).find((room) =>
            room.startsWith("room-")
        );

        if (privateRoom) {
            io.to(privateRoom).emit("chatMessage", {
                message: message.message,
                sender: message.sender,
            });
        } else {
            // Store messages in queue if no partner connected
            socket.messageQueue.push(message);
        }
    });

    // Handle disconnection
    socket.on("disconnect", () => {
        console.log(`User disconnected: ${socket.id}`);
        waitingUsers = waitingUsers.filter((u) => u.id !== socket.id);

        if (socket.partner) {
            io.to(socket.partner).emit("chatMessage", {
                message: "⚠️ Your partner disconnected. Finding a new partner...",
                sender: "system",
            });

            const partnerSocket = io.sockets.sockets.get(socket.partner);
            if (partnerSocket) {
                partnerSocket.partner = null;
                waitingUsers.push(partnerSocket);
                partnerSocket.emit("chatMessage", {
                    message: "⏳ Waiting for a new random partner...",
                    sender: "system",
                });
            }
        }
    });

    // Video Call Logic
    socket.on("startCall", () => {
        socket.broadcast.emit("startCall");
    });

    socket.on("offer", (offer) => {
        socket.broadcast.emit("offer", offer);
    });

    socket.on("answer", (answer) => {
        socket.broadcast.emit("answer", answer);
    });

    socket.on("iceCandidate", (candidate) => {
        socket.broadcast.emit("iceCandidate", candidate);
    });

    socket.on("endCall", () => {
        socket.broadcast.emit("endCall");
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
