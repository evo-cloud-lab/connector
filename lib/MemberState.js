/** @fileoverview
 * Member state
 */

var Class = require('js-class'),

    Link  = require('./Link'),
    State = require('./State');
    
var MemberState = Class(State, {
    
    constructor: function () {
        State.prototype.constructor.apply(this, arguments);
    },

    enter: function (info, synapse) {
        this._target = info;
        this._link = new Link(info, synapse)
            .once('close', this.onClose.bind(this));
        this.connector.linkpool.add(this._link);
    },
    
    leave: function () {
        delete this._target;
        delete this._link;
    },
    
    onConnection: function (info, synapse) {
        var err;
        if (info.usage == 'membership') {
            synapse.send({ event: 'redir', data: this._target });
            synapse.disconnect();
        } else if (info.usage == 'communicate') {
            if (info.id == this.connector.nodes.masterId) {
                err = Errors.make('BADID', { message: 'Unable to accept connection from master' });
            } else if (!this.connector.nodes.node(info.id)) {
                err = Errors.make('BADID', { message: 'Invalid node ID' });
            } else if (this.connector.linkpool.link(info.id)) {
                err = Errors.make('EXIST', { message: 'Already connected' });
            } else {
                var link = new Link(info, synapse, { timeout: this.connector.timeout[info.usage] });
                this.connector.linkpool.add(link);
            }
        }
        return err;
    },

    onClose: function () {
        this.connector.states.transit('disconnected', this._target);
    }
});

module.exports = MemberState;