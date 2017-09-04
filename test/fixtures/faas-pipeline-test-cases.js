
'use strict';

const _ = require('lodash');
const assert = require('assert');
const nock = require('nock');

module.exports = [{
	id: 'failure #1',
	catch: (err) => {
		assert(err);
		assert.equal(err.message, 'Bad FaaS pipeline: control node must be an object not "undefined"');
	}
}, {
	id: 'failure #2',
	pipeline: 12345,
	catch: (err) => {
		assert(err);
		assert.equal(err.message, 'Bad FaaS pipeline: control node must be an object not "number"');
	}
}, {
	id: 'failure #3',
	pipeline: {},
	catch: (err) => {
		assert(err);
		assert.equal(err.message, 'Bad FaaS pipeline: control node must have exactly one property not ""');
	}
}, {
	id: 'failure #4',
	pipeline: {
		fn1: {}
	},
	catch: (err) => {
		assert(err);
		assert.equal(err.message, 'Bad FaaS pipeline: control node is of unknown type "fn1"');
	}
}, {
	id: 'failure #5',
	pipeline: {
		"~split": null
	},
	catch: (err) => {
		assert(err);
		assert.equal(err.message, 'Bad FaaS pipeline: split node data must be non-empty object');
	}
}, {
	id: 'failure #6',
	pipeline: {
		"~split": {}
	},
	catch: (err) => {
		assert(err);
		assert.equal(err.message, 'Bad FaaS pipeline: split node data must be non-empty object');
	}
}, {
	id: 'failure #7',
	pipeline: {
		"~pipe": 1234
	},
	catch: (err) => {
		assert(err);
		assert.equal(err.message, 'Bad FaaS pipeline: pipe node data must be a non-empty array');
	}
}, {
	id: 'failure #8',
	pipeline: {
		"~pipe": []
	},
	catch: (err) => {
		assert(err);
		assert.equal(err.message, 'Bad FaaS pipeline: pipe node data must be a non-empty array');
	}
}, {
	id: 'failure #9',
	pipeline: {
		"~pipe": [{}],
		"~split": [{}]
	},
	catch: (err) => {
		assert(err);
		assert.equal(err.message, 'Bad FaaS pipeline: control node must have exactly one property not "~pipe,~split"');
	}
}, {
	id: 'failure #10',
	pipeline: {
		test: 1234
	},
	catch: (err) => {
		assert(err);
		assert.equal(err.message, 'Bad FaaS pipeline: control node is of unknown type "test"');
	}
}, {
	id: 'failure #11',
	pipeline: {
		"~pipe": [{}],
		test: 1234
	},
	catch: (err) => {
		assert(err);
		assert.equal(err.message, 'Bad FaaS pipeline: control node must have exactly one property not "~pipe,test"');
	}
}, {
	id: 'failure #12',
	pipeline: {
		"~pipe": [{
			fn1: {},
			fn2: {}
		}]
	},
	catch: (err) => {
		assert(err);
		assert.equal(err.message, 'Bad FaaS pipeline: node must have exactly one property "fn1,fn2"');
	}
}, {
	id: 'failure #13 - function params must be an object',
	pipeline: {
		"~pipe": [{
			fn1: 'this is not an object'
		}]
	},
	catch: (err, nocks) => {
		assert(_.isEmpty(nocks));
		assert(err);
		assert.equal(err.message, 'Bad FaaS pipeline: params must be object for fn1');
	}
}, {
	id: 'success #1',
	pipeline: {
		"~pipe": [{
			fn1: {}
		}]
	},
	setupChecks: () => {
		const request1 = nock('http://fake-gateway').post('/fn1').reply(200, {result: {}});
		return [request1];
	},
	then: (result, nocks) => {
		_.each(nocks, nock => assert(nock.isDone()));
		assert(!_.isUndefined(result));
		assert(_.isEqual(result, {}));
	}
}, {
	id: 'success #2',
	pipeline: {
		"~pipe": [{
			fn1: {}
		}]
	},
	setupChecks: () => {
		const request1 = nock('http://fake-gateway').post('/fn1').reply(200, {result: {
			warnings: [{ test: 'result' }]}
		});
		return [request1];
	},
	then: (result, nocks) => {
		_.each(nocks, nock => assert(nock.isDone()));
		assert.equal(_.get(result, 'warnings[0].test'), 'result');
	}
}, {
	id: 'inexistent function in pipe #1',
	pipeline: {
		"~pipe": [{
			fn1: {}
		}, {
			'inexistent-fn': {}
		}, {
			'this-will-never-execute': {}
		}]
	},
	setupChecks: () => {
		const request1 = nock('http://fake-gateway').post('/fn1').reply(200, {result: {
			warnings: [{ test: 'result' }]}
		});
		const request2 = nock('http://fake-gateway').post('/inexistent-fn').reply(404, "Cannot find service: inexistent-fn.");
		// We don't need to add nock for this-will-never-execute as... it will never execute.
		return [request1, request2];
	},
	catch: (error, nocks) => {
		_.each(nocks, nock => assert(nock.isDone()));
		assert.equal(_.get(error, 'message'), 'Failure during pipe run: inexistent-fn failed with 404 - "Cannot find service: inexistent-fn."');
	}
}, {
	id: 'inexistent function in split #1',
	pipeline: {
		"~split": [{
			fn1: {}
		}, {
			'inexistent-fn': {}
		}, {
			fn2: {}
		}]
	},
	setupChecks: () => {
		const request1 = nock('http://fake-gateway').post('/fn1').reply(200, {result: {}});
		const request2 = nock('http://fake-gateway').post('/inexistent-fn').reply(404, "Cannot find service: inexistent-fn.");
		const request3 = nock('http://fake-gateway').post('/fn2').reply(200, {result: {}});
		// The only certainly invoked nock should be the one that fails.
		return [request2];
	},
	catch: (error, nocks) => {
		_.each(nocks, nock => assert(nock.isDone()));
		assert.equal(_.get(error, 'message'), 'Failure during split run: inexistent-fn failed with 404 - "Cannot find service: inexistent-fn."');
		// Clean all nocks as we don't want to pollute other tests.
		nock.cleanAll();
	}
}, {
	id: 'composition defect #1 fixed',
	pipeline: {
		"~pipe": [{
			fn1: {}
		}, {
			"~split": [{
				fn2: {}
			}]
		}]
	},
	payload: {
		test: 'this'
	},
	setupChecks: () => {
		const request1 = nock('http://fake-gateway').post('/fn1', {
			payload: {
				test: 'this'
			},
			params: {}
		}).reply(200, {
			result: {
				warnings: [{ test: 'result' }],
				status: {
					test: 1
				}
			}
		});
		const request2 = nock('http://fake-gateway').post('/fn2', {
			payload: {
				warnings: [{ test: 'result' }],
				status: {
					test: 1
				}
			},
			params: {}
		}).reply(200, {
			result: {
				warnings: [{ test: 'result' }, { test: 'result2' }],
				status: {
					test: 2
				}
			}
		});
		return [request1, request2];
	},
	then: (result, nocks) => {
		_.each(nocks, nock => assert(nock.isDone()));
		assert(_.isArray(result), 'result is an array');
		assert.equal(result.length, 1);
		assert.equal(_.get(result[0], 'warnings[0].test'), 'result');
		assert.equal(_.get(result[0], 'warnings[1].test'), 'result2');
		assert.equal(_.get(result[0], 'status.test'), 2);
	}
}, {
	id: 'composition test #1',
	pipeline: {
		"~split": [{
			fn1: {}
		}, {
			"~pipe": [{
				fn2: {}
			}]
		}]
	},
	payload: {
		test: 'this'
	},
	setupChecks: () => {
		const request1 = nock('http://fake-gateway').post('/fn1', {
			payload: {
				test: 'this'
			},
			params: {}
		}).reply(200, {
			result: {
				warnings: [{ test: 'result' }],
				status: {
					test: 1
				}
			}
		});
		const request2 = nock('http://fake-gateway').post('/fn2', {
			payload: {
				test: 'this'
			},
			params: {}
		}).reply(200, {
			result: {
				warnings: [{ test: 'result' }, { test: 'result2' }],
				status: {
					test: 2
				}
			}
		});
		return [request1, request2];
	},
	then: (result) => {
		assert(_.isArray(result), 'result is an array');
		assert.equal(result.length, 2);
		assert.equal(_.get(result[0], 'status.test'), 1);
		assert.equal(_.get(result[1], 'status.test'), 2);
	}
}, {
	id: 'coverage #1 - cover isNil for function params',
	pipeline: {
		"~pipe": [{
			fn1: null
		}]
	},
	setupChecks: () => {
		const request1 = nock('http://fake-gateway').post('/fn1').reply(200, {result: {}});
		return [request1];
	},
	then: (result, nocks) => {
		_.each(nocks, nock => assert(nock.isDone()));
		assert(!_.isUndefined(result));
		assert(_.isEqual(result, {}));
	}
}, {
	id: 'coverage #2 - cover complex pipe run failure',
	pipeline: {
		"~pipe": [{
			fn1: {}
		}, {
			"~split": [{
				'inexistent-fn': {}
			}]
		}]
	},
	setupChecks: () => {
		const request1 = nock('http://fake-gateway').post('/fn1').reply(200, {result: {
			warnings: [{ test: 'result' }]}
		});
		const request2 = nock('http://fake-gateway').post('/inexistent-fn').reply(404, "Cannot find service: inexistent-fn.");
		// We don't need to add nock for this-will-never-execute as... it will never execute.
		return [request1, request2];
	},
	catch: (error, nocks) => {
		_.each(nocks, nock => assert(nock.isDone()));
		assert.equal(_.get(error, 'message'), 'Failure during complex pipe run: Failure during split run: inexistent-fn failed with 404 - "Cannot find service: inexistent-fn."');
	}
}, {
	id: 'coverage #3 - cover complex split run failure',
	pipeline: {
		"~split": [{
			fn1: {}
		}, {
			"~pipe": [{
				'inexistent-fn': {}
			}]
		}]
	},
	setupChecks: () => {
		const request1 = nock('http://fake-gateway').post('/fn1').reply(200, {result: {
			warnings: [{ test: 'result' }]}
		});
		const request2 = nock('http://fake-gateway').post('/inexistent-fn').reply(404, "Cannot find service: inexistent-fn.");
		// We don't need to add nock for this-will-never-execute as... it will never execute.
		return [request1, request2];
	},
	catch: (error, nocks) => {
		_.each(nocks, nock => assert(nock.isDone()));
		assert.equal(_.get(error, 'message'), 'Failure during complex split run: Failure during pipe run: inexistent-fn failed with 404 - "Cannot find service: inexistent-fn."');
	}
}, {
	id: 'coverage - bad body returned',
	pipeline: {
		"~pipe": [{
			fn1: {}
		}]
	},
	setupChecks: () => {
		const request1 = nock('http://fake-gateway').post('/fn1').reply(200);
		return [request1];
	},
	catch: (error, nocks) => {
		_.each(nocks, nock => assert(nock.isDone()));
		assert.equal(_.get(error, 'message'), 'Failure during pipe run: fn1 failed with Failed FaaS pipeline contract: function fn1 didn\'t return JSON');
	}
}, {
	id: 'coverage - bad body returned #2',
	pipeline: {
		"~pipe": [{
			fn1: {}
		}]
	},
	setupChecks: () => {
		const request1 = nock('http://fake-gateway').post('/fn1').reply(200, {});
		return [request1];
	},
	catch: (error, nocks) => {
		_.each(nocks, nock => assert(nock.isDone()));
		assert.equal(_.get(error, 'message'), 'Failure during pipe run: fn1 failed with Failed FaaS pipeline contract: function fn1 didn\'t return either result or error');
	}
}, {
	id: 'coverage - error returned',
	pipeline: {
		"~pipe": [{
			fn1: {}
		}]
	},
	setupChecks: () => {
		const request1 = nock('http://fake-gateway').post('/fn1').reply(200, {error: 'yet another error'});
		return [request1];
	},
	catch: (error, nocks) => {
		_.each(nocks, nock => assert(nock.isDone()));
		assert.equal(_.get(error, 'message'), 'Failure during pipe run: fn1 failed with yet another error');
	}
}];
