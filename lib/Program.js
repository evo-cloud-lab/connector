var Class     = require('js-class'),
    Neuron    = require('evo-neuron').Neuron,
    Connector = require('./Connector');

var Program = Class({
    constructor: function () {
        (this.neuron = new Neuron({ name: 'connector' }))
            .dispatch('sync', this.handleSync.bind(this));
        (this.connector = new Connector())
            .on('state', this.onState.bind(this))
            .on('nodes', this.onNodes.bind(this));
    },
    
    run: function () {
        this.neuron.start();
        this.connector.start();
    },
    
    handleSync: function (req) {
        var data = this.connector.nodes.toObject();
        data.state = this.connector.state;
        req.response({
            event: 'refresh',
            data: data
        });
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
    }
}, {
    statics: {
        run: function () {
            new Program().run();
        }
    }
});

module.exports = Program;