// ✅ Group Video Call with WebRTC + Socket.IO + UI (Enhanced)
const socket = io();
const room = getRoomId();
const peers = {}; // socketId => RTCPeerConnection
const pendingCandidates = {}; // socketId => [candidates]
let localStream;
let screenStream = null;
const users = new Set();

// ==== UI Setup ====
document.body.innerHTML = `
  <div class="max-w-6xl mx-auto p-4">
    <div class="flex flex-wrap justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-gray-800">
        Room ID: <span id="roomId" class="text-white bg-blue-600 px-2 py-1 rounded font-mono">${room}</span>
      </h1>
      <div class="space-x-2 mt-2 sm:mt-0">
        <button id="toggleMute" class="bg-blue-600 hover:bg-blue-700 transition text-white px-4 py-2 rounded-lg shadow">Mute</button>
        <button id="shareScreen" class="bg-green-600 hover:bg-green-700 transition text-white px-4 py-2 rounded-lg shadow">Share Screen</button>
      </div>
    </div>

    <div id="videos" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6 rounded-lg overflow-hidden"></div>

    <div class="bg-white p-4 rounded-lg shadow-md border border-gray-200">
      <h2 class="text-xl font-semibold text-gray-800 mb-2">Users in Call</h2>
      <ul id="userList" class="list-disc pl-6 text-gray-700 text-sm break-all"></ul>
    </div>
  </div>
`;

const localVideo = document.createElement('video');
localVideo.muted = true;
localVideo.autoplay = true;
localVideo.playsInline = true;
localVideo.className = 'rounded-lg shadow-md border border-gray-300';

document.getElementById('videos').appendChild(localVideo);

// ==== Media Setup ====
navigator.mediaDevices
    .getUserMedia({ video: true, audio: true })
    .then((stream) => {
        localStream = stream;
        localVideo.srcObject = stream;
        socket.emit('join-room', room);
    });

// ==== Event Handlers ====
document.getElementById('toggleMute').onclick = () => {
    localStream.getAudioTracks()[0].enabled =
        !localStream.getAudioTracks()[0].enabled;
    document.getElementById('toggleMute').innerText =
        localStream.getAudioTracks()[0].enabled ? 'Mute' : 'Unmute';
};

document.getElementById('shareScreen').onclick = async () => {
    if (screenStream) return;
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
        });
        Object.values(peers).forEach((pc) => {
            const sender = pc
                .getSenders()
                .find((s) => s.track.kind === 'video');
            if (sender) sender.replaceTrack(screenStream.getVideoTracks()[0]);
        });
        screenStream.getVideoTracks()[0].onended = () => {
            Object.values(peers).forEach((pc) => {
                const sender = pc
                    .getSenders()
                    .find((s) => s.track.kind === 'video');
                if (sender)
                    sender.replaceTrack(localStream.getVideoTracks()[0]);
            });
            screenStream = null;
        };
    } catch (e) {
        console.error('Screen share failed', e);
    }
};

// ==== Socket Events ====
socket.on('all-users', (userIds) => {
    userIds.forEach((userId) => {
        users.add(userId);
        updateUserList();
        if (socket.id > userId) createOffer(userId);
    });
});

socket.on('user-joined', (userId) => {
    users.add(userId);
    updateUserList();
    if (userId !== socket.id && socket.id > userId) {
        createOffer(userId);
    }
});

socket.on('receive-offer', async ({ from, offer }) => {
    const pc = createPeerConnection(from);

    if (pc.signalingState !== 'stable') return;

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('send-answer', { to: from, answer });

    if (pendingCandidates[from]) {
        for (const candidate of pendingCandidates[from]) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        delete pendingCandidates[from];
    }
});

socket.on('receive-answer', async ({ from, answer }) => {
    const pc = peers[from];
    if (!pc) return;
    if (!pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on('receive-ice', async ({ from, candidate }) => {
    const pc = peers[from];
    if (!pc) return;

    if (pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
        if (!pendingCandidates[from]) pendingCandidates[from] = [];
        pendingCandidates[from].push(candidate);
    }
});

socket.on('user-left', (userId) => {
    users.delete(userId);
    updateUserList();
    if (peers[userId]) {
        peers[userId].close();
        delete peers[userId];
    }
    const video = document.getElementById(userId);
    if (video) video.remove();
});

// ==== WebRTC Setup ====
function createOffer(userId) {
    const pc = createPeerConnection(userId);
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    pc.createOffer().then((offer) => {
        pc.setLocalDescription(offer);
        socket.emit('send-offer', { to: userId, offer });
    });
}

function createPeerConnection(userId) {
    if (peers[userId]) return peers[userId];

    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
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
            remoteVideo.className =
                'rounded-lg shadow-md border border-gray-300';

            document.getElementById('videos').appendChild(remoteVideo);
        }
        remoteVideo.srcObject = event.streams[0];
    };

    return pc;
}

// ==== Utils ====
function updateUserList() {
    const ul = document.getElementById('userList');
    ul.innerHTML = '';
    users.forEach((uid) => {
        const li = document.createElement('li');
        li.innerText = uid === socket.id ? `${uid} (You)` : uid;
        ul.appendChild(li);
    });
}

function getRoomId() {
    const params = new URLSearchParams(location.search);
    if (params.has('room')) return params.get('room');
    const newRoom = Math.random().toString(36).substring(2, 8);
    location.href = `${location.pathname}?room=${newRoom}`;
}
