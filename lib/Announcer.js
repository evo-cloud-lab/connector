/** @fileoverview
 * Broadcast and receive annoucements through UDP
 */

var Class   = require('js-class'),
    async   = require('async'),
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
        if (this.unicastSocket) {
            var data = Synapse.encodeMessage(msg);
            var address = rinfo ? rinfo.address : this.broadcastAddress;
            return this.unicastSocket.send(data, 0, data.length, this.port, address);
        }
        return false;
    },

    /** @function
     * @description Reconfigure binding address
     */
    reconfigure: function (options, callback) {
        if (options.port && options.address && options.broadcast) {
            this._createSocket();

            this.port = options.port;
            this.address = options.address;
            this.broadcastAddress = options.broadcast;

            async.each([
                { socket: this.unicastSocket, address: this.address },
                { socket: this.broadcastSocket, address: this.broadcastAddress }
            ], function (item, next) {
                item.socket.bind(this.port, item.address, next);
            }.bind(this), function (err) {
                if (!err) {
                    this.unicastSocket.setBroadcast(true);
                    this.broadcastSocket.setBroadcast(true);
                }
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
        if (rinfo.address != this.address) {
            this.emit('message', data, rinfo);
        }
    },

    onError: function (err) {
        this.logger.critical('Announcer error: %s', err.message);
        this.emit('error', err);
    },

    _createSocket: function () {
        ['unicastSocket', 'broadcastSocket'].forEach(function (name) {
            var socket = this[name];
            if (socket) {
                socket.removeAllListeners();
                socket.close();
            }
            (this[name] = dgram.createSocket('udp4', this.onMessage.bind(this)))
                .on('error', this.onError.bind(this));
        }, this);
    }
});

module.exports = Announcer;