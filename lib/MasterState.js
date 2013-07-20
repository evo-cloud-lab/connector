/** @fileoverview
 * Master state
 */

var Class  = require('js-class'),
    Errors = require('evo-elements').Errors,
    
    State = require('./State'),
    Link  = require('./Link');
    
var ANNOUNCE_INTERVALS = [100, 200, 500, 1000, 1000, 1000, 1000, 1000, 15000, 30000, 60000];

function idLess(id1, id2) {
    return id1 < id2;
}

var MasterState = Class(State, {
    
    constructor: function () {
        State.prototype.constructor.apply(this, arguments);
    },
    
    enter: function () {
        this._announceInterval = 0;
        this.connector.nodes.masterId = this.connector.id;
        this._masterAnnounce();
    },
    
    leave: function () {
        if (this._announcingTimer) {
            clearTimeout(this._announcingTimer);
            delete this._announcingTimer;
        }
    },
    
    onAnnounce: function (msg, rinfo) {
        if (msg.event == 'master-claim' && msg.data.id &&
            msg.data.cluster == this.connector.cluster) {
            if (idLess(msg.data.id, this.connector.id)) {
                this.connector.states.transit('connect', msg.data);
            } else {
                this._announce(rinfo);
            }
        }
    },
    
    onConnection: function (info, synapse) {
        var err;
        if (info.usage != 'membership') {
            err = Errors.make('BADUSAGE', { message: '"membership" is required to connect master' });
        } else {
            var link = new Link(info, synapse, { timeout: this.connector.timeout[info.usage] });
            this.connector.nodes.add(info.id, info);
            this.connector.linkpool.add(link);
            link.send(this.connector.nodes.syncMsg());
        }
        return err;
    },
    
    onDisconnect: function (link) {
        this.connector.nodes.del(link.id);
    },
    
    _masterAnnounce: function () {
        delete this._announcingTimer;
        this._announce();
        this._announcingTimer = setTimeout(this._masterAnnounce.bind(this),
                                           ANNOUNCE_INTERVALS[this._announceInterval]);
        if (this._announceInterval < ANNOUNCE_INTERVALS.length - 1) {
            this._accounceInterval ++;
        }
    },
    
    _annouce: function (rinfo) {
        this.connector.announce({
            event: 'master-claim',
            data: {
                id: this.connector.id,
                cluster: this.connector.cluster,
                address: this.connector.address,
                port: this.connector.port
            }
        }, rinfo);
    }
});

module.exports = MasterState;