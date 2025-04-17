const express = require('express');
const fs = require('fs');

const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/hub.sovware.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/hub.sovware.com/cert.pem'),
    ca: fs.readFileSync('/etc/letsencrypt/live/hub.sovware.com/fullchain.pem'), // optional
};

const { Server } = require('socket.io');

const app = express();
var server = require('https').createServer(options, app);

const io = new Server(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('offer', (offer) => {
        socket.broadcast.emit('offer', offer);
    });

    socket.on('answer', (answer) => {
        socket.broadcast.emit('answer', answer);
    });

    socket.on('ice-candidate', (candidate) => {
        socket.broadcast.emit('ice-candidate', candidate);
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
