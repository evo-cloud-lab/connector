/** @fileoverview
 * Offline state
 */

var Class  = require('js-class'),

    State = require('./State');

var OfflineState = Class(OfflineState, {
    constructor: function (connector) {
        State.prototype.constructor.call(this, connector);
    }
});

module.exports = OfflineState;