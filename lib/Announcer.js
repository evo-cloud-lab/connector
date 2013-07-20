/** @fileoverview
 * Broadcast and receive annoucements through UDP
 */

var Class = require('js-class'),
    dgram = require('dgram');

var Announcer = Class(process.EventEmitter, {
    constructor: function (options) {
        this.socket = dgram.createSocket('udp4', this.onMessage.bind(this));
        this.socket.setBroadcast(true);
        this.port = options.port;
        this.address = options.address;
        this.broadcastAddress = options.broadcastAddress;
    },
    
    start: function (callback) {
        this.socket.bind(this.port, this.address, callback);
    },
    
    onMessage: function (data, rinfo) {
        this.emit('message', data, rinfo);
    },
    
    broadcast: function (data) {
        this.send(data, 0, data.length, this.port, this.broadcastAddress);
    },
    
    unicast: function (data, rinfo) {
        this.send(data, 0, data.length, rinfo.port, rinfo.address);
    }
});

module.exports = Announcer;