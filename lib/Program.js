var Class     = require('js-class'),
    path      = require('path'),
    fs        = require('fs'),
    _         = require('underscore'),
    uuid      = require('uuid'),
    elements  = require('evo-elements'),
    Config    = elements.Config,
    Logger    = elements.Logger,
    Neuron    = require('evo-neuron').Neuron,
    Connector = require('./Connector');

var Program = Class({
    constructor: function () {
        var conf = Config.conf({ reloadSignal: true });
        var options = conf.opts.connector;
        if (!options || !options.cluster) {
            throw new Error('Invalid configuration: require connector.cluster');
        }
        options.id || (options.id = this._loadId());

        this.logger = new Logger('connector:' + options.cluster);
        // state reported by dendrites
        this._states = {};
        this._globalStates = {};

        (this.neuron = new Neuron({ name: 'connector' }))
            .on('error', this.neuronError.bind(this))
            .on('disconnect', this.dendriteDisconnect.bind(this))
            .dispatch('sync', this.handleSync.bind(this))
            .dispatch('send', this.handleSend.bind(this))
            .dispatch('states', this.handleState.bind(this));
        (this.connector = new Connector(options))
            .on('state', this.onState.bind(this))
            .on('nodes', this.onNodes.bind(this))
            .on('message', this.onMessage.bind(this));
        conf.on('reload', this.onReload.bind(this));
    },

    run: function () {
        this.neuron.start();
        this.connector.start();
    },

    neuronError: function (err, info) {
        // there's no axon branches, error happens on a dendrites
        if (info.src == 'd') {
            this.logger.warn('Dendrite error [%s]: %s', info.id, err.message);
        }
    },

    dendriteDisconnect: function (id) {
        if (this._states[id]) {
            delete this._states[id];
            this._updateLocalStates();
        }
    },

    handleSync: function (req) {
        this.logger.debug('REQ[%s] %s: %j', req.src, req.event, req.data);
        var data = this.connector.clusterInfo();
        this.logger.debug('RSP[%s] %s: %j', req.src, req.event, data);
        req.respond({
            event: 'update',
            data: data
        });
    },

    handleSend: function (req) {
        this.logger.debug('REQ[%s] %s: %j', req.src, req.event, req.data);
        var dst = req.data.dst;
        dst == 'master' && (dst = this.connector.nodes.masterId);
        this.connector.send(req.data.msg, dst);
    },

    handleState: function (req) {
        this.logger.debug('REQ[%s] %s: %j', req.src, req.event, req.data);
        if (req.data.states) {
            req.data.global ? _.extend(this._globalStates, req.data.states)
                            : (this._states[req.src] = req.data.states);
            this._updateLocalStates();
        }
    },

    onReload: function () {
        var options = Config.conf().opts.connector;
        if (typeof(options) == 'object') {
            this.connector.reconfigure(options);
        }
    },

    onState: function (state) {
        this.neuron.cast({
            event: 'state',
            data: {
                state: state
            }
        });
    },

    onNodes: function () {
        this.neuron.cast({
            event: 'update',
            data: this.connector.clusterInfo()
        });
    },

    onMessage: function (msg, id) {
        this.neuron.cast({
            event: 'message',
            data: {
                src: id,
                msg: msg
            }
        });
    },

    _loadId: function () {
        var idfile = path.join(Config.conf().opts.datadir || '.', 'connector-id'), id;
        try {
            id = fs.readFileSync(idfile).toString();
        } catch (e) {
            // ignored
        }
        if (!id) {
            id = uuid.v4();
            try {
                fs.writeFileSync(idfile, id);
            } catch (e) {
                // ignored
            }
        }
        return id;
    },

    _updateLocalStates: function () {
        var states = _.clone(this._globalStates);
        for (var id in this._states) {
            for (var key in this._states[id]) {
                states[key] = this._states[id][key];
            }
        }
        this.connector.updateLocalStates(states);
    }
}, {
    statics: {
        run: function () {
            new Program().run();
        }
    }
});

module.exports = Program;
