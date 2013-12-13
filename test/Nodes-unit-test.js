var assert = require('assert'),

    Nodes = require('../lib/Nodes');

describe('Nodes', function () {
    it('#localNode', function () {
        var nodes = new Nodes(100);
        assert.equal(nodes.local.id, 100);
        assert.equal(nodes.id, 100);
        nodes.configure('127.0.0.1', 1234);
        assert.equal(nodes.local.address, '127.0.0.1');
        assert.equal(nodes.local.port, 1234);
        assert.equal(nodes.address, '127.0.0.1');
        assert.equal(nodes.port, 1234);
    });

    it('#masterId', function () {
        var nodes = new Nodes(100);
        assert.equal(nodes.revision, 0);
        nodes.masterId = 10;
        assert.equal(nodes.masterId, 10);
        assert.equal(nodes.revision, 1);
    });

    it('#expectations', function () {
        var nodes = new Nodes(100);
        assert.equal(nodes.revision, 0);
        nodes.expectations = { key: { revision: 1, nodes: { 1: 'val' } } };
        assert.equal(nodes.revision, 1);
    });

    describe('Master state', function () {
        it('#topology', function () {
            var nodes = new Nodes(0);
            nodes.configure('127.0.0.1', 1234);
            nodes.masterId = 0;
            nodes.refresh(1, '127.0.0.2', 1234, {
                revision: 1,
                actual: {
                    key: 'val'
                },
                expect: {
                    key: 'val1'
                }
            });
            nodes.expectations = {
                key: {
                    revision: 2,
                    nodes: {
                        1: 'val0'
                    }
                }
            };

            var topo = nodes.topology;
            assert.equal(topo.master, 0);
            assert.equal(topo.nodes.length, 2);
            assert.deepEqual(topo.nodes[0], {
                id: 0,
                address: '127.0.0.1',
                port: 1234,
                states: {
                    revision: 0,
                    expect: undefined
                }
            });
            assert.deepEqual(topo.nodes[1], {
                id: 1,
                address: '127.0.0.2',
                port: 1234,
                states: {
                    revision: 1,
                    actual: {
                        key: 'val'
                    },
                    expect: {
                        key: 'val0'
                    }
                }
            });
        });

        it('#retire', function () {
            var nodes = new Nodes(10);
            nodes.configure('127.0.0.10', 1234);
            nodes.masterId = 10;
            nodes.refresh(11, '127.0.0.11', 1234, { revision: 10, actual: { k: 'v' }, expect: { k: 1 } });
            assert.ok(nodes.nodes[11]);
            assert.equal(nodes.nodes[11].active, 1);
            nodes.retire();
            assert.equal(nodes.nodes[11].active, 0);
            nodes.retire();
            assert.ok(nodes.nodes[11] == null);
        });
    });

    describe('Member state', function () {
        it('#toObject', function () {
            var nodes = new Nodes(1);
            nodes.configure('127.0.0.1', 1234);
            nodes.local.updateStates({ key: 'value0' });
            nodes.reload({
                revision: 1,
                master: 0,
                nodes: [
                    {
                        id: 0,
                        address: '127.0.0.1',
                        port: 1234,
                        states: {
                            revision: 2,
                            actual: {
                                key: 'val',
                            },
                            expect: {
                                key: 'val1',
                            }
                        }
                    },
                    {
                        id: 1,
                        address: '127.0.0.2',
                        port: 1234,
                        states: {
                            revision: 3,
                            actual: {
                                key: 'val1'
                            },
                            expect: {
                                name: 'value'
                            }
                        }
                    }
                ]
            });

            var obj = nodes.toObject();
            assert.equal(obj.revision, 1);
            assert.equal(obj.master, 0);
            assert.equal(obj.nodes.length, 2);
            assert.deepEqual(obj.nodes[0], {
                id: 1,
                address: '127.0.0.1',
                port: 1234,
                states: {
                    revision: 1,
                    actual: {
                        key: 'value0'
                    },
                    expect: {
                        name: 'value'
                    }
                }
            });
            assert.deepEqual(obj.nodes[1], {
                id: 0,
                address: '127.0.0.1',
                port: 1234,
                states: {
                    revision: 2,
                    actual: {
                        key: 'val'
                    },
                    expect: {
                        key: 'val1'
                    }
                }
            });
        });
    });
});
