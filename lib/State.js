/** @fileoverview
 * State base class for Core
 */

var Class   = require('js-class'),
    Errors  = require('evo-elements').Errors, 
    Message = require('evo-neuron').Message;

var State = Class({
    constructor: function (connector) {
        this.connector = connector;
    },
    
    process: function (event) {
        switch (event) {
            case 'announce':
                this.onAnnounce(arguments[1], arguments[2]);
                break;
            case 'connection':
                this._accept(arguments[1], arguments[2]);
                break;
            case 'disconnect':
                this.onDisconnect(arguments[1]);
                break;
            case 'message':
                this.onMessage(arguments[1], arguments[2]);
                break;
        }
    },
    
    onAnnounce: function (msg, rinfo) {
        // Do nothing
    },
    
    
    onConnection: function () {
        // by default, reject all connections
        return Errors.make('NOSVC', { message: 'Service unavailable' });
    },
    
    onDisconnect: function (link) {
        // Do nothing
    },
    
    onMessage: function (msg, id) {
        // Do nothing
    },

    _accept: function (info, synapse) {
        var err = this.onConnection(info, synapse);
        if (err) {
            synapse.send(Message.error(err));
            synapse.disconnect();
        }
    }
});

module.exports = State;