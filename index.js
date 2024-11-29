const express = require("express");
const { Server } = require("socket.io");
const http = require("http");
const amqp = require("amqplib");
const admin = require("firebase-admin");

const { AmqpConstants, NotificationConstants } = require("./constants.js");

const serviceAccount = require("./clinicapplication-ec808-firebase-adminsdk-fuvhf-2cdfd6d3ef.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL:
    "https://clinicapplication-ec808-default-rtdb.asia-southeast1.firebasedatabase.app",
});

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Socket.io configuration
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("joinRoom", (data) => {
    socket.join(data.room);
    socket.emit("joinedRoom", data.room);
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Amqp configuration
(async () => {
  const connection = await amqp.connect(
    `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}${process.env.RABBITMQ_VHOST}`,
  );
  const channel = await connection.createChannel();
  await channel.assertQueue(AmqpConstants.QUEUE_NAME);

  console.log("Connected to RabbitMQ. Waiting for messages...");

  channel.consume(AmqpConstants.QUEUE_NAME, (message) => {
    const messageData = JSON.parse(message.content.toString());
    const room = messageData.content.roomName;
    const deviceTokens = messageData.content.deviceTokens;

    if (room) {
      sendNotificationToSocketRoom(room, messageData.content.notification);
    }

    if (deviceTokens.length > 0) {
      deviceTokens.forEach((deviceToken) => {
        const sendMessage = {
          notification: {
            title: messageData.content.notification.title,
            body: messageData.content.notification.content,
          },
          token: deviceToken,
        };

        admin
          .messaging()
          .send(sendMessage)
          .then((response) => {
            console.log("Successfully sent message:", response);
            channel.ack(message);
          })
          .catch((error) => {
            console.log("Error sending message:", error);
          });
      });
    }
  });
})();

server.listen(8081, () => {
  console.log("Server is running on port 8081");
});

function sendNotificationToSocketRoom(roomName, message) {
  io.to(roomName).emit(NotificationConstants.EVENT_NAME, message);
}
