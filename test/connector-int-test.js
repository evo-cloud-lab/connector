var assert = require('assert'),
    flow   = require('js-flow'),
    tubes  = require('evo-tubes');

describe('evo-connector', function () {
    var sandbox;

    beforeEach(function (done) {
        (sandbox = new tubes.Sandbox())
            .add(new tubes.Environment())
            .add(new tubes.NeuronFactory())
            .add(new tubes.Connector({ instances: 16 }))
            .start(done);
    });

    afterEach(function (done) {
        sandbox.cleanup(done);
    });

    var TIMEOUT = 60000;

    it('connect together', function (done) {
        this.timeout(TIMEOUT);
        flow.steps()
            .next('ensureReady')
            .with(sandbox.res('connector'))
            .run(done);
    });

    it('cluster state', function (done) {
        this.timeout(TIMEOUT);
        flow.steps()
            .next('ensureReady')
            .next(function (next) {
                var clients = this.clients;
                var masterIndex = this.masterIndex;
                flow.final(function () {
                    for (var i in clients) {
                        assert.ok(clients[i].clusterInfo);
                        if (i == masterIndex) {
                            assert.equal(clients[i].nodeState, 'master');
                        } else {
                            assert.equal(clients[i].nodeState, 'member');
                        }
                    }
                }, next);
            })
            .with(sandbox.res('connector'))
            .run(done);
    });

    it('elect master', function (done) {
        this.timeout(TIMEOUT);
        flow.steps()
            .next('ensureReady')
            .next('shutdownMaster')
            .next('untilUnstable')
            .next('ensureReady')
            .with(sandbox.res('connector'))
            .run(done);
    });

    it('master down and come back', function (done) {
        this.timeout(TIMEOUT);
        var oldMaster, newMaster;
        flow.steps()
            .next('ensureReady')
            .next(function (next) {
                oldMaster = this.masterIndex;
                next();
            })
            .next('shutdownMaster')
            .next('untilUnstable')
            .next('ensureReady')
            .next(function (next) {
                newMaster = this.masterIndex;
                this.respawn(oldMaster, next);
            })
            .next('ensureReady')
            .next(function (next) {
                var masterIndex = this.masterIndex;
                flow.final(function () {
                    assert.equal(masterIndex, newMaster);
                }, next);
            })
            .with(sandbox.res('connector'))
            .run(done);
    });

    it('broadcast message', function (done) {
        this.timeout(TIMEOUT);
        var msgs = {}, sender, clients;
        flow.steps()
            .next('ensureReady')
            .next(function (next) {
                clients = this.clients;
                sender = this.masterIndex == 0 ? 1 : 0;
                for (var i in clients) {
                    (function (index) {
                        clients[index].on('message', function (msg, src) {
                            msgs[index] || (msgs[index] = []);
                            msgs[index].push({ msg: msg, src: src });
                        });
                    })(i);
                }
                clients[sender].send({ event: 'test', data: { } }, next);
            })
            .next(function (next) {
                tubes.Toolbox.until(function (done) {
                    done(Object.keys(msgs).length == clients.length - 1);
                }, next);
            })
            .next(function (next) {
                flow.final(function () {
                    assert.equal(msgs[sender], null);
                    for (var i in msgs) {
                        assert.equal(msgs[i].length, 1);
                        assert.equal(msgs[i][0].msg.event, 'test');
                        assert.equal(msgs[i][0].src, clients[sender].localId);
                    }
                }, next);
            })
            .with(sandbox.res('connector'))
            .run(done);
    });

    it('send to master', function (done) {
        this.timeout(TIMEOUT);
        var recv, senderId;
        flow.steps()
            .next('ensureReady')
            .next(function (next) {
                var sender = this.clients[this.masterIndex == 0 ? 1 : 0];
                this.master.on('message', function (msg, src) {
                    recv = { msg: msg, src: src };
                    next();
                });
                senderId = sender.localId;
                sender.send({ event: 'test', data: { } }, 'master');
            })
            .next(function (next) {
                flow.final(function () {
                    assert.deepEqual(recv, {
                        msg: { event: 'test', data: {} },
                        src: senderId
                    });
                }, next);
            })
            .with(sandbox.res('connector'))
            .run(done);
    });

    it('send to peers', function (done) {
        this.timeout(TIMEOUT);
        var COUNT = 3;
        var recv = [], peers = [];
        flow.steps()
            .next('ensureReady')
            .next(function (next) {
                for (var i in this.clients) {
                    if (i != this.masterIndex) {
                        peers.push(this.clients[i]);
                        if (peers.length == COUNT + 1) {
                            break;
                        }
                    }
                }
                var ids = [];
                for (var i = 0; i < COUNT; i ++) {
                    (function (index) {
                        peers[index + 1].on('message', function (msg, src) {
                            recv[index] = { msg: msg, src: src };
                            if (recv.length == COUNT) {
                                next();
                            }
                        });
                    })(i);
                    ids.push(peers[i + 1].localId);
                }
                peers[0].send({ event: 'test', data: { } }, ids);
            })
            .next(function (next) {
                flow.final(function () {
                    assert.deepEqual(recv, [
                        {
                            msg: { event: 'test', data: {} },
                            src: peers[0].localId
                        },
                        {
                            msg: { event: 'test', data: {} },
                            src: peers[0].localId
                        },
                        {
                            msg: { event: 'test', data: {} },
                            src: peers[0].localId
                        }
                    ]);
                }, next);
            })
            .with(sandbox.res('connector'))
            .run(done);
    });

    it('remote request', function (done) {
        this.timeout(TIMEOUT);
        var recv, peers = [];
        flow.steps()
            .next('ensureReady')
            .next(function (next) {
                for (var i in this.clients) {
                    if (i != this.masterIndex) {
                        peers.push(this.clients[i]);
                        if (peers.length == 2) {
                            break;
                        }
                    }
                }
                peers[1].on('request', function (req) {
                    req.ok({ key: 1234 });
                });
                peers[0].remoteRequest({ event: 'test', data: {} }, peers[1].localId, function (err, result) {
                    recv = result;
                    next(err);
                });
            })
            .next(function (next) {
                flow.final(function () {
                    assert.deepEqual(recv, { key: 1234 });
                }, next);
            })
            .with(sandbox.res('connector'))
            .run(done);
    });
});
