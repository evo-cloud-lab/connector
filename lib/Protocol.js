/** @fileoverview
 * Communication message schemas
 */
var _        = require('underscore'),
    elements = require('evo-elements'),
    Schema   = elements.Schema,
    Errors   = elements.Errors,
    Synapse  = require('evo-neuron').Synapse;

var NODE_SCHEMA = {
    id:         { type: 'string', empty: false },
    address:    'ip',
    port:       'integer'
};

var Schemas = {
    redir: {
        id:         { type: 'string', empty: false },   // master node id
        address:    'ip',
        port:       'integer'
    },

    refresh: {
        master:     { type: 'string', empty: false },   // master node id
        revision:   'integer',
        nodes:      { array: Schema.nest(NODE_SCHEMA) }
    },

    sync: {
        id:         { type: 'string', empty: false },
        revision:   'integer'
    }
};

module.exports = {
    ANNOUNCE: {
        // announcement for claiming master state
        'master-claim': {
            id:         { type: 'string', empty: false },   // node id
            cluster:    { type: 'string', empty: false },   // cluster name
            address:    'ip',                               // node address
            port:       'integer',                          // listening port
            score:      { array: 'integer' }                // election score
        }
    },

    ID: {
        id: {
            id:         { type: 'string', empty: false },   // node id
            cluster:    { type: 'string', empty: false },   // cluster name
            address:    'ip',                               // node address
            port:       'integer',                          // listening port
            usage:      ['communicate', 'membership'],      // how the link is used for
        }
    },

    MASTER:  _.pick(Schemas, 'sync'),

    CONNECT: _.pick(Schemas, 'redir', 'refresh'),

    MEMBER:  _.pick(Schemas, 'redir', 'refresh'),

    parse: function(msg, schemas) {
        Buffer.isBuffer(msg) && (msg = Synapse.decodeMessage(msg));
        var schema = msg && schemas[msg.event];
        var data = schema && Schema.accept(schema, msg.data);
        if (data instanceof Error) {
            return { error: data, origin: msg };
        }
        return data ? { ok: true, msg: { event: msg.event, data: data }, origin: msg }
                    : { error: Errors.make('BADMSG', {
                                            message: msg ? 'Invalid message: ' + msg.event
                                                         : 'Malformed message'
                                        }), origin: msg };
    }
};