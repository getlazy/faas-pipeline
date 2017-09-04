
'use strict';

const _ = require('lodash');
const logger = require('package-logger').create('faas-pipeline-run');
const EventEmitter = require('events');

// Keep running the promises returned by the given action while the given condition returns true.
const asyncWhile = (condition, action) => {
	const whilst = () => (condition() ? action().then(whilst) : Promise.resolve());

	return whilst();
};

/**
* Class implementing details of a single pipeline run. This class is used by FaasPipeline and
* shouldn't be used on its own (which is why it's not exposed in the public interface)
*/
class FaasPipelineRun extends EventEmitter {
	constructor(parent, pipelineRoot, payload) {
		super();
		this._parent = parent;
		this._pipelineRoot = pipelineRoot;
		this._payload = payload;
		this._alreadyRan = false;
	}

	run() {
		// istanbul ignore if
		if (this._alreadyRan) {
			throw new Error('FaasPipelineRun can be run only once');
		}

		this._alreadyRan = true;
		return this._runControlNode(this._pipelineRoot, this._payload);
	}

	_runControlNode(controlNode, payload) {
		if (!_.isObject(controlNode)) {
			return Promise.reject(new Error(`Bad FaaS pipeline: control node must be an object not "${typeof(controlNode)}"`));
		}

		// Only valid configuration of a node is exactly one non-empty array property named either `split` or
		// `pipe`.
		if (_.size(controlNode) !== 1) {
			return Promise.reject(new Error(`Bad FaaS pipeline: control node must have exactly one property not "${_.keys(controlNode)}"`));
		}

		const controlNodeType = _.first(_.keys(controlNode));

		try {
			switch (controlNodeType) {
				case '~split':
					return this._runSplit(_.get(controlNode, controlNodeType), payload);
				case '~pipe':
					return this._runPipe(_.get(controlNode, controlNodeType), payload);
				default:
					return Promise.reject(new Error(`Bad FaaS pipeline: control node is of unknown type "${controlNodeType}"`));
			}
		} catch (err) {
			// istanbul ignore next
			return Promise.reject(err);
		}
	}

	_execute(name, params, payload) {
		const self = this;

		return this._parent._execute(name, params, payload)
			.then((body) => {
				// If function returned the metrics then emit metrics event so that environment
				// in which we are running has a chance to store them.
				if (body.metrics) {
					// Emit the event on the run's FaasPipeline object.
					self.emit('metrics', name, body.metrics);
					// Delete the metrics, they shouldn't be accumulated or merged through engine calls.
					// lazy ignore-once no-param-reassign
					delete body.metrics;
				}

				return Promise.resolve(body.result);
			});
	}

	static _getFaasFunction(pipelineNode) {
		if (_.size(pipelineNode) !== 1) {
			return Promise.reject(new Error(`Bad FaaS pipeline: node must have exactly one property "${_.keys(pipelineNode)}"`));
		}

		const name = _.head(_.keys(pipelineNode));

		if (_.includes(['~split', '~pipe'], name)) {
			return Promise.resolve();
		}

		// We accept undefined, null or an object for params.
		// If undefined or null, we use an empty object for params.
		let params = _.get(pipelineNode, name, {});
		if (_.isNil(params)) {
			params = {};
		}

		if (!_.isObject(params)) {
			return Promise.reject(new Error(`Bad FaaS pipeline: params must be object for ${name}`));
		}

		return Promise.resolve({
			name,
			params
		});
	}

	_runSplit(splitNodeValue, payload) {
		if (!_.isObject(splitNodeValue) || _.isEmpty(splitNodeValue)) {
			return Promise.reject(new Error(`Bad FaaS pipeline: split node data must be non-empty object`));
		}

		// Process functions asynchronously and either resolve the array of all results or reject with first error.
		return Promise.all(
			_.map(splitNodeValue, splitItem => {
				return FaasPipelineRun._getFaasFunction(splitItem)
					.then(faasFn => {
						// We must clone the payload as any concurrent split must have access to unchanged payload.
						const clonedPayload = _.cloneDeep(payload) || {};

						if (_.isNil(faasFn)) {
							return this._runControlNode(splitItem, clonedPayload)
								.catch((err) => {
									return Promise.reject(new Error(`Failure during complex split run: ${_.get(err, 'message')}`));
								});
						}

						// Run the FaaS with its params and carried over payload.
						return this._execute(faasFn.name, faasFn.params, clonedPayload)
							.catch((err) => {
								return Promise.reject(new Error(`Failure during split run: ${_.get(faasFn, 'name')} failed with ${_.get(err, 'message')}`));
							});
					});
				}
			)
		);
	}

	_runPipe(pipeNodeValue, payload) {
		if (!_.isArray(pipeNodeValue) || _.isEmpty(pipeNodeValue)) {
			return Promise.reject(new Error(`Bad FaaS pipeline: pipe node data must be a non-empty array`));
		}

		// In sequencing pipelines (seq A -> Seq B), we need to accumulate results of each engine,
		// in such a way that output from seq B overrides output from seq A,
		// while the parts of seq A that are not modified by seq B remain the same
		let currentPipeResult = payload;

		// Run functions sequentially until we have through all of them or one has returned
		// en error.
		let i = 0;
		let error;
		return asyncWhile(
			() => i < pipeNodeValue.length && _.isNil(error),
			// Execute the actual pipe item and return the promise for the execution.
			// That promise will be handled below this entire function.
			() => (() => {
				// Get the current engine item in pipe.
				const pipeItem = pipeNodeValue[i];
				i += 1;

				return FaasPipelineRun._getFaasFunction(pipeItem)
					.then((faasFn) => {
						// If there is no engine item then it's either a pipe or a split
						// so continue running there.
						if (_.isNil(faasFn)) {
							return this._runControlNode(pipeItem, currentPipeResult)
								.then((result) => {
									currentPipeResult = result;
								})
								.catch((err) => {
									error = new Error(`Failure during complex pipe run: ${_.get(err, 'message')}`);
								});
						}

						// Run the engine with its params.
						return this._execute(faasFn.name, faasFn.params, currentPipeResult)
							.then((result) => {
								// Replace the old result.
								currentPipeResult = result;
							})
							.catch((err) => {
								error = new Error(`Failure during pipe run: ${_.get(faasFn, 'name')} failed with ${_.get(err, 'message')}`);
							});
					})
			})()
		)
			.then(() => {
				if (error) {
					return Promise.reject(error);
				}

				return Promise.resolve(currentPipeResult);
			});
	}
}

module.exports = FaasPipelineRun;
