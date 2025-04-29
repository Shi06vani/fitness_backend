// server.js
const express = require("express");
const { RtcTokenBuilder, RtcRole } = require("agora-access-token");
const cors = require("cors");
const { Server } = require("socket.io");
const http = require("http");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*', // in production, specify your frontend domain
    methods: ['GET', 'POST'],
    transports: ['websocket', 'polling'],
    credentials: true,
  },
  allowEIO3: true // for older clients
});


const users = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("register", (userId) => {
    users[userId] = socket.id;
    console.log(`Registered user: ${userId}`);
  });

  socket.on(
    "call-user",
    ({ callerId, callerName, receiverId, callType, channelName, token }) => {
      const receiverSocketId = users[receiverId];
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("incoming-call", {
          callerId,
          callerName,
          callType,
          channelName,
          token,
        });
      }
    }
  );

  socket.on("disconnect", () => {
    for (const userId in users) {
      if (users[userId] === socket.id) {
        delete users[userId];
        console.log(`User ${userId} disconnected`);
        break;
      }
    }
  });
});

const APP_ID = process.env.APP_ID;
const APP_CERTIFICATE = process.env.APP_CERTIFICATE;

const nocache = (_, resp, next) => {
  resp.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
  resp.header("Expires", "-1");
  resp.header("Pragma", "no-cache");
  next();
};


app.post("/generate-token", nocache, (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  const { channelName, uid, roleType } = req.body;

  if (!channelName) {
    return res.status(400).json({ error: "channelName are required" });
  }

  let uidInt = parseInt(uid, 10);

  if (isNaN(uidInt)) {
    return res.status(400).json({ error: "uid must be a valid number" });
  }
  if (uid === undefined || uid === null) {
    return res.status(500).json({ error: "uid is required" });
  }

  const role =
    roleType === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

  let expirationTimeInSeconds = req.body.expirationTimeInSeconds;
  console.log(
    parseInt(expirationTimeInSeconds, 10),
    "-expirationTimeInSeconds"
  );

  if (!expirationTimeInSeconds || expirationTimeInSeconds === "") {
    expirationTimeInSeconds = 3600;
  } else {
    expirationTimeInSeconds = parseInt(expirationTimeInSeconds, 10);
  }

  //   const expirationTimeInSeconds = 3600; // 1 hour
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERTIFICATE,
    channelName,
    uidInt,
    role,
    privilegeExpiredTs
  );

  res.json({
    channelName,
    token: token,
    roleType,
    expirationTimeInSeconds,
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
