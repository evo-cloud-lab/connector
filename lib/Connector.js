/** @fileoverview
 * Connector connects the node to the self-managed network
 */

var Class    = require('js-class'),
    async    = require('async'),
    elements = require('evo-elements'),
    Errors       = elements.Errors,
    Schema       = elements.Schema,
    StateMachine = elements.StateMachine,
    neuron   = require('evo-neuron'),
    Synapse  = neuron.Synapse,
    Message  = neuron.Message,

    Nodes           = require('./Nodes'),
    Announcer       = require('./Announcer'),
    LinkPool        = require('./LinkPool'),
    Protocol        = require('./Protocol'),
    MasterState     = require('./MasterState'),
    ConnectingState = require('./ConnectingState'),
    MemberState     = require('./MemberState');

var Connector = Class(process.EventEmitter, {
    constructor: function (options) {
        this._id = options.id;
        this._cluster = options.cluster;

        this.timeout = {
            identity:       5000,
            communicate:    60000,
            membership:     10000
        };
        for (var key in this.timeout) {
            options[key] != undefined && (this.timeout[key] = parseInt(options[key]));
        }

        this.nodes = new Nodes()
            .on('update', this.onNodesUpdated.bind(this));

        this.states = new StateMachine()
            .state('master', new MasterState(this))
                .when('connect').to('connecting')
            .state('connecting', new ConnectingState(this))
                .when('ready').to('member')
                .when('fail').to('master')
            .state('member', new MemberState(this))
                .when('disconnected').to('connecting')
            .init('master')
            .on('transit', this.onTransit.bind(this));

        this.announcer = new Announcer(options)
            .on('message', this.onAnnouncing.bind(this));

        this.linkpool = new LinkPool(this, options)
            .on('connection', this.onConnection.bind(this))
            .on('disconnect', this.onDisconnect.bind(this))
            .on('message', this.onMessage.bind(this));
    },
    
    get id () {
        return this._id;
    },
    
    get cluster () {
        return this._cluster;
    },
    
    get address () {
        return this.announcer.address;
    },
    
    get port () {
        return this.announcer.port;
    },
    
    get state () {
        return this._state;
    },
    
    get isMaster () {
        return this._state == 'master';
    },
    
    start: function (callback) {
        async.each([this.announcer, this.linkpool], function (startable, next) {
            startable.start(next);
        }, function (err) {
            !err && this.states.start();
            callback && callback(err);
        });
    },
    
    announce: function (msg, rinfo) {
        var data = Synapse.encodeMessage(msg);
        rinfo ? this.announcer.unicast(data, rinfo) : this.announcer.broadcast(data);
    },
    
    onNodesUpdated: function () {
        this.emit('nodes');
    },
    
    onTransit: function (curr, next) {
        this._state = next;
        this.emit('state', this._state);
    },
    
    onAnnouncing: function (msgBuf, rinfo) {
        var result = Protocol.parse(msgBuf, Protocol.ANNOUNCE);
        result.ok && this.states.process('announce', result.msg, rinfo);
    },
    
    onConnection: function (info, synapse) {
        this.states.process('connection', info, synapse);
    },
    
    onDisconnect: function (link) {
        this.states.process('disconnect', link);
    },
    
    onMessage: function (msg, id) {
        this.states.process('message', msg, id);
    }
});

module.exports = Connector;