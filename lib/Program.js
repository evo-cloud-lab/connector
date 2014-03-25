var Class     = require('js-class'),
    path      = require('path'),
    fs        = require('fs'),
    _         = require('underscore'),
    uuid      = require('uuid'),
    neuron    = require('evo-neuron'),
    Connector = require('./Connector');

var Program = Class(neuron.Program, {
    constructor: function () {
        neuron.Program.prototype.constructor.call(this, 'connector');
        if (!this.options.single) {
            if (!this.options.cluster) {
                throw new Error('Invalid configuration: require connector.cluster');
            }
            this.options.id || (this.options.id = this._loadId());
        }

        // state reported by dendrites
        this._states = {};
        this._globalStates = {};

        this
            .dispatch('sync')
            .dispatch('request', { schema: { msg: 'object', dst: 'string' } })
            .dispatch('respond', { schema: { origin: 'object', msg: 'object' } })
            .dispatch('send',    { schema: { msg: 'object', dst: { nullable: true } } })
            .dispatch('states',  { schema: { states: 'object', global: { nullable: 'boolean' } } })
            .dispatch('expects', { schema: { states: 'object' } })
        ;
        (this.connector = new Connector(this.options))
            .on('state', this.onState.bind(this))
            .on('nodes', this.onNodes.bind(this))
            .on('message', this.onMessage.bind(this))
        ;
    },

    run: function () {
        this.neuron.start();
        this.connector.start();
    },

    reload: function (options) {
        this.connector.reconfigure(options);
    },

    onConnect: function (id) {
        this.neuron.cast({ event: 'state', data: { state: this.connector.state } }, { target: id });
        this.neuron.cast({ event: 'update', data: this.connector.clusterInfo() }, { target: id });
    },

    onDisconnect: function (id) {
        if (this._states[id]) {
            delete this._states[id];
            this._updateLocalStates();
        }
    },

    'neuron:sync': function (req) {
        req.ok(this.connector.clusterInfo());
    },

    'neuron:request': function (req, params) {
        var dst = params.dst;
        dst == 'master' && (dst = this.connector.nodes.masterId);
        var msg = {
            event: 'request',
            data: {
                origin: {
                    src: this.connector.id,
                    dendrite: req.src,
                    id: req.raw.id
                },
                msg: params.msg
            }
        };
        this.connector.send(msg, dst);
    },

    'neuron:respond': function (req, params) {
        var msg = {
            event: 'response',
            data: {
                origin: params.origin,
                msg: params.msg
            }
        };
        var result = this.connector.send(msg, params.origin.src);
        req.ok({ result: result });
    },

    'neuron:send': function (req, params) {
        var dst = params.dst;
        dst == 'master' && (dst = this.connector.nodes.masterId);
        var result = this.connector.send(params.msg, dst);
        req.ok({ result: result });
    },

    'neuron:states': function (req, params) {
        params.global ? _.extend(this._globalStates, params.states)
                      : (this._states[req.src] = params.states);
        this._updateLocalStates();
        req.ok();
    },

    'neuron:expects': function (req, params) {
        this.connector.setExpectations(params.states);
        req.ok();
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
        if (msg.event == 'request') {
            this.neuron.cast({
                event: 'request',
                data: msg.data
            });
        } else if (msg.event == 'response' && msg.data && msg.data.origin) {
            this.neuron.respond(msg.data.msg, msg.data.origin.dendrite, msg.data.origin.id);
        } else {
            this.neuron.cast({
                event: 'message',
                data: {
                    src: id,
                    msg: msg
                }
            });
        }
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
