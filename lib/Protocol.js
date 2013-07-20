/** @fileoverview
 * Communication message schemas
 */
var elements = require('evo-elements'),
    Schema   = elements.Schema,
    Errors   = elements.Errors,
    Synapse  = require('evo-neuron').Synapse;

var NODE_SCHEMA = {
    id:         { type: 'string', empty: false },
    address:    'ip',
    port:       'integer'
};

function nodeEntry(opts, value, attrName) {
    if (typeof(value) == 'object') {
        var nodes = {};
        for (var id in value) {
            var node = Schema.accept(NODE_SCHEMA, value[id]);
            if (node instanceof Error) {
                return node;
            }
            nodes[id] = node;
        }
        return nodes;
    }
    return Errors.badAttr(attrName, value);
}

module.exports = {
    ANNOUNCE: {
        // announcement for claiming master state
        'master-claim': {
            id:         { type: 'string', empty: false },   // node id
            cluster:    { type: 'string', empty: false },   // cluster name
            address:    'ip',                               // node address
            port:       'integer'                           // listening port
        }
    },

    CONNECT: {
        id: {
            id:         { type: 'string', empty: false },   // node id
            cluster:    { type: 'string', empty: false },   // cluster name
            address:    'ip',                               // node address
            port:       'integer',                          // listening port
            usage:      ['communicate', 'membership'],      // how the link is used for
        },
        
        redir: {
            id:         { type: 'string', empty: false },   // master node id
            address:    'ip',
            port:       'integer'
        },
        
        sync: {
            master:     { type: 'string', empty: false },   // master node id
            revision:   'integer',
            nodes:      { fn: nodeEntry }
        }
    },
    
    parse: function(msg, schemas) {
        Buffer.isBuffer(msg) && (msg = Synapse.decodeMessage(msg));
        var schema = msg && schemas[msg.event];
        var data = schema && Schema.accept(schema, msg.data);
        if (data instanceof Error) {
            return { error: data, origin: msg };
        }
        return data ? { ok: true, msg: { event: msg.event, data: data }, origin: msg }
                    : { error: Errors.make('BADMSG', { message: 'Invalid message' }), origin: msg };
    }
};