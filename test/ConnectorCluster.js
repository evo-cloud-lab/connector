var Class = require('js-class'),
    path  = require('path'),
    fs    = require('fs'),
    spawn = require('child_process').spawn,
    util  = require('util'),
    dgram = require('dgram'),
    async = require('async');

var ConnectorStub = Class(process.EventEmitter, {
    constructor: function (id, port, cluster) {
        this.id = id;
        this._port = port;
        this._cluster = cluster;
    },
    
    get running () {
        return !!this.agent;
    },

    start: function () {
        this._socket = dgram.createSocket('udp4');
        this._socket.bind(this._port, '127.0.0.2');
        this._socket.on('message', this.onBroadcast.bind(this));

        var args = [
            path.join(__dirname, 'ConnectorAgent.js'),
            '--id=' + this.id,
            '--cluster=' + this._cluster,
            '--port=' + this._port,
            '--address=127.0.0.1',
            '--broadcast=127.0.0.2',
            '--announceIntervals=[100,100,100,100,200,200,200]',
            '--identityTimeout=100',
            '--communicateTimeout=600',
            '--membershipTimeout=300',
            '--synapse-reconnectDelay=10',
            '--synapse-reconnectMax=1',
            '--logger-options-level=' + (process.env.LOGLEVEL || 'debug'),
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
    
    send: function (msg) {
        if (this._socket) {
            this._socket.send(msg, 0, msg.length, this._port, '127.0.0.1');
        }
        return this;
    },
    
    onBroadcast: function (msg) {
        this.emit('broadcast', msg, this);
    },
    
    onMessage: function (msg) {
        switch (msg.event) {
            case 'state':
                this.state = msg.data.state;
                break;
            case 'refresh':
                this.masterId = msg.data.master;
                this.revision = msg.data.revision;
                this.nodes = {};
                msg.data.nodes.forEach(function (node) {
                    this.nodes[node.id] = node;
                }, this);
                break;
        }
        this.emit('update', msg, this);
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
    constructor: function (basePort, cluster) {
        this.basePort = basePort || 11100;
        this.cluster = cluster || 'test';
        this.connectors = [];
    },
    
    start: function (count, message) {
        if (process.env.LOGFILE) {
            this._logfd = fs.openSync(path.join(__dirname, '..', process.env.LOGFILE), 'a');
        } else if (process.env.CI) {
            this._logfd = 1;    // on CI, dump logs to stdout
        }            
        message && this.log('START CLUSTER %d nodes: %s', count, message);

        
        this.connectors = [];
        for (var i = 0; i < count; i ++) {
            var connector = new ConnectorStub(i, this.basePort + i, this.cluster);
            connector
                .on('broadcast', this.onBroadcast.bind(this))
                .on('update', this.onUpdate.bind(this))
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
    
    onBroadcast: function (msg, connector) {
        this.connectors.forEach(function (c) {
            c.id != connector.id && c.send(msg);
        });
    },
    
    onUpdate: function (msg, connector) {
        this.emit('update', msg, connector);
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