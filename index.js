const express = require("express");
const { Server } = require("socket.io");
const http = require("http");
const amqp = require("amqplib");
const { AmqpConstants, NotificationConstants } = require("./constants.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

    io.to(room).emit(
      NotificationConstants.EVENT_NAME,
      messageData.content.notification,
    );

    channel.ack(message);
  });
})();

server.listen(8081, () => {
  console.log("Server is running on port 8081");
});
