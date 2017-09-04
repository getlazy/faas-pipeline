
'use strict';

const _ = require('lodash');
const fp = require('lodash/fp');
const FaasPipelineRun = require('./faas-pipeline-run');
const logger = require('package-logger').create('faas-pipeline');
const EventEmitter = require('events');
const request = require('request-promise-native');
const tryJsonParse = require('try-json-parse');

/**
* Class implementing public interface of the module. Internally it uses FaasPipelineRun for
* each run.
*/
class FaasPipeline extends EventEmitter {
	/**
	* Constructs FaasPipeline object and prepares it for running.
	* @param {String} `faasGateway` URL to OpenFaaS gateway including /function path.
	* @param {Object} `pipelineRoot` An object holding the root of execution pipeline with all its branches.
	*/
	constructor(faasGateway, pipelineRoot) {
		super();
		this._faasGateway = faasGateway;
		this._pipelineRoot = pipelineRoot;
	}

	run(payload) {
		const self = this;

		return this._getMetricBase(payload)
			.then((metricsBase) => {
				// Create the pipeline run.
				const pipelineRun = new FaasPipelineRun(this, this._pipelineRoot, payload);

				// Prepare to log metrics.
				pipelineRun.on('metrics', (fnId, metrics) => {
					try {
						self.emit('metrics', _.map(metrics, metric => _.assignIn(metric, metricsBase, { fnId })));
					} catch (e) {
						// istanbul ignore next
						logger.error('Failed to emit metrics', fnId, e);
					}
				});

				return pipelineRun.run();
			});
	}

	_getMetricBase(payload) {
		return Promise.resolve({});
	}

	_execute(name, params, payload) {
		return request.post({
			url: `${this._faasGateway}/${name}`,
			body: JSON.stringify({
				payload,
				params
			})
		})
			.then((stringBody) => {
				const body = tryJsonParse(stringBody);

				if (_.isUndefined(body)) {
					return Promise.reject(new Error(`Failed FaaS pipeline contract: function ${name} didn't return JSON`))
				}

				if (_.isUndefined(body.result) && _.isUndefined(body.error)) {
					return Promise.reject(new Error(`Failed FaaS pipeline contract: function ${name} didn't return either result or error`))
				}

				if (body.error) {
					return Promise.reject(new Error(_.get(body.error, 'message', JSON.stringify(body.error))));
				}

				return Promise.resolve(body);
			});
	}
}

FaasPipeline.logger = logger;

module.exports = FaasPipeline;
