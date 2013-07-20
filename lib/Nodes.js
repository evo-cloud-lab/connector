/** @fileoverview
 * Node list management
 */

var Class = require('js-class');

var Nodes = Class(process.EventEmitter, {
    constructor: function () {
        this.nodes = {};
        this.revision = 0;
    },
    
    get master () {
        return this._masterId ? this.nodes[this._masterId] : null;
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
    
    add: function (id, info) {
        this.nodes[id] = { id: id, address: info.address, port: info.port };
        this._updated();
    },
    
    del: function (id) {
        if (this.nodes[id]) {
            delete this.nodes[id];
            this._updated();
        }
    },
    
    reload: function (nodesInfo) {
        this.nodes = nodesInfo.nodes;
        this.revision = nodesInfo.revision;
        this._masterId = nodesInfo.master;
        this.emit('update');
    },
    
    node: function (id) {
        return this.nodes[id];
    },
    
    syncMsg: function () {
        return {
            event: 'sync',
            data: {
                revision: this.revision,
                master: this._masterId,
                nodes: this.nodes
            }
        };
    },
    
    _updated: function () {
        this.revision ++;
        this.emit('update');
    }
});

module.exports = Nodes;