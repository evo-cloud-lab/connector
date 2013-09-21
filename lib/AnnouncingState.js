/** @fileoverview
 * Master state
 */

var Class  = require('js-class'),

    MasterState = require('./MasterState');

var INTERVALS = [100, 200, 200, 500, 500, 500, 1000, 1000, 1000, 5000, 30000];

var AnnouncingState = Class(MasterState, {
    constructor: function (connector, options) {
        MasterState.prototype.constructor.call(this, connector);
        this._intervals = Array.isArray(options.announceIntervals) ? options.announceIntervals : INTERVALS;
    },

    leave: function () {
        this._stopAnnouncement();
    },

    _startAnnouncement: function () {
        this._announceInterval = 0;
        this._masterAnnounce();
    },

    _stopAnnouncement: function () {
        if (this._announcingTimer) {
            clearTimeout(this._announcingTimer);
            delete this._announcingTimer;
        }
    },

    _masterAnnounce: function () {
        this._stopAnnouncement();
        this._announce();
        if (++ this._announceInterval < this._intervals.length) {
            this._announcingTimer = setTimeout(this._masterAnnounce.bind(this),
                                               this._intervals[this._announceInterval - 1]);
        } else {
            this.connector.states.transit('ready', this._intervals[this._intervals.length - 1]);
        }
    },

    _startNodesMonitor: function () {
        // stub this: nodes monitor is off
    },

    _stopNodesMonitor: function () {
        // stub this: nodes monitor is off
    }
});

module.exports = AnnouncingState;