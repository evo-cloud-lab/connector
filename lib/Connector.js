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
    AnnouncingState = require('./AnnouncingState'),
    MasterState     = require('./MasterState'),
    ConnectingState = require('./ConnectingState'),
    MemberState     = require('./MemberState');

var Connector = Class(process.EventEmitter, {
    constructor: function (options, logger) {
        if (!options) {
            options = Config.conf().opts;
            logger = new Logger('connector:' + options.cluster, '<' + options.id + '>');
        }
        options = Schema.accept({
            id: { type: 'string', empty: false },
            cluster: { type: 'string', empty: false },
            address: 'ip',
            port: 'integer',
            broadcast: 'ip'
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
            .state('announcing', new AnnouncingState(this, options))
                .when('ready').to('master')
                .when('connect').to('connecting')
            .state('master', new MasterState(this))
                .when('connect').to('connecting')
            .state('connecting', new ConnectingState(this))
                .when('ready').to('member')
                .when('fail').to('announcing')
            .state('member', new MemberState(this))
                .when('disconnected').to('connecting')
                .when('redirected').to('connecting')
            .init('announcing')
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
    start: function (callback) {
        this.logger.notice('START');
        this.announcer.start();
        this.states.start();
        this.linkpool.start(callback);
        return this;
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
    }
});

module.exports = Connector;