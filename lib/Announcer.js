/** @fileoverview
 * Broadcast and receive annoucements through UDP
 */

var Class   = require('js-class'),
    dgram   = require('dgram'),
    Synapse = require('evo-neuron').Synapse;

/** @class Announcer
 * @description Announcer opens the endpoint to receive and broadcast messages
 */
var Announcer = Class(process.EventEmitter, {
    /** @constructor
     * @param options  Options for endpoint address:
     *                  - address: address to bind
     *                  - port: port to bind
     *                  - broadcast: broadcast address
     */
    constructor: function (logger, options) {
        this.logger = logger;
        this.port    = options.port;
        this.address = options.address;
        this.broadcastAddress = options.broadcast;
        (this.socket = dgram.createSocket('udp4', this.onMessage.bind(this)))
            .on('error', this.onError.bind(this));
    },
    
    /** @function
     * @description Opens up the endpoint
     */
    start: function () {
        this.socket.bind(this.port, this.address);
        this.socket.setBroadcast(true);
    },
    
    /** @function
     * @description Send or broadcast a message
     * @param rinfo  The remote address to send message to.
     *               If not present, broadcast address is used.
     */
    send: function (msg, rinfo) {
        var data = Synapse.encodeMessage(msg);
        var address = rinfo ? rinfo.address : this.broadcastAddress;
        this.socket.send(data, 0, data.length, this.port, address);
    },

    onMessage: function (data, rinfo) {
        this.emit('message', data, rinfo);
    },
    
    onError: function (err) {
        this.logger.critical('Announcer error: %s', err.message);
        this.emit('error', err);
    }
});

module.exports = Announcer;