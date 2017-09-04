# faas-pipeline
Complex OpenFaaS function composition

faas-pipeline offers executing of complex pipelines on top of [OpenFaaS](https://github.com/ierceg/faas). It does this by:

* Defining its own pipeline definition language
* Defining its own protocol for data exchange between functions
* Accepting pipeline definitions together with initial payload

faas-pipeline can:

* Process payloads concurrently. This is called `~split`. The result of `~split` operation is an array of results of all functions that were executed concurrently.
* Process payloads sequentially. This is called `~pipe`. `~pipe` operation results in a new payload based on its received payload.
* Include optional parameters, beside payload, when invoking each function.
* Send custom metrics for each invoked function to FaaS' built-in Prometheus.

These can be combined in any number of ways. For example:

```
pipeline:
	~pipe:
		- ~split: # sends the received payload into fn1, fn2 and fn3
			fn1:
			fn2:
			fn3:
		- some-merging-fn: # this function acts on array of results from fn1, fn2 and fn3 with parameters of whatever1 and whatever2
			some-param: whatever1
			another-param: whatever2
```

Each compatible function must:

* Expect to receive JSON with optional `payload` and `params` properties.
* Return JSON with either `error` or `result` property and optional `metrics` property.

Execution stops on first error or when the entire pipeline has ran. Pipeline run thus either results in a free-form result or in a free-form error.
