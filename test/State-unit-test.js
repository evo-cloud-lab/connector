var assert = require('assert'),
    Class  = require('js-class'),

    State = require('../lib/State.js');

describe('State', function () {
    var StubConnector = Class({
        constructor: function () {
            this.logger = {
                debug: function () { }
            };
        }
    });

    it('#process method invocation', function () {
        var s = new State({}, {});
        var args;
        s.onMyEvent = function () {
            args = [].slice.call(arguments, 0);
        };
        s.process({}, 'myEvent', 'a', 1, 'b', false);
        assert.deepEqual(args, ['a', 1, 'b', false]);
    });

    it('#onMessage dispatch', function () {
        var s = new State(new StubConnector(), 'MASTER');
        var msg = {
            event: 'sync',
            data: {
                id: 'id',
                revision: 100,
                states: {
                    revision: 1
                }
            }
        }, recv;
        s['msg:sync'] = function (msg, link, origin) {
            recv = { msg: msg, origin: origin };
        };
        s.process({}, 'message', msg, { send: function () { assert.ok(false, 'Should not reach here'); } });
        assert.ok(recv);
        assert.strictEqual(recv.origin, msg);
        assert.equal(recv.msg.event, msg.event);
        assert.equal(recv.msg.data.id, msg.data.id);
        assert.equal(recv.msg.data.revision, msg.data.revision);
        assert.equal(recv.msg.data.states.revision, msg.data.states.revision);
        assert.equal(recv.msg.data.states.actual, null);
        assert.equal(recv.msg.data.states.expect, null);
    });

    it('#onMessage parse failure', function () {
        var s = new State(new StubConnector(), 'MASTER');
        s['msg:sync'] = function () {
            assert.ok(false, 'Should not reach here');
        };
        var err;
        s.process({}, 'message', { event: 'sync' }, { send: function (msg) { err = msg; } });
        assert.ok(err);
        assert.equal(err.event, 'error');
    });

    it('#onMessage event not defined', function () {
        var connector = new StubConnector();
        var recv;
        connector._message = function (msg) {
            recv = msg;
        };
        var s = new State(connector, 'MASTER');
        var msg = {
            event: 'sync',
            data: {
                id: 'id',
                revision: 100,
                states: {
                    revision: 1
                }
            }
        }, recv;
        s.process({}, 'message', msg, { send: function () { assert.ok(false, 'Should not reach here'); } });
        assert.ok(recv);
    });

    it('handle connection', function () {
        var s = new State({}, {}), link = {}, arg;
        s.onConnection = function (l) {
            arg = l;
            return null;
        };
        s.process({}, 'connection', link);
        assert.strictEqual(link, arg);
    });

    it('handle connection error', function () {
        var s = new State({}, {}), sent, err = new Error('test');
        var link = Object.create({
            send: function (msg) {
                sent = msg;
            },
            disconnect: function () { }
        });
        s.onConnection = function () { return err; }
        s.process({}, 'connection', link);
        assert.equal(sent.event, 'error');
        assert.equal(sent.data.message, 'test');
    });

    it('handle connection without onConnection', function () {
        var s = new State({}, {}), sent;
        var link = Object.create({
            send: function (msg) {
                sent = msg;
            },
            disconnect: function () { }
        });
        s.process({}, 'connection', link);
        assert.equal(sent.event, 'error');
    });
});
