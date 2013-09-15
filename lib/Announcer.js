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
    },

    /** @function
     * @description Send or broadcast a message
     * @param rinfo  The remote address to send message to.
     *               If not present, broadcast address is used.
     */
    send: function (msg, rinfo) {
        if (this.socket) {
            var data = Synapse.encodeMessage(msg);
            var address = rinfo ? rinfo.address : this.broadcastAddress;
            return this.socket.send(data, 0, data.length, this.port, address);
        }
        return false;
    },

    /** @function
     * @description Reconfigure binding address
     */
    reconfigure: function (options, callback) {
        this._createSocket();
        this.port = options.port;
        this.address = options.address;
        this.broadcastAddress = options.broadcast;
        if (this.port && this.address && this.broadcastAddress) {
            this.socket.bind(this.port, this.address, function (err) {
                err || this.socket.setBroadcast(true);
                callback && callback(err);
            }.bind(this));
        } else {
            callback && process.nextTick(function () {
                callback(new Error('Invalid Announcer configuration'));
            });
        }
        return this;
    },

    onMessage: function (data, rinfo) {
        this.emit('message', data, rinfo);
    },

    onError: function (err) {
        this.logger.critical('Announcer error: %s', err.message);
        this.emit('error', err);
    },

    _createSocket: function () {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.close();
        }
        (this.socket = dgram.createSocket('udp4', this.onMessage.bind(this)))
            .on('error', this.onError.bind(this));
    }
});

module.exports = Announcer;