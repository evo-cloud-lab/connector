/** @fileoverview
 * Link reaches out to other instances of cords on remote nodes
 * and build up a inter-connected network.
 */

var Class   = require('js-class'),
    Schema  = require('evo-elements').Schema,
    Synapse = require('evo-neuron').Synapse;

/** @class Link
 * @description Link wraps over lower-level Synapse
 */
var Link = Class(process.EventEmitter, {
    constructor: function (connector, info, synapse) {
        this.connector = connector;
        this._id      = info.id;
        this._address = info.address;
        this._port    = info.port;
        this._usage   = info.usage;
        this._attach(synapse);
    },

    get id () {
        return this._id;
    },

    get address () {
        return this._address;
    },

    get port () {
        return this._port;
    },

    get usage () {
        return this._usage;
    },

    get target () {
        return { id: this._id, address: this._address, port: this._port };
    },

    send: function (msg) {
        this.connector.logger.debug('SEND[%s]: %j', this.id, msg);
        return this._transport && this._transport.send(msg);
    },

    disconnect: function () {
        var synapse = this._transport;
        delete this._transport;
        synapse && synapse.discard().disconnect();
    },

    toString: function () {
        return this._id + '@' + this._address + ':' + this._port + '/' + this._usage;
    },

    onMessage: function (msg) {
        this.emit('message', msg, this);
    },

    onError: function (err) {
        this.connector.logger.error('LINK ERROR %s: %s', this, err.message);
        // error is not populated upwards, 'close' is expected after 'error'.
    },

    onClose: function () {
        if (this._transport) {
            this._transport.discard();
            if (this._transport.queuedMsgs.length > 0 && this._usage == 'communicate') {
                // reconnect to re-send messages
                var msgs = this._transport.queuedMsg.slice();
                var synapse = Synapse.connect('tcp://' + this._address + ':' + this._port, this.connector.synapseOptions);
                this._attach(synapse);
                for (var i = 0; i < msgs; i ++) {
                    this._transport.send(msgs[i]);
                }
            } else {
                delete this._transport;
                this.emit('close', this);
            }
        }
    },

    _attach: function (synapse) {
        (this._transport = synapse)
            .on('message', this.onMessage.bind(this))
            .on('error', this.onError.bind(this))
            .once('close', this.onClose.bind(this));
        this.connector.timeout[this._usage] &&
            this._transport.setTimeout(this.connector.timeout[this._usage]);
    }
}, {
    statics: {
        connect: function (connector, info) {
            var synapse = Synapse.connect('tcp://' + info.address + ':' + info.port, connector.synapseOptions);
            return new Link(connector, info, synapse);
        }
    }
});

module.exports = Link;