var Class  = require('js-class'),
    path   = require('path');

var cli;

var REQSTATE_STYLUS = {
    state: function (state) {
        return { FAILED: cli.err, COMPLETED: cli.ok }[state].call(cli, state);
    }
};

function neuronRequest(neuron, name, msg, callback) {
    cli.logAction('Request', msg.event);
    var timer = setTimeout(function () {
        cli.fatal('Neuron request timeout');
    }, 3000);
    neuron.request(name, msg, function (err, resp) {
        clearTimeout(timer);
        if (err) {
            cli.logAction('Response', msg.event, 'FAILED', REQSTATE_STYLUS);
            cli.fatal(err);
        } else {
            cli.logAction('Response', msg.event, 'COMPLETED', REQSTATE_STYLUS);
            cli.debugging && cli.logOut(cli.lo('Response: %j'), resp);
            callback(resp);
        }
    });
}

var STATE_COLORS = {
    offline: 'lo',
    announcing: 'verb',
    connecting: 'live',
    master: 'hot',
    member: 'ok'
};

var TIME_STYLUS = {
    state: function (state) { return cli.cold(state); }
};

function connectorSync(neuron, opts, callback) {
    if (typeof(opts) == 'function') {
        callback = opts;
        opts = {};
    }
    neuronRequest(neuron, 'connector', { event: 'sync', data: {} }, function (msg) {
        cli.logAction('Status', null, opts && opts.timestamp ? new Date().toLocaleTimeString() : null, TIME_STYLUS);
        cli.logObject(msg.data, {
            keyWidth: 10,
            renders: {
                'state': function (value) {
                    var color = STATE_COLORS[value];
                    value = value.toUpperCase();
                    color && (value = cli[color](value));
                    return value;
                },
                'address': function (val) {
                    if (val) {
                        return cli.cold(cli._(val));
                    } else {
                        return cli.renderValue(val);
                    }
                }
            }
        }, 1);
        callback && callback(msg.data);
    });
}

function connectorShow(opts) {
    cli.neuronConnectService('connector', opts, function (neuron) {
        connectorSync(neuron, function () { process.exit(0); });
    });
}

function connectorMonitor(opts) {
    cli.neuronConnectService('connector', opts, function (neuron) {
        neuron
            .subscribe('state', 'connector', function () { connectorSync(neuron, { timestamp: true }); })
            .subscribe('update', 'connector', function () { connectorSync(neuron, { timestamp: true }); })
            .subscribe('message', 'connector', function (msg) {
                cli.logAction('Message', null, new Date().toLocaleTimeString(), TIME_STYLUS);
                cli.logObject(msg, { keyWidth: 10 }, 1);
            });
        connectorSync(neuron, { timestamp: true });
    });
}

module.exports = function (theCli) {
    cli = theCli;

    cli.neuronCmd('con:show', function (cmd) {
        cmd.help('Display connector status and nodes');
    }, connectorShow);

    cli.neuronCmd('con:monitor', function (cmd) {
        cmd.help('Monitor connector status');
    }, connectorMonitor);
};
