
'use strict';

/* global describe, it, before, after, afterEach */

//  To set some properties we need `this` of `describe` and `it` callback functions.
// lazy ignore prefer-arrow-callback func-names no-console

const td = require('testdouble');

const _ = require('lodash');
const FaasPipeline = require('../lib/faas-pipeline');
const testCases = require('./fixtures/faas-pipeline-test-cases');
const assert = require('assert');
const nock = require('nock');

const resolveIfUndefined = result => (_.isUndefined(result) ? Promise.resolve() : result);

describe('FaasPipeline', function () {
	afterEach(() => {
		td.reset();
	});

	describe('run', function () {
		let testsToRun = _.filter(testCases, 'only');
		if (_.isEmpty(testsToRun)) {
			testsToRun = testCases;
		}
		_.forEach(testsToRun, (test) => {
			it(test.id, function () {
				if (!_.isFunction(test.then) && !_.isFunction(test.catch)) {
					throw new Error(`Bad test configuration at '${test.id}'`);
				}

				const checks = _.isFunction(test.setupChecks) ? test.setupChecks() : [];

				const pipeline = new FaasPipeline('http://fake-gateway', test.pipeline);

				const params = test.params || {};
				return pipeline.run(test.payload)
					.then((result) => {
						if (test.then) {
							try {
								return resolveIfUndefined(test.then(result, checks))
									.catch((err) => {
										console.error(`Bad test '${test.id}' checks`, err);
										return Promise.reject(new Error(`Bad test '${test.id}' checks: ${err}`));
									});
							} catch (err) {
								console.error(`Bad test '${test.id}' checks`, err);
								return Promise.reject(new Error(`Bad test '${test.id}' checks: ${err}`));
							}
						}

						console.error(`Bad test '${test.id}' succeeded with`, result);
						return Promise.reject(new Error(`Test '${test.id}' is testing for failure`));
					})
					.catch((err) => {
						if (test.catch) {
							try {
								return resolveIfUndefined(test.catch(err, checks))
								.catch((err2) => {
									console.error(`Bad test '${test.id}' checks`, err2);
									return Promise.reject(new Error(`Bad test '${test.id}' checks: ${err2}`));
								});
							} catch (err3) {
								console.error(`Bad test '${test.id}' checks`, err3);
								return Promise.reject(new Error(`Bad test '${test.id}' checks: ${err3}`));
							}
						}

						console.error('Bad test failed with', err);
						return Promise.reject(new Error(`Test '${test.id}' is testing for success, not ${err}`));
					});
				});
			});

			it('metrics are emitted', function () {
				const pipeline = new FaasPipeline('http://fake-gateway', {
					"~pipe": [{
						fn1: {}
					}]
				});
				const request1 = nock('http://fake-gateway').post('/fn1').reply(200, {
					result: {
						test: 'metrics'
					},
					metrics: [
						{metric: 1},
						{metric: 2}
					]});
				const capturedMetrics = [];
				pipeline.on('metrics', (metrics) => {
					console.log('okay...');
					capturedMetrics.push(metrics);
				});
				return pipeline.run({})
					.then((result) => {
						assert(result.test, 'metrics');
						assert(_.isArray(capturedMetrics));
						assert.equal(_.size(capturedMetrics), 1);
						const metrics = _.head(capturedMetrics);
						assert(_.isArray(metrics));
						assert.equal(_.size(metrics), 2);
						assert.equal(metrics[0].metric, 1);
						assert.equal(metrics[1].metric, 2);
					});
			});
	});
});
