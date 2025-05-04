const express = require('express');
const fs = require('fs');

const options = {
    // key: fs.readFileSync('/etc/letsencrypt/live/hub.sovware.com/privkey.pem'),
    // cert: fs.readFileSync('/etc/letsencrypt/live/hub.sovware.com/cert.pem'),
    // ca: fs.readFileSync('/etc/letsencrypt/live/hub.sovware.com/fullchain.pem'), // optional
};

const { Server } = require('socket.io');

const app = express();
var server = require('http').createServer(options, app);

const io = require('socket.io')(server, {
    cors: {
        origin: '*', // allow all origins
        methods: ['GET', 'POST'],
    },
});

app.use(express.static('public'));

const rooms = {}; // roomName => [socketId, ...]

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomName) => {
        socket.join(roomName);
        if (!rooms[roomName]) rooms[roomName] = [];
        rooms[roomName].push(socket.id);

        const others = rooms[roomName].filter((id) => id !== socket.id);
        socket.emit('all-users', others);

        socket.to(roomName).emit('user-joined', socket.id);

        socket.on('send-offer', ({ to, offer, memberId }) => {
            io.to(to).emit('receive-offer', { from: socket.id, offer });
        });

        socket.on('send-answer', ({ to, answer }) => {
            io.to(to).emit('receive-answer', {
                from: socket.id,
                answer,
                memberId,
            });
        });

        socket.on('send-ice', ({ to, candidate }) => {
            io.to(to).emit('receive-ice', { from: socket.id, candidate });
        });

        socket.on('raise-hand', ({ room }) => {
            socket.to(room).emit('user-raised-hand', socket.id);
        });

        socket.on('send-chat', ({ room, message }) => {
            socket
                .to(room)
                .emit('receive-chat', { senderId: socket.id, message });
        });

        socket.on('disconnect', () => {
            rooms[roomName] = rooms[roomName].filter((id) => id !== socket.id);
            socket.to(roomName).emit('user-left', socket.id);
        });
    });
});

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
