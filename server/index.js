var express = require('express');

var socket = require('socket.io');
var app = express();
var fs = require('fs');
var https = require('https');

// link  your  https  certicate  path 
// var options = {
//     key: fs.readFileSync('/../../etc/ssl/private/apache-selfsigned.key'),
//     cert: fs.readFileSync('/../../etc/ssl/certs/apache-selfsigned.crt')
// };


// var main = https.createServer(options, app);
var main = https.createServer(app);

var server = main.listen(4000, function() {
    console.log('server up and running at %s port', 4000);
});

/*var server = app.listen(443, function () {
});*/
app.use(express.static('public'));
var io = socket(server);
/*************************/
/*** INTERESTING STUFF ***/
/*************************/
var channels = {};
var sockets = {};
/**
 * Users will connect to the signaling server, after which they'll issue a "join"
 * to join a particular channel. The signaling server keeps track of all sockets
 * who are in a channel, and on join will send out 'addPeer' events to each pair
 * of users in a channel. When clients receive the 'addPeer' even they'll begin
 * setting up an RTCPeerConnection with one another. During this process they'll
 * need to relay ICECandidate information to one another, as well as SessionDescription
 * information. After all of that happens, they'll finally be able to complete
 * the peer connection and will be streaming audio/video between eachother.
 */
io.on('connection', function (socket) {
    var channel;
    socket.channels = {};
    sockets[socket.id] = socket;
    console.log("[" + socket.id + "] connection accepted");
    socket.on('disconnect', function () {
        for (var channel in socket.channels) {
            part(channel);
        }
        console.log("[" + socket.id + "] disconnected");
        delete sockets[socket.id];
    });
    socket.on('join-room', function (config) {
        if (config) {
            channel = config.channel;
            var userdata = config.userdata;
            var userID = config.userdata.userID;
            if (channel in socket.channels) {
                console.log("[" + socket.id + "] ERROR: already joined ", channel);
                return;
            }
            if (!(channel in channels)) {
                channels[channel] = {};
            }
            for (id in channels[channel]) {
                channels[channel][id].emit('addPeer-room', {'peer_id': socket.id, 'should_create_offer': false});
                socket.emit('addPeer-room', {'peer_id': id, 'should_create_offer': true});
                console.log("what  is this  id -> ", id);
            }
            console.log(config.userdata.name, ' joining room', config.channel);
            socket.join(config.channel);
            socket.broadcast.in(config.channel).emit('room-users', config);
            channels[channel][socket.id] = socket;
            socket.channels[channel] = channel;
        }
    });
    function part(channel) {
        console.log("[" + socket.id + "] part ");
        if (!(channel in socket.channels)) {
            console.log("[" + socket.id + "] ERROR: not in ", channel);
            return;
        }
        delete socket.channels[channel];
        delete channels[channel][socket.id];
        for (id in channels[channel]) {
            channels[channel][id].emit('removePeer', {'peer_id': socket.id});
            socket.emit('removePeer', {'peer_id': id});
        }
    }

    socket.on('part', part);
    socket.on('relayICECandidate-room', function (config) {
        var peer_id = config.peer_id;
        var ice_candidate = config.ice_candidate;
        console.log("[" + socket.id + "] relaying ICE candidate to [" + peer_id + "] ", ice_candidate);
        if (peer_id in sockets) {
            sockets[peer_id].emit('iceCandidate-room', {'peer_id': socket.id, 'ice_candidate': ice_candidate});
        }
    });
    socket.on('relaySessionDescription-room', function (config) {
        var peer_id = config.peer_id;
        var session_description = config.session_description;
        console.log("[" + socket.id + "] relaying session description to [" + peer_id + "] ", session_description);
        if (peer_id in sockets) {
            sockets[peer_id].emit('sessionDescription-room', {
                'peer_id': socket.id,
                'session_description': session_description
            });
        }
    });
    // this for  file  transfer
    socket.on('file-send-room', function (file) {
        console.log(file);
        socket.to(channel).emit('file-out-room', file);
    });
    socket.on('file-send-room-result', function (file) {
        console.log(file);
        socket.to(channel).emit('file-out-room-result', file);
    });
});
