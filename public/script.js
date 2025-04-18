const socket = io();
const room = 'my-room';
const peers = {}; // socketId => RTCPeerConnection
const localVideo = document.createElement('video');
localVideo.muted = true;
localVideo.autoplay = true;
localVideo.playsInline = true;

document.getElementById('videos').appendChild(localVideo);

let localStream;

navigator.mediaDevices
    .getUserMedia({ video: true, audio: true })
    .then((stream) => {
        localVideo.srcObject = stream;
        localStream = stream;
        socket.emit('join-room', room);
    });

socket.on('all-users', (users) => {
    users.forEach((userId) => createOffer(userId));
});

socket.on('user-joined', (userId) => {
    console.log(`${userId} joined`);
    createOffer(userId);
});

socket.on('receive-offer', async ({ from, offer }) => {
    const pc = createPeerConnection(from);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('send-answer', { to: from, answer });
});

socket.on('receive-answer', async ({ from, answer }) => {
    await peers[from].setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('receive-ice', async ({ from, candidate }) => {
    if (peers[from]) {
        await peers[from].addIceCandidate(new RTCIceCandidate(candidate));
    }
});

socket.on('user-left', (userId) => {
    if (peers[userId]) {
        peers[userId].close();
        delete peers[userId];
        const video = document.getElementById(userId);
        if (video) video.remove();
    }
});

function createOffer(userId) {
    const pc = createPeerConnection(userId);
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    pc.createOffer().then((offer) => {
        pc.setLocalDescription(offer);
        socket.emit('send-offer', { to: userId, offer });
    });
}

function createPeerConnection(userId) {
    const pc = new RTCPeerConnection();
    peers[userId] = pc;

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('send-ice', { to: userId, candidate: event.candidate });
        }
    };

    pc.ontrack = (event) => {
        let remoteVideo = document.getElementById(userId);
        if (!remoteVideo) {
            remoteVideo = document.createElement('video');
            remoteVideo.id = userId;
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            document.getElementById('videos').appendChild(remoteVideo);
        }
        remoteVideo.srcObject = event.streams[0];
    };

    return pc;
}
