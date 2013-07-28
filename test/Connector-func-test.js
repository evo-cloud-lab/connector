var assert = require('assert'),
    async  = require('async'),
    Try    = require('evo-elements').Try,

    ConnectorCluster = require('./ConnectorCluster');

describe('Connector', function () {
    var cluster;
    
    function startCluster(size, message) {
        return (cluster = new ConnectorCluster()).start(size, message);
    }

    function waitClusterReady(options, callback) {
        if (typeof(options) == 'function') {
            callback = options;
            options = {};
        }
        var count = cluster.connectors.length;
        var states = [], excludes = options.excludes || [];
        for (var i = 0; i < count; i ++) {
            var connector = cluster.connectors[i];
            states[connector.id] = connector.state;
        }

        cluster
            .on('update', function (msg, connector) {
                states[connector.id] = connector.state;
                var masterCount = 0;
                for (var i = 0; i < count; i ++) {
                    if (excludes.indexOf(i) >= 0) {
                        continue;
                    }
                    if (states[i] == 'master') {
                        masterCount ++;
                    } else if (states[i] != 'member') {
                        break;
                    }
                }
                cluster.log('TEST CLUSTER %d/%d %j %j', masterCount, i, excludes, states);
                if (i >= count) {
                    Try.final(function () {
                        assert.equal(masterCount, 1);
                        cluster.removeAllListeners();
                    }, callback); 
                }
            })
            .on('exit', function (code, signal, connector) {
                if (excludes.indexOf(connector.id) < 0) {
                    cluster.removeAllListeners();
                    callback(new Error('Connector ' + connector.id + ' exited: ' + code + ', ' + signal));
                }
            });
        return cluster;
    }
    
    function startClusterAndWait(count, message, callback) {
        startCluster(count, message);
        waitClusterReady(callback);
        return cluster;
    }
    
    afterEach(function (done) {
        if (cluster) {
            cluster.removeAllListeners();
            cluster.stop(done);
            cluster = undefined;
        }
    });

    describe('Small cluster', function () {
        var NODES = 16;
        
        it('connect', function (done) {
            startClusterAndWait(NODES, this.test.title, done);
        });
        
        it('elect master', function (done) {
            this.timeout(3000);
            var masterId;
            async.series([
                function (next) {
                    startClusterAndWait(NODES, this.test.title, next);
                }.bind(this),
                function (next) {
                    for (var i = 0; i < cluster.connectors.length; i ++) {
                        if (cluster.connectors[i].state == 'master') {
                            masterId = i;
                            break;
                        }
                    }
                    cluster.log('TEST STOP %s', masterId);
                    Try.tries(function () {
                        assert.ok(masterId >= 0);
                    }, next);
                    cluster.connectors[masterId].stop(function () { setTimeout(next, 500); });
                },
                function (next) {
                    waitClusterReady({ excludes: [masterId] }, next);
                }
            ], done);
        });
    });
});