/** @fileoverview
 * LinkPool manages connections between nodes
 */
var Class  = require('js-class'),
    _      = require('underscore'),
    neuron = require('evo-neuron'),
    Synapse = neuron.Synapse,
    Message = neuron.Message,
    
    Protocol = require('./Protocol'),
    Link     = require('./Link');

/** @class LinkPool
 * @description LinkPool manages connections between nodes.
 * Connections are automatically created if it doesn't exists. Otherwise, the existing
 * connection is reused regardless whether it is accepted or connected.
 */
var LinkPool = Class(process.EventEmitter, {
    /** @constructor
     * @param options   Specify the endpoint to listen on:
     *                      - address: ip address to bind
     *                      - port: port to bind
     */
    constructor: function (connector, options) {
        this.connector = connector;
        this.port = options.port;
        this.address = options.address;
        this.connections = {};
    },
    
    /** @field
     * @description Active link count
     */
    get count () {
        return Object.keys(this.connections).length;
    },
    
    /** @function
     * @description Start the listener
     */
    start: function (callback) {
        (this.receptor = Synapse.listen('tcp://' + this.address + ':' + this.port))
            .on('connection', this.onConnection.bind(this))
            .on('error', this.onListenerError.bind(this));
        callback && this.receptor.once('ready', callback);
    },
    
    /** @function
     * @description Add a link to pool
     * The existing link is closed and abandoned.
     */
    add: function (link) {
        var conn = this.connections[link.id];
        conn || (conn = this.connections[link.id] = { });
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
    
    /** @function
     * @description Find the link by node Id
     */
    link: function (id) {
        var conn = this.connections[id];
        return conn && conn.link;
    },
    
    /** @function
     * @description Send message to a node by node Ids
     * Link is automatically created if it doesn't exist.
     *
     * @param id   A single node Id in string or an array of node Ids.
     *              If not provided, the message is sent to all nodes.
     */
    send: function (msg, id) {
        id || (id = Object.keys(this.connector.nodes.nodes));
        Array.isArray(id) || (id = [id]);
        for (var i = 0; i < id.length; i ++) {
            this._send(msg, id[i]);
        }
    },
    
    /** @function
     * @description Disconnect all existing connections
     */
    clear: function () {
        var links = Object.keys(this.connections).map(function (id) {
            var link = this.connections[id].link;
            if (link) {
                delete link.pool;
            }
            return link;
        }.bind(this));
        this.connections = {};
        links.forEach(function (link) {
            link.disconnect();
        });
    },
    
    onConnection: function (synapse) {
        // wait for the initial identity info
        // a new connection must send "id" message within
        // the timeout interval.
        var timer = setTimeout(function () {
            timer = undefined;
            synapse.discard().disconnect();
        }, this.connector.timeout.identity);
        
        synapse
            .once('message', function (msg) {
                    if (timer) {
                        clearTimeout(timer);
                        timer = undefined;
                    }
                    var result = Protocol.parse(msg, Protocol.ID), err;
                    if (!result.ok) {
                        err = result.error;
                    } else if (msg.data.cluster != this.connector.cluster) {
                        err = Errors.badAttr('cluster', msg.data.cluster);
                    }
                    if (err) {
                        synapse.send(Message.error(err));
                        synapse.discard().disconnect();
                    } else {
                        synapse.removeAllListeners();
                        var link = new Link(this.connector, result.msg.data, synapse);
                        this.emit('connection', link);
                    }
                }.bind(this))
            .on('error', function (err) {
                    // when error, simply abandon the connection
                    if (timer) {
                        clearTimeout(timer);
                        timer = undefined;
                    }
                    synapse.discard();
                    this.connector.logger.error('INCOMING CONNECTION ERROR: %s', err.message);
                });
    },

    onLinkMsg: function (msg, link) {
        if (link.pool) {
            this.emit('message', msg, link);
        }
    },
    
    onLinkClose: function (link) {
        if (link.pool) {
            link.removeAllListeners('message');
            delete this.connections[link.id];
            delete link.pool;
            this.emit('disconnect', link);
        }
    },
    
    onListenerError: function (err) {
        this.connector.logger.critical('Listener error: %s', err.message);
        this.emit('error', err);
    },
    
    _send: function (msg, id) {
        var conn = this.connections[id];
        // In 'announcing' or 'master' state, no communicate link is created
        if (!conn && this.connector.id != this.connector.nodes.masterId) {
            // link to master can't be created here because it is created only in the cases:
            // 1. In 'announcing' or 'master' state, this connector is master,
            //    no link should be created to self
            // 2. In 'connecting' state, the link is created by ConnectingState,
            //    and added to linkpool after transited to 'member' state.
            if (id == this.connector.nodes.masterId) {
                throw new Error('Master link can not be created automatically');
            }
            var node = this.connector.nodes.node(id);
            if (!node) {
                throw new Error('Invalid node ID: ' + id);
            }
            var info = _.extend(_.pick(node, 'id', 'address', 'port'), { usage: 'communicate' });
            var link = Link.connect(this.connector, info);
            link.send({
                event: 'id',
                data: {
                    id: this.connector.id,
                    cluster: this.connector.cluster,
                    address: this.connector.address,
                    port: this.connector.port,
                    usage: info.usage
                }
            });
            this.add(link);
            conn = this.connections[id];    // retrieve newly created connection
        }
        conn && conn.link.send(msg);
    }
});

module.exports = LinkPool;