/** @fileoverview
 * LinkPool manages connections between nodes
 */
var Class   = require('js-class'),
    Synapse = require('evo-neuron').Synapse,
    
    Protocol = require('./Protocol'),
    Link     = require('./Link');

var LinkPool = Class(process.EventEmitter, {
    constructor: function (cpnnector, options) {
        this.connector = connector;
        this.port = options.port;
        this.address = options.address;
        this.connections = {};
    },
    
    start: function (callback) {
        (this.receptor = Synapse.listen('tcp://' + this.address + ':' + this.port))
            .on('connection', this.onConnection.bind(this));
        callback && this.receptor.once('ready', callback);
    },
    
    add: function (link) {
        var conn = this.connections[info.id];
        conn || (conn = this.connections[info.id] = { });
        var oldLink = conn.link;
        conn.link = link;

        if (oldLink) {
            delete oldLink.pool;
            oldLink.disconnect();
        }

        link.pool = this;
        link.once('close', this.onLinkClose.bind(this))
            .on('message', this.onLinkMsg.bind(this));
    },
    
    link: function (id) {
        var conn = this.connections[id];
        return conn && conn.link;
    },
    
    send: function (msg, id) {
        id || (id = Object.keys(this.connector.nodes.nodes));
        Array.isArray(id) || (id = [id]);
        for (var i = 0; i < id.length; i ++) {
            this._send(msg, id[i]);
        }
    },
    
    onConnection: function (synapse) {
        // wait for the initial identity info
        synapse.once('message', function (msg) {
            var err;
            if (msg.event == 'id') {
                var result = Protocol.parse(msg, Protocol.CONNECT);
                if (!result.ok) {
                    err = result.error;
                } else if (msg.data.cluster != this.connector.cluster) {
                    err = Errors.badAttr('cluster', msg.data.cluster);
                }
            } else {
                err = Errors.make('BADMSG', { message: 'Message "id" is expected' });
            }
            if (err) {
                synapse.send(Message.error(err));
                synapse.disconnect();
            } else {
                this.emit('connection', msg.data, synapse);
            }
        }.bind(this)).setTimeout(this.timeout.identity);        
    },

    onLinkMsg: function (msg, link) {
        this.emit('message', msg, link.id);
    },
    
    onLinkClose: function (link) {
        if (link.pool) {
            link.removeAllListeners('message');
            delete this.connections[link.id];
            this.emit('disconnect', link);
        }
    },
    
    _send: function (msg, id) {
        var conn = this.connections[id];
        if (!conn) {
            if (id == this.connector.nodes.masterId) {
                throw new Error('Master link can not be created automatically');
            }
            var node = this.connector.nodes.node(id);
            if (!node) {
                throw new Error('Invalid node ID: ' + id);
            }
            var synapse = Synapse.connect('tcp://' + node.address + ':' + node.port)
                                 .send({
                                    event: 'id',
                                    data: {
                                        id: this.connector.id,
                                        cluster: this.connector.cluster,
                                        address: this.connector.address,
                                        port: this.connector.port,
                                        usage: 'communicate'
                                    }
                                 });
            var link = new Link({
                id: id,
                address: node.address,
                port: node.port,
                usage: 'communicate'
            }, synapse, { timeout: this.connector.timeout.communicate });
            this.add(link);
            conn = this.connections[id];
        }
        conn.link.send(msg);
    }
});

module.exports = LinkPool;