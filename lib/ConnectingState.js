/** @fileoverview
 * Connecting state
 */

var Class   = require('js-class'),
    Synapse = require('evo-neuron').Synapse,

    Protocol = require('./Protocol'),
    State    = require('./State');
    
var ConnectingState = Class(State, {
    
    constructor: function () {
        State.prototype.constructor.apply(this, arguments);
    },

    enter: function (info) {
        this._idmsg = {
            event: 'id',
            data: {
                id: this.connector.id,
                cluster: this.connector.cluster,
                address: this.connector.address,
                port: this.connector.port,
                usage: 'membership'
            }
        };
        this._connect(info);
    },
    
    leave: function () {
        delete this._target;
        delete this._synapse;
    },
    
    onConnection: function (info, synapse) {
        var err;
        if (info.usage == 'membership') {
            synapse.send({ event: 'redir', data: this._target });
            synapse.disconnect();
        } else {
            err = State.prototype.onConnection.call(this, info, synapse);
        }
        return err;
    },

    onMessage: function (msg) {
        if (msg.event == 'error') {
            this._synapse.disconnect();
        } else {
            var result = Protocol.parse(msg, Protocol.CONNECT);
            if (result.ok) {
                switch (msg.event) {
                    case 'redir':
                        this._connect(msg.data);
                        break;
                    case 'sync':
                        this._synapse.removeAllListeners();
                        this.connector.nodes.reload(msg.data);
                        this.connector.states.transit('ready', this._target, this._synapse);
                        break;                    
                }
            }
        }
    },
    
    onClose: function () {
        this.connector.states.transit('fail');
    },
    
    _connect: function (info) {
        if (this._synapse) {
            this._synapse.removeAllListeners();
        }
        this._target = info;
        this._synapse = Synapse.connect('tcp://' + info.address + ':' + info.port)
            .once('close', this.onClose.bind(this))
            .on('message', this.onMessage.bind(this))
            .send(this._idmsg);
    }
});

module.exports = ConnectingState;