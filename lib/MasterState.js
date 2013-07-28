/** @fileoverview
 * Master state
 */

var Class  = require('js-class'),
    Errors = require('evo-elements').Errors,
    
    Protocol = require('./Protocol'),
    State    = require('./State');

function takeOver(score1, score2) {
    var len = Math.min(score1.length, score2.length);
    for (var i = 0; i < len; i ++) {
        var d = score1[i] - score2[i];
        if (d < 0) {
            break;
        } else if (d > 0) {
            return true;
        }
    }
    return false;
}

var MasterState = Class(State, {
    constructor: function (connector) {
        State.prototype.constructor.call(this, connector, 'MASTER');
    },

    enter: function (transit, interval) {
        this.connector.nodes.masterId = this.connector.id;
        this._announcement = {
            event: 'master-claim',
            data: {
                id: this.connector.id,
                cluster: this.connector.cluster,
                address: this.connector.address,
                port: this.connector.port,
                score: [0, 0, this.connector.id]
            }
        };
        this._startAnnouncement(interval);
    },
    
    leave: function () {
        this._stopAnnouncement();
        this.connector.linkpool.clear();
    },
    
    onAnnounce: function (msgBuf, rinfo) {
        var result = Protocol.parse(msgBuf, Protocol.ANNOUNCE);
        this.connector.logger.debug('ANN %s:%d %j', rinfo.address, rinfo.port, result);
        var msg = result.ok && result.msg;
        if (msg && msg.event == 'master-claim' &&
            msg.data.cluster == this.connector.cluster &&
            msg.data.id != this.connector.id) {
            this._refreshAnnouncement();
            if (takeOver(msg.data.score, this._announcement.data.score)) {
                this.connector.logger.debug('MASTER ANN: CONNECT %j', msg.data);
                this.connector.linkpool.send({ event: 'redir', data: msg.data });
                this.connector.states.transit('connect', msg.data);
            } else {
                this.connector.logger.debug('MASTER ANN: CLAIM %j', msg.data);
                this._announce(rinfo);
            }
        }
    },
    
    onConnection: function (link) {
        var err;
        if (link.usage != 'membership') {
            err = Errors.make('BADUSAGE', { message: '"membership" is required to connect master' });
        } else {
            this.connector.nodes.add(link.id, link.address, link.port);
            this.connector.linkpool.add(link);
            this._refresh(link.id);
            this.connector.logger.verbose('MASTER ACCEPT %s', link);
        }
        return err;
    },
    
    onDisconnect: function (link) {
        this.connector.nodes.del(link.id);
        this.connector.logger.verbose('MASTER DISCONN %s', link.id)
    },
    
    onNodesUpdated: function () {
        this._refresh();
    },
    
    'msg:sync': function (msg, link) {
        if (msg.data.revision != this.connector.nodes.revision) {
            this._refresh(link.id);
        }
    },
    
    _refresh: function (id) {
        var data = this.connector.nodes.toObject();
        // add self
        data.nodes.unshift({
            id: this.connector.id,
            address: this.connector.address,
            port: this.connector.port
        });
        this.connector.linkpool.send({ event: 'refresh', data: data }, id);
    },
    
    _startAnnouncement: function (interval) {
        this._startTime = Date.now();        
        this._announcingTimer = setInterval(this._announce.bind(this), interval);
    },
    
    _stopAnnouncement: function () {
        if (this._announcingTimer) {
            clearInterval(this._announcingTimer);
            delete this._announcingTimer;
        }
        delete this._startTime;
    },
    
    _refreshAnnouncement: function () {
        this._announcement.data.score[0] = this.connector.linkpool.count;
        this._startTime && (this._announcement.data.score[1] = Date.now() - this._startTime);
        this.connector.logger.debug('MASTER SCORE: %j', this._announcement.data.score);
    },
    
    _announce: function (rinfo) {
        this._refreshAnnouncement();
        this.connector.announcer.send(this._announcement, rinfo);
    }
});

module.exports = MasterState;