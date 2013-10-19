/** @fileoverview
 * Node definition
 */

var Class = require('js-class'),
    _     = require('underscore');

var Node = Class({
    constructor: function (id, address, port) {
        this.id = id;
        this.address = address;
        this.port = port;
        this._states = {
            revision: 0
        };
    },

    get states () {
        return this._states;
    },

    get localStates () {
        return _.pick(this._states, 'revision', 'actual');
    },

    updateStates: function (localStates) {
        this._states.actual = localStates;
        this._states.revision ++;
        return this;
    },

    importStates: function (s, withExpect) {
        this._states = _.pick(s, 'revision', 'actual');
        withExpect && (this._states.expect = s.expect);
        return this;
    },

    set expectation (expect) {
        this._states.expect = expect;
    },

    toObject: function (expect, withExpect) {
        var obj = _.extend(_.pick(this, 'id', 'address', 'port'), {
            states: _.pick(this._states, 'revision', 'actual', 'expect')
        });
        withExpect && (obj.states.expect = expect);
        return obj;
    }
}, {
    statics: {
        importFrom: function (obj) {
            var node = new Node(obj.id, obj.address, obj.port);
            node.importStates(obj.states, true);
            return node;
        }
    }
});

module.exports = Node;
