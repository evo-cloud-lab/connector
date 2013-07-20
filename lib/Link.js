/** @fileoverview
 * Link reaches out to other instances of cords on remote nodes
 * and build up a inter-connected network.
 */

var Class   = require('js-class'),
    Schema  = require('evo-elements').Schema,
    Synapse = require('evo-neuron').Synapse;

var Link = Class(process.EventEmitter, {
    constructor: function (info, synapse, opts) {
        this._id        = info.id;
        this._address   = info.address;
        this._port      = info.port;
        this._usage     = info.usage;
        (this._transport = synapse)
            .on('message', this.onMessage.bind(this))
            .on('close', this.onClose.bind(this));
        opts.timeout && this._transport.setTimeout(opts.timeout);
    },
    
    get id () {
        return this._id;
    },
    
    send: function (msg) {
        return this._transport.send(msg);
    },
    
    onMessage: function (msg) {
        this.emit('message', msg, this);
    },
    
    onClose: function (synapse) {
        synapse.removeAllListeners();
        if (synapse.queuedMsgs.length > 0 && this._usage == 'communicate') {
            // reconnect to re-send messages
            var msgs = synapse.queuedMsg.slice();
            this._transport = Synapse.connect('tcp://' + this._address + ':' + this._port);
            for (var i = 0; i < msgs; i ++) {
                this._transport.send(msgs[i]);
            }
        } else {
            delete this._transport;
            this.emit('close', this);
        }
    }
});

module.exports = Link;