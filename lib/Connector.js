/** @fileoverview
 * Connector connects the node to the self-managed network
 */

var Class    = require('js-class'),
    async    = require('async'),
    elements = require('evo-elements'),
    Config       = elements.Config,
    Logger       = elements.Logger,
    Schema       = elements.Schema,
    StateMachine = elements.StateMachine,

    Nodes           = require('./Nodes'),
    Announcer       = require('./Announcer'),
    LinkPool        = require('./LinkPool'),
    OfflineState    = require('./OfflineState'),
    AnnouncingState = require('./AnnouncingState'),
    MasterState     = require('./MasterState'),
    ConnectingState = require('./ConnectingState'),
    MemberState     = require('./MemberState');

var Connector = Class(process.EventEmitter, {
    constructor: function (options, logger) {
        options || (options = Config.conf().opts);
        logger || (logger = new Logger('connector:' + options.cluster, '<' + options.id + '>'));
        options = Schema.accept({
            id: { type: 'string', empty: false },
            cluster: { type: 'string', empty: false }
        }, options, { throws: true, all: true });

        // Required: id and cluster name must be specified.
        this._id = options.id;
        this._cluster = options.cluster;

        // Timeout values for different link usages:
        // - identity: when accepting a new connection,
        //             message 'id' is expected within the timeout interval,
        //             otherwise the connection is forced to close;
        // - communicate: this type of link will be closed if it keeps slient
        //             over the timeout interval
        // - membership: this type of link is especially used by members to connect
        //             to master. On master side, if there's no communication within
        //             timeout interval, this member is treated as lost, and the link
        //             will be removed. On member side, heartbeat (msg 'sync') must be
        //             sent before it times out. Usually, the period is 1/3 of this interval.
        this.timeout = {
            identity:       5000,
            communicate:    60000,
            membership:     10000
        };
        for (var key in this.timeout) {
            var keyName = key + 'Timeout';
            options[keyName] != undefined && (this.timeout[key] = parseInt(options[keyName]));
        }

        this.options = options;

        // Synapse options for reconnecting mechanism, see Synapse#connect.
        this.synapseOptions = typeof(options.synapse) == 'object' ? options.synapse : {};

        // Create a dummy logger if logger is not provided.
        this.logger = Logger.wrap(logger);

        // "nodes" manages all nodes connected in the network.
        this.nodes = new Nodes()
            .on('update', this.onNodesUpdated.bind(this));

        // Define a state machine for managing the network:
        // When a connector starts, it enters 'announcing' state which is actually a 'master' state
        // without being stable. During 'announcing' state, the connector accepts member connections and
        // keeps broadcasting "master-claim" according to a fast-to-slow interval sequence. During this
        // period, other nodes can participate by sending "master-claim" too. This is master election
        // phase. When the sequence is completed and there's no other nodes claims with higher scores
        // against this claim, it transits to 'master' state.
        // 'master' state is a stable state. If a nother nodes claims with higher scores, the connector
        // transits to 'connecting' state to become a member of that node.
        // 'connecting' state tries to connect to a new master. If succeeded, it transits to 'member' state
        // or it fails back to 'announcing' and try becoming a master.
        // 'member' state keeps a link to master with periodical heartbeats. If this link is broken, it
        // transits to 'connecting' and possibly comes back to 'member' or starts 'announcing' if master is down.
        this.states = new StateMachine()
            .state('offline', new OfflineState(this))
                .when('configured').to('announcing')
                .fallback('offline')
            .state('announcing', new AnnouncingState(this, options))
                .when('ready').to('master')
                .when('connect').to('connecting')
                .when('configured').to('announcing')
                .when('unconfigured').to('offline')
            .state('master', new MasterState(this))
                .when('connect').to('connecting')
                .when('configured').to('announcing')
                .when('unconfigured').to('offline')
            .state('connecting', new ConnectingState(this))
                .when('ready').to('member')
                .when('fail').to('announcing')
                .when('configured').to('announcing')
                .when('unconfigured').to('offline')
            .state('member', new MemberState(this))
                .when('disconnected').to('connecting')
                .when('redirected').to('connecting')
                .when('configured').to('announcing')
                .when('unconfigured').to('offline')
            .init('offline')
            .on('transit', this.onTransit.bind(this));

        // Announcer opens up the endpoint for broadcasting and receiving "master-claim".
        // Usually this is implemented with a UDP socket, and as a convention, the same address:port
        // is bounded to TCP listener in LinkPool for accepting connections.
        this.announcer = new Announcer(this.logger, options);
        this._process(this.announcer, 'message', 'announce');

        // LinkPool manages the links connecting other nodes. Links are automatically created if it is not
        // connected yet. Reconnection is also attempted by the lower level Synapse. In 'announcing' or 'master'
        // state, links are only accepted, and never go out as this connector is assumed to be a central node.
        this.linkpool = new LinkPool(this, options);
        this._process(this.linkpool, 'connection');
        this._process(this.linkpool, 'disconnect');
        this._process(this.linkpool, 'message');
    },

    /** @field
     * @description Unique node Id
     */
    get id () {
        return this._id;
    },

    /** @field
     * @description Cluster name
     */
    get cluster () {
        return this._cluster;
    },

    /** @field
     * @description Announcer address
     */
    get address () {
        return this.announcer.address;
    },

    /** @field
     * @description Announcer port
     */
    get port () {
        return this.announcer.port;
    },

    /** @field
     * @description Current state
     * It is possible this value is undefined before start
     */
    get state () {
        return this._state;
    },

    /** @function
     * @description Start the connector
     */
    start: function () {
        this.logger.notice('START');
        this.states.start();
        if (this.options.address && this.options.port && this.options.broadcast) {
            this.reconfigure(this.options, true);
        }
        return this;
    },

    /** @function
     * @description Send message to nodes
     */
    send: function (msg, nodeIds) {
        var wrappedMsg = {
            event: 'message',
            data: {
                src: this.id,
                origin: msg
            }
        };
        this.linkpool.send(wrappedMsg, nodeIds);
    },

    /** @function
     * @description Reload address configuration
     */
    reconfigure: function (opts, always) {
        this.logger.notice('RECONFIGURE %j', opts)
        var options = Schema.accept({
            address: 'ip',
            port: 'integer',
            broadcast: 'ip'
        }, opts);

        if (!options) {
            this.logger.warn('RECONFIGURE Invalid Options: %j', opts);
            return false;
        }

        var reconfigurables = [], reconnect = false;
        if (always ||
            options.address != this.options.address ||
            options.port != this.options.port) {
            reconfigurables.push(this.announcer);
            reconfigurables.push(this.linkpool);
            reconnect = true;
        } else if (options.broadcast != this.options.broadcast) {
            reconfigurables.push(this.announcer);
        }

        reconfigurables.length > 0 && ['address', 'port', 'broadcast'].forEach(function (key) {
            options[key] != null && (this.options[key] = options[key]);
        }, this);

        async.each(reconfigurables, function (reconfigurable, next) {
            reconfigurable.reconfigure(options, next);
        }, function (err) {
            if (err) {
                this.logger.critical('CONFIGURATION Failed(%j): %s', options, err.message);
                this.states.transit('unconfigured');
            } else {
                this.logger.notice('CONFIGURED %j', options);
                if (reconnect) {
                    this.states.transit('configured');
                }
            }
        }.bind(this));
        return true;
    },

    onNodesUpdated: function () {
        this.logger.notice('NODES %j', this.nodes);
        this.states.process('nodes');
        this.emit('nodes');
    },

    onTransit: function (curr, next) {
        this.logger.notice('STATE %s -> %s, %s', curr, next, this.nodes.masterId);
        this._state = next;
        this.emit('state', this._state);
    },

    _process: function (source, event, transKey) {
        transKey || (transKey = event);
        var states = this.states;
        source.on(event, function () {
            var args = [].slice.call(arguments);
            args.unshift(transKey);
            states.process.apply(states, args);
        });
    },

    _message: function (msg, link) {
        if (msg.event == 'message') {
            this.emit('message', msg.data.origin, msg.data.src, link.id);
        }
    }
});

module.exports = Connector;