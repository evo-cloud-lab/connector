var Class = require('js-class'),
    path  = require('path'),
    fs    = require('fs'),
    spawn = require('child_process').spawn,
    util  = require('util'),
    dgram = require('dgram'),
    async = require('async');

var ConnectorStub = Class(process.EventEmitter, {
    constructor: function (id, addrIndex, cluster) {
        this.id = id;
        this._addrIndex = addrIndex + 1;
        this._cluster = cluster;
    },

    get running () {
        return !!this.agent;
    },

    start: function () {
        var args = [
            path.join(__dirname, 'ConnectorAgent.js'),
            '--id=' + this.id,
            '--cluster=' + this._cluster,
            '--port=' + (12710 + this._addrIndex),
            '--address=0.0.0.0',
            '--broadcast=224.1.0.0:22410',
            '--announceIntervals=[100,100,100,100,200,200,200]',
            '--identityTimeout=100',
            '--communicateTimeout=600',
            '--membershipTimeout=300',
            '--synapse-reconnectDelay=10',
            '--synapse-reconnectMax=1',
            '--logger-level=' + (process.env.LOGLEVEL || 'debug'),
            '--logger-options-colorize=false',
            '--logger-options-timestamp=true'
        ];

        (this.agent = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }))
            .on('message', this.onMessage.bind(this))
            .on('exit', this.onExit.bind(this));
        this.agent.stdout.on('data', this.onOutputData.bind(this));
        this.agent.stderr.on('data', this.onOutputData.bind(this));
        return this;
    },

    stop: function (callback) {
        if (this.agent) {
            this.agent.once('exit', callback).kill();
        } else {
            process.nextTick(callback);
        }
        return this;
    },

    invoke: function (method) {
        if (this.agent) {
            this.agent.send({ action: 'invoke', method: method, args: [].slice.call(arguments, 1) });
        }
    },

    onMessage: function (msg) {
        switch (msg.event) {
            case 'state':
                this.state = msg.data.state;
                this.emit('update', msg, this);
                break;
            case 'refresh':
                this.masterId = msg.data.master;
                this.revision = msg.data.revision;
                this.nodes = {};
                msg.data.nodes.forEach(function (node) {
                    this.nodes[node.id] = node;
                }, this);
                this.emit('update', msg, this);
                break;
            case 'message':
                this.emit('message', msg.data.msg, msg.data.src, this);
                break;
        }
    },

    onExit: function (code, signal) {
        delete this.agent;
        if (this._socket) {
            this._socket.close();
            delete this._socket;
        }
        delete this.state;
        delete this.nodes;
        delete this.masterId;
        delete this.revision;
        this.emit('exit', code, signal, this);
    },

    onOutputData: function (data) {
        this.emit('output', data);
    }
});

var ConnectorCluster = Class(process.EventEmitter, {
    constructor: function (cluster) {
        this.cluster = cluster || 'test';
        this.connectors = [];
    },

    start: function (count, message) {
        if (process.env.LOGFILE) {
            this._logfd = fs.openSync(process.env.LOGFILE, 'a');
        } else if (process.env.CI) {
            this._logfd = 1;    // on CI, dump logs to stdout
        }
        message && this.log('START CLUSTER %d nodes: %s', count, message);


        this.connectors = [];
        for (var i = 0; i < count; i ++) {
            var connector = new ConnectorStub(i, i, this.cluster);
            connector
                .on('update', this.onUpdate.bind(this))
                .on('message', this.onMessage.bind(this))
                .on('exit', this.onExit.bind(this))
                .on('output', this.onOutput.bind(this));
            this.connectors.push(connector);
        }
        this.connectors.forEach(function (connector) {
            connector.start();
        });
        return this;
    },

    stop: function (callback) {
        async.each(this.connectors, function (connector, next) {
            connector.stop(function () { next(); });
        }, function () {
            if (this._logfd > 2) {
                fs.closeSync(this._logfd);
                delete this._logfd;
            }
            callback && callback();
        }.bind(this));
        return this;
    },

    log: function () {
        if (this._logfd) {
            var buf = new Buffer(util.format.apply(util, arguments) + '\n');
            fs.writeSync(this._logfd, buf, 0, buf.length);
        }
    },

    get masterIndex () {
        var masterId;
        this.connectors.some(function (connector, index) {
            if (connector.state == 'master') {
                masterId = index;
                return true;
            }
            return false;
        });
        return masterId;
    },

    get master () {
        var index = this.masterIndex;
        return index >= 0 ? this.connectors[index] : null;
    },

    onUpdate: function (msg, connector) {
        this.emit('update', msg, connector);
    },

    onMessage: function (msg, src, connector) {
        this.emit('message', msg, src, connector);
    },

    onExit: function (code, signal, connector) {
        this.emit('exit', code, signal, connector);
    },

    onOutput: function (data) {
        if (this._logfd) {
            var buf = new Buffer(data);
            fs.writeSync(this._logfd, buf, 0, buf.length);
        }
    }
});

module.exports = ConnectorCluster;
