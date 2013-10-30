var Class  = require('js-class'),
    path   = require('path');

var cli;

function neuronRequest(neuron, name, msg, callback) {
    cli.log(cli.verb('Req') + ' ' + cli.hi(msg.event) + ' ...');
    var timer = setTimeout(function () {
        cli.fatal('Neuron request timeout');
    }, 3000);
    neuron.request(name, msg, function (err, resp) {
        clearTimeout(timer);
        if (err) {
            cli.log(cli.verb('Req') + ' ' + cli.hi(msg.event) + ' ' + cli.err('FAILED'));
            cli.fatal(err);
        } else {
            cli.log(cli.verb('Req') + ' ' + cli.hi(msg.event) + ' ' + cli.ok('COMPLETED'));
            cli.debugging && cli.log(cli.lo('Response: %j'), resp);
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

function connectorSync(neuron, opts, callback) {
    if (typeof(opts) == 'function') {
        callback = opts;
        opts = {};
    }
    neuronRequest(neuron, 'connector', { event: 'sync', data: {} }, function (msg) {
        cli.log((opts && opts.timestamp ? cli.cold(new Date().toLocaleTimeString()) + ' ' : '') + cli.verb('Status'))
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
                cli.log(cli.cold(new Date().toLocaleTimeString()) + ' ' + cli.verb('Message'));
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
