var assert = require('assert'),
    async  = require('async'),
    Class  = require('js-class'),
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
                        var master = cluster.master;
                        assert.ok(master);
                        cluster.log('TEST MASTER NODES %j', master.nodes);
                        for (var i = 0; i < count; i ++) {
                            if (i != master.id) {
                                assert.ok(master.nodes[i]);
                            }
                        }
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

    var TIMEOUT = 5000;

    describe('Small cluster', function () {
        var NODES = 16;

        it('connect', function (done) {
            this.timeout(TIMEOUT);
            startClusterAndWait(NODES, this.test.title, done);
        });

        it('elect master', function (done) {
            this.timeout(TIMEOUT);
            var masterId;
            async.series([
                function (next) {
                    startClusterAndWait(NODES, this.test.title, next);
                }.bind(this),
                function (next) {
                    masterId = cluster.masterIndex;
                    cluster.log('TEST STOP %s', masterId);
                    Try.tries(function () {
                        assert.ok(masterId >= 0);
                    }, next);
                    cluster.master.stop(function () { setTimeout(next, 500); });
                },
                function (next) {
                    waitClusterReady({ excludes: [masterId] }, next);
                }
            ], done);
        });

        it('send message', function (done) {
            this.timeout(TIMEOUT);
            async.series([
                function (next) {
                    startClusterAndWait(NODES, this.test.title, next);
                }.bind(this),
                function (next) {
                    cluster.log('TEST SEND MESSAGE from node 0');
                    var recvs = {};
                    cluster.on('message', function (msg, src, connector) {
                        if (msg.event == 'test' && connector.id != 0) {
                            cluster.log('RECV[%s]: %j', connector.id, msg);
                            Try.tries(function () {
                                assert.equal(msg.data.val, 'hello');
                                recvs[connector.id] = true;
                            }, next);
                            if (Object.keys(recvs).length == NODES - 1) {
                                cluster.removeAllListeners();
                                next();
                            }
                        }
                    });
                    cluster.connectors[0].invoke('send', { event: 'test', data: { val: 'hello' } });
                },
                function (next) {
                    cluster.log('TEST SEND MESSAGE from master');
                    var recvs = {}, masterId = cluster.masterIndex;
                    cluster.on('message', function (msg, src, connector) {
                        if (msg.event == 'test1' && connector.id != masterId) {
                            cluster.log('RECV[%s]: %j', connector.id, msg);
                            Try.tries(function () {
                                assert.equal(msg.data.val, 'hello');
                                recvs[connector.id] = true;
                            }, next);
                            if (Object.keys(recvs).length == NODES - 1) {
                                next();
                            }
                        }
                    });
                    cluster.connectors[masterId].invoke('send', { event: 'test1', data: { val: 'hello' } });
                }
            ], done);
        });

        var StatesValidator = Class({
            constructor: function (sourceId, done) {
                this.sourceId = sourceId;
                this.done = done;
                this.readiness = {};
            },

            start: function () {
                this.timer = setInterval(this.validate.bind(this), 100);
            },

            validate: function () {
                for (var id = 0; id < NODES; id ++) {
                    if (id != this.sourceId) {
                        var source = cluster.connectors[id].nodes[this.sourceId];
                        source && source.states.actual && source.states.actual.key == 'val' && (this.readiness[id] = true);
                    }
                }
                cluster.log('TEST READINESS: %j', Object.keys(this.readiness));
                Object.keys(this.readiness).length == NODES - 1 && this.succeed();
            },

            succeed: function () {
                this.timer && clearInterval(this.timer);
                delete this.timer;
                cluster.removeAllListeners();
                var fn = this.done;
                fn();
            }
        });

        it('local states on master', function (done) {
            this.timeout(TIMEOUT);
            var masterId, master;
            async.series([
                function (next) {
                    startClusterAndWait(NODES, this.test.title, next);
                }.bind(this),
                function (next) {
                    master = cluster.master;
                    Try.final(function () {
                        assert.ok(master);
                        masterId = master.id;
                    }, next);
                },
                function (next) {
                    var validator = new StatesValidator(masterId, next);
                    cluster.on('update', function (msg, connector) {
                        cluster.log('TEST UPDATE [%d]: %j', connector.id, msg);
                        msg.event == 'refresh' && validator.validate();
                    });
                    cluster.log('TEST VALIDATION START');
                    master.invoke('updateLocalStates', { key: 'val' });
                    validator.start();
                }
            ], done);
        });

        it('local states on member', function (done) {
            this.timeout(TIMEOUT);
            async.series([
                function (next) {
                    startClusterAndWait(NODES, this.test.title, next);
                }.bind(this),
                function (next) {
                    var memberId = cluster.masterIndex == 0 ? 1 : 0;
                    var validator = new StatesValidator(memberId, next);
                    cluster.on('update', function (msg, connector) {
                        cluster.log('TEST UPDATE [%d]: %j', connector.id, msg);
                        msg.event == 'refresh' && validator.validate();
                    });
                    cluster.connectors[memberId].invoke('updateLocalStates', { key: 'val' });
                    validator.start();
                }
            ], done);
        });

        it('set expectations', function (done) {
            this.timeout(TIMEOUT);
            var expectations = {
                key: {
                    revision: 2,
                    nodes: {
                        1: 'val',
                        4: 'val'
                    }
                }
            };
            var master;
            async.series([
                function (next) {
                    startClusterAndWait(NODES, this.test.title, next);
                }.bind(this),
                function (next) {
                    master = cluster.master;
                    Try.final(function () {
                        assert.ok(master);
                    }, next);
                },
                function (next) {
                    var validator = new StatesValidator(0, next);
                    validator.validate = function () {
                        var updated = true;
                        for (var n = 0; n < NODES; n ++) {
                            var connector = cluster.connectors[n];
                            for (var id in expectations.key.nodes) {
                                var node = connector.nodes[id];
                                if (!node || !node.states ||
                                    !node.states.expect ||
                                    node.states.expect.key != expectations.key.nodes[id]) {
                                    updated = false;
                                    break;
                                }
                            }
                            if (updated) {
                                this.readiness[connector.id] = true;
                            } else {
                                delete this.readiness[connector.id];
                            }
                        }
                        cluster.log('TEST READINESS: %j', Object.keys(this.readiness));
                        Object.keys(this.readiness).length == NODES && this.succeed();
                    };
                    cluster.on('update', function (msg, connector) {
                        if (msg.event == 'refresh') {
                            cluster.log('TEST UPDATE [%d]: %j', connector.id, msg);
                            validator.validate();
                        }
                    });
                    cluster.log('TEST VALIDATION START');
                    master.invoke('setExpectations', expectations);
                    validator.start();
                }
            ], done);
        });
    });
});