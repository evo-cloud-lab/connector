/** @fileoverview
 * State base class
 */

var Class   = require('js-class'),
    Errors  = require('evo-elements').Errors,
    Message = require('evo-neuron').Message,

    Protocol = require('./Protocol');

/** @class State
 * @description Base class for all connector states
 *
 * This class dispatches announcement and connectivity events,
 * handles message parsing and dispatching.
 */
var State = Class({
    /** @constructor
     * @param {String} protocol   Name of protocol set, messages are parsed
     *                              according to the schemas in this set.
     */
    constructor: function (connector, protocol) {
        this.connector = connector;
        this.protocol = Protocol[protocol];
    },

    process: function (transit, event) {
        var args = [].slice.call(arguments, 2);
        switch (event) {
            case 'announce':
                this.onAnnounce && this.onAnnounce.apply(this, args);
                break;
            case 'connection':
                this._accept(arguments[2]);
                break;
            case 'disconnect':
                this.onDisconnect && this.onDisconnect.apply(this, args);
                break;
            case 'message':
                this.onMessage.apply(this, args);
                break;
            case 'nodes':
                this.onNodesUpdated && this.onNodesUpdated.apply(this, args);
        }
    },

    onMessage: function (msg, link) {
        this.connector.logger.debug('MSG[%s] on %s: %j', link.id, this.connector.state, msg);
        // message handlers are named as 'msg:event'.
        var fn = this['msg:' + msg.event];
        if (typeof(fn) == 'function') {
            if (msg.event == 'error') {
                // error message is handled specially, no validation is performed.
                fn.call(this, msg, link);
            } else {
                var result = Protocol.parse(msg, this.protocol);
                if (!result.ok) {
                    link.send(Message.error(result.error));
                } else {
                    fn.call(this, result.msg, link, result.origin);
                }
            }
        } else {
            this.connector._message(msg, link);
        }
    },

    _accept: function (link) {
        var err = this.onConnection ? this.onConnection(link)
                                    : Errors.make('NOSVC', { message: 'Service unavailable' });
        if (err) {
            link.send(Message.error(err));
            link.disconnect();
        }
    }
});

module.exports = State;