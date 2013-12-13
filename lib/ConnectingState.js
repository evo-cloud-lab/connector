/** @fileoverview
 * Connecting state
 */

var Class   = require('js-class'),
    _       = require('underscore'),
    Synapse = require('evo-neuron').Synapse,

    Link     = require('./Link'),
    State    = require('./State');

var ConnectingState = Class(State, {
    constructor: function (connector) {
        State.prototype.constructor.call(this, connector, 'CONNECT');
    },

    enter: function (transit, info) {
        this.connector.logger.verbose('CONNECT %j', info);
        this.connector.nodes.masterId = info.id;
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
        if (this._link) {
            this._link.removeAllListeners();
            delete this._link;
        }
    },

    onConnection: function (link) {
        var err;
        if (link.usage == 'membership') {
            this.connector.logger.verbose('CONNECT REDIR %s to %j', link, this._target)
            link.send({ event: 'redir', data: this._target });
            link.disconnect();
        } else {
            err = State.prototype.onConnection.call(this, info, link);
        }
        return err;
    },

    onClose: function () {
        this.connector.logger.verbose('CONNECT FAIL');
        this.connector.states.transit('fail');
    },

    'msg:error': function (msg) {
        this.connector.logger.verbose('CONNECT ERROR %j', msg.data);
        this._link.disconnect();    // it will emit 'close' later
    },

    'msg:redir': function (msg) {
        this.connector.logger.verbose('CONNECT REDIRECTED %j', msg.data)
        this._connect(msg.data);
    },

    'msg:refresh': function (msg) {
        this.connector.logger.verbose('CONNECT REFRESH %j', msg.data);
        this.connector.nodes.reload(msg.data);
        this._link.removeAllListeners();
        this.connector.states.transit('ready', this._link);
    },

    'msg:sync': function (msg, link) {
        link.send({ event: 'redir', data: this._target });
    },

    _connect: function (info) {
        if (this._link) {
            this._link.removeAllListeners();
            this._link.disconnect();
        }
        this._target = info;
        info = _.extend(_.pick(info, 'id', 'address', 'port'), { usage: 'membership' });
        (this._link = Link.connect(this.connector, info))
            .once('close', this.onClose.bind(this))
            .on('message', this.onMessage.bind(this))
            .send(this._idmsg);
    }
});

module.exports = ConnectingState;