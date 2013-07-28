/** @fileoverview
 * Member state
 */

var Class = require('js-class'),

    State = require('./State');
    
var MemberState = Class(State, {
    constructor: function (connector) {
        State.prototype.constructor.call(this, connector, 'MEMBER');
    },
    
    enter: function (transit, link) {
        this.connector.logger.verbose('MEMBER CONNECTED %s', link);
        this._target = link.target;
        (this._link = link)
            .once('close', this.onClose.bind(this));
        this.connector.linkpool.add(this._link);
        this._startHeartbeat();
    },
    
    leave: function () {
        this._stopHeartbeat();
        this._link.removeAllListeners();
        delete this._target;
        delete this._link;
    },
    
    onConnection: function (link) {
        var err;
        if (link.usage == 'membership') {
            this.connector.logger.verbose('MEMBER REDIR %s to %j', link, this._target)
            link.send({ event: 'redir', data: this._target });
            link.disconnect();
        } else if (link.usage == 'communicate') {
            if (link.id == this.connector.nodes.masterId) {
                err = Errors.make('BADID', { message: 'Unable to accept connection from master' });
            } else if (!this.connector.nodes.node(link.id)) {
                err = Errors.make('BADID', { message: 'Invalid node ID' });
            } else if (this.connector.linkpool.link(link.id)) {
                err = Errors.make('EXIST', { message: 'Already connected' });
            } else {
                this.connector.linkpool.add(link);
                this.connector.logger.verbose('MEMBER ACCEPT %s', link);
            }
            
            err && this.connector.logger.verbose('MEMBER ACCEPT ERROR %s: %s, %s', link, err.code, err.message);
        }
        return err;
    },

    'msg:redir': function (msg) {
        this.connector.logger.verbose('MEMBER REDIRECTED %j', msg.data);
        this._transit('redirected', msg.data);
    },
    
    'msg:refresh': function (msg) {
        this.connector.nodes.reload(msg.data);
    },
    
    onTimer: function () {
        this._link.send({ event: 'sync', data: { id: this.connector.id, revision: this.connector.nodes.revision } });
    },
    
    onClose: function () {
        this.connector.logger.verbose('MEMBER DISCONNECTED');
        this._transit('disconnected', this._target);
    },
    
    _startHeartbeat: function () {
        this._timer = setInterval(this.onTimer.bind(this), Math.floor(this.connector.timeout.membership / 3));
    },
    
    _stopHeartbeat: function () {
        if (this._timer) {
            clearInterval(this._timer);
            delete this._timer;
        }
    },
    
    _transit: function (key, target) {
        this._stopHeartbeat();
        this.connector.states.transit(key, target);
    }
});

module.exports = MemberState;