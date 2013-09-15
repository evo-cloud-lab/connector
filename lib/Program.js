var Class     = require('js-class'),
    path      = require('path'),
    fs        = require('fs'),
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

        (this.neuron = new Neuron({ name: 'connector' }))
            .on('error', this.neuronError.bind(this))
            .dispatch('sync', this.handleSync.bind(this))
            .dispatch('send', this.handleSend.bind(this));
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

    handleSync: function (req) {
        this.logger.debug('REQ[%s] %s: %j', req.src, req.event, req.data);
        var data = this.connector.nodes.toObject();
        data.state = this.connector.state;
        data.localId = this.connector.id;
        this.logger.debug('RSP[%s] %s: %j', req.src, req.event, data);
        req.respond({
            event: 'refresh',
            data: data
        });
    },

    handleSend: function (req) {
        this.logger.debug('REQ[%s] %s: %j', req.src, req.event, req.data);
        this.connector.send(req.data.msg, req.data.dst);
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
            data: {
                state: this.connector.state,
                revision: this.connector.nodes.revision
            }
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
    }
}, {
    statics: {
        run: function () {
            new Program().run();
        }
    }
});

module.exports = Program;