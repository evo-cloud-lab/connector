/** @fileoverview
 * Node list management
 */

var Class = require('js-class');

var Nodes = Class(process.EventEmitter, {
    constructor: function (localId) {
        this._localId = localId;
        this.nodes = {};
        this.revision = 0;
    },

    get masterId () {
        return this._masterId;
    },

    set masterId (id) {
        if (this._masterId != id) {
            this._masterId = id;
            this._updated();
        }
    },

    add: function (id, address, port) {
        if (id != this._localId) {
            this.nodes[id] = { id: id, address: address, port: port, active: 1 };
            this._updated();
        }
    },

    del: function (id) {
        if (this.nodes[id]) {
            delete this.nodes[id];
            this._updated();
        }
    },

    reload: function (nodesInfo) {
        var nodes = {};
        nodesInfo.nodes.forEach(function (node) {
            node.id != this._localId && (nodes[node.id] = node);
        }, this);
        this.nodes = nodes;
        this.revision = nodesInfo.revision;
        this._masterId = nodesInfo.master;
        this.emit('update');
    },

    node: function (id) {
        return this.nodes[id];
    },

    activate: function (id) {
        var node = this.nodes[id];
        node && (node.active = 1);
    },

    retire: function () {
        var changes = 0;
        Object.keys(this.nodes).forEach(function (id) {
            var node = this.nodes[id];
            if (isNaN(node.active) || (-- node.active) < 0) {
                delete this.nodes[id];
                changes ++;
            }
        }, this);
        changes > 0 && this.emit('update');
    },

    toObject: function () {
        return {
            revision: this.revision,
            master: this._masterId,
            nodes: Object.keys(this.nodes).map(function (id) { return this.nodes[id]; }.bind(this))
        };
    },

    _updated: function () {
        this.revision ++;
        this.emit('update');
    }
});

module.exports = Nodes;