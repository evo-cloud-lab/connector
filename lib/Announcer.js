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
        this._loadOptions(options);
    },

    /** @function
     * @description Send or broadcast a message
     * @param rinfo  The remote address to send message to.
     *               If not present, broadcast address is used.
     */
    send: function (msg, rinfo) {
        if (this.unicastSocket) {
            var data = Synapse.encodeMessage(msg);
            var dest = rinfo || this.cast;
            return this.unicastSocket.send(data, 0, data.length, dest.port, dest.address);
        }
        return false;
    },

    /** @function
     * @description Reconfigure binding address
     */
    reconfigure: function (options, callback) {
        if (options.port && options.address && options.broadcast) {
            this._loadOptions(options);
            this._createSocket();
            async.series([
                function (next) {
                    this.unicastSocket.bind(this.port, this.address, next);
                }.bind(this),
                function (next) {
                    this.unicastSocket.setBroadcast(true);
                    this.broadcastSocket.bind(this.cast.port, next);
                }.bind(this),
                function (next) {
                    this.broadcastSocket.setBroadcast(true);
                    if (this.multicast) {
                        this.broadcastSocket.addMembership(this.cast.address);
                    }
                    next();
                }.bind(this)
            ], function (err) {
                callback && callback(err);
            });
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

    _loadOptions: function (opts) {
        this.port = opts.port;
        this.address = opts.address;
        var pos = opts.broadcast.indexOf(':');
        if (pos > 0) {
            this.cast = {
                address: opts.broadcast.substr(0, pos),
                port: parseInt(opts.broadcast.substr(pos + 1))
            };
        } else {
            this.cast = {
                address: opts.broadcast,
                port: this.port
            };
        }
        // multicast is used as default, unless '*' is prefixed
        // on a broadcast address
        if (this.cast.address[0] == '*') {
            this.multicast = false;
            this.cast.address = this.cast.address.substr(1);
        } else {
            this.multicast = true;
        }
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