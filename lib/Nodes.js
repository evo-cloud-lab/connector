/** @fileoverview
 * Node list management
 */

var Class = require('js-class'),
    _     = require('underscore'),

    Node = require('./Node');

var Nodes = Class(process.EventEmitter, {
    constructor: function (localId) {
        this._localNode = new Node(localId);
        this.nodes = {};
        this.revision = 0;
        this._allExpects = {};
    },

    configure: function (localAddress, localPort) {
        this._localNode.address = localAddress;
        this._localNode.port = localPort;
    },

    get local () {
        return this._localNode;
    },

    get id () {
        return this._localNode.id;
    },

    get address () {
        return this._localNode.address;
    },

    get port () {
        return this._localNode.port;
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

    /** @field
     * @description retrieve expections of all nodes
     * Master only
     */
    get expectations () {
        return this._allExpects;
    },

    /** @field
     * @description set expections of all nodes
     * Master only
     */
    set expectations (states) {
        this._allExpects = states;
        this._updated();
    },

    /** @function
     * @description Used on master when master's states changed
     * Master only
     */
    masterUpdated: function () {
        this._updated();
    },

    /** @function
     * @description Refresh a node on receiving sync message
     * Master only
     */
    refresh: function (id, address, port, states) {
        var changed;
        if (id != this.id) {
            var node = this.nodes[id];
            if (!node ||
                node.address != address || node.port != port ||
                node.states.revision != states.revision) {
                node = this.nodes[id] = new Node(id, address, port);
                node.importStates(states, false);
                changed = true;
            }
            node.active = 1;
        }
        changed && this._updated();
        return changed;
    },

    /** @function
     * @description Reload all nodes from Master
     * Member only
     */
    reload: function (nodesInfo) {
        var nodes = {};
        nodesInfo.nodes.forEach(function (node) {
            if (node.id == this.id) {
                node.states && (this._localNode.expectation = node.states.expect);
            } else {
                nodes[node.id] = Node.importFrom(node);
            }
        }, this);
        this.nodes = nodes;
        this.revision = nodesInfo.revision;
        this._masterId = nodesInfo.master;
        this.emit('update');
    },

    /** @function
     * @description Find a node by id
     */
    node: function (id) {
        return this.nodes[id];
    },

    /** @function
     * @description Retire nodes out of sync
     * Master only
     */
    retire: function () {
        var expires = [];
        for (var id in this.nodes) {
            var node = this.nodes[id];
            if (isNaN(node.active) || (-- node.active) < 0) {
                expires.push(id);
            }
        }
        expires.forEach(function (id) {
            delete this.nodes[id];
        }, this);
        expires.length > 0 && this._updated();
    },

    /** @field
     * @description Get all nodes without master
     * Master only
     */
    get topology () {
        if (!this._topology) {
            this._topology = {
                revision: this.revision,
                master: this._masterId,
                nodes: Object.keys(this.nodes).map(function (id) {
                    return this.nodes[id].toObject(this._allExpects[id], true);
                }.bind(this))
            };
            // add master node
            this._topology.nodes.unshift(this._localNode.toObject(this._allExpects[this.id], true));
        }
        return this._topology;
    },

    /** @function
     * @description Simply dump all nodes
     */
    toObject: function () {
        var obj = {
            revision: this.revision,
            master: this._masterId,
            nodes: Object.keys(this.nodes).map(function (id) { return this.nodes[id].toObject(); }.bind(this))
        };
        // add local node
        obj.nodes.unshift(this._localNode.toObject());
        return obj;
    },

    _updated: function () {
        delete this._topology;
        this.revision ++;
        this.emit('update');
    }
});

module.exports = Nodes;