/** @fileoverview
 * The broadcast simulation on lo interface
 */
var Class    = require('js-class'),
    dgram    = require('dgram'),
    elements = require('evo-elements'),
    conf     = elements.Config.conf(),
    Logger   = elements.Logger,
    Synapse  = require('evo-neuron').Synapse;

var Broadcaster = Class({
    constructor: function () {
        this.sourceAddr = conf.query('source', '127.0.0.1');
        this.broadcastAddr = conf.query('broadcast', '127.0.0.2');
        this.basePort = conf.query('port', 11100);
        this.count = conf.query('count', 16);
        this.logger = new Logger('lobcast');
    },
    
    run: function () {
        for (var i = 0; i < this.count; i ++) {
            (function (id) {
                socket = dgram.createSocket('udp4');
                socket.bind(this.basePort + i, this.broadcastAddr);
                socket.on('message', function (msg) {
                    this.logMessage(id, msg);
                    for (var j = 0; j < this.count; j ++) {
                        if (j != id) {
                            socket.send(msg, 0, msg.length, this.basePort + j, '127.0.0.1');
                        }
                    }
                }.bind(this));
            }.bind(this))(i);
        }
        this.logger.notice('READY %s:%s:%d+%d', this.sourceAddr, this.broadcastAddr, this.basePort, this.count);
    },
    
    logMessage: function (id, msgBuf) {
        var msg = Synapse.decodeMessage(msgBuf);
        if (msg) {
            this.logger.verbose('%d: %j', id, msg);
        } else {
            this.logger.error('%d: Invalid Message: %d bytes', id, msgBuf.length);
        }
    }
});

new Broadcaster().run();