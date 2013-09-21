var elements = require('evo-elements'),
    conf     = elements.Config.conf(),
    Logger   = elements.Logger;

    Connector = require('../lib/Connector');

var connector = new Connector(conf.opts, new Logger('connector:' + conf.opts.cluster, '<' + conf.opts.id + '> '));
// Hack: stub 'send' method of announcer to simulate broadcast on local machine
var oldSend = connector.announcer.send;
connector.announcer.send = function (msg, rinfo) {
    rinfo || (rinfo = { address: conf.query('test.broadcast') });
    return oldSend.call(this, msg, rinfo);
};

connector
    .on('nodes', function () {
            process.send({ event: 'refresh', data: connector.nodes.toObject() });
        })
    .on('state', function (state) {
            process.send({ event: 'state', data: { state: state } });
        })
    .on('message', function (msg, src) {
            process.send({ event: 'message', data: { src: src, msg: msg } });
        })
    .start();

process.on('message', function (msg) {
    if (msg.action == 'invoke') {
        connector[msg.method].apply(connector, msg.args);
    }
});