window.EventCollection = (function() {
    function Collection(type) {
        /* private */
        var successMethods = [],
            errorMethods = [],
            disabled = false,
            throttleInterval = null,
            debounceInterval = null,
            debounceTimer = null,
            eventQueue = [];

        if (!type) {
            type = "default";
        }

        var sendEvent = function(fnArray, event) {
            for(var i = 0; i < fnArray.length; i++) {
                fnArray[i].call(null, event);
            }
        }

        var processEventQueue = function(newCollection) {
            if (!eventQueue.length) {
                return
            }

            var handleNextEvent = function() {
                eventQueue.shift();
                processEventQueue();
            }

            var processSuccess = function(event) {
                newCollection.acceptEventSucess(event);
                handleNextEvent();
            }

            var processError = function(event) {
                newCollection.acceptEventError(event);
                handleNextEvent();
            }

            var event = eventQueue[0];
            if (event.type === "promise") {
                event.event.done(processSuccess);
                event.event.fail(processError);
            } else {
                processSuccess(event.event);
            }
        }

        /* priveledged */
        this.acceptEventSucess = function(event) {
            runEvent = function() {
                if (!disabled) {
                    sendEvent(successMethods, event);

                    if (throttleInterval) {
                        disabled = true;
                        setTimeout(function() {
                            disabled = false;
                        }, throttleInterval);
                    }
                }
            }

            if (debounceInterval) {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(runEvent, debounceInterval);
            } else {
                runEvent();
            }
        }

        this.acceptEventError = function(event) {
            sendEvent(errorMethods, event);
        }

        this.forEach = function(successFn, errorFn) {
            successMethods.push(successFn);
            if (errorFn) {
                errorMethods.push(errorFn);
            }
        };

        this.inspect = function() {
            return {
                successMethods: successMethods,
                errorMethods: errorMethods,
                disabled: disabled,
                throttleInterval: throttleInterval,
                debounceInterval: debounceInterval,
                debounceTimer: debounceTimer
            }
        };

        this.throttle = function(newThrottleInterval) {
            throttleInterval = newThrottleInterval;
            return this;
        };

        this.debounce = function(newDebounceInterval) {
            debounceInterval = newDebounceInterval;
            return this;
        };

        this.flatten = function() {
            var newCollection = new Collection();
            this.forEach(function(event) {
                if(event instanceof Array) {
                    for(var i = 0; i < event.length; i++) {
                        eventQueue.push({type: "default", event: event[i]});
                    }
                } else if (event instanceof Collection) {
                    var d = $.Deferred();
                    event.forEach(d.resolve, d.reject);
                    eventQueue.push({type: "promise", event: d.promise()});
                } else {
                    eventQueue.push({type: "default", event: event});
                }
                processEventQueue(newCollection);
            });
            return newCollection;
        };
    };

    /* public */
    Collection.prototype.map = function(successFn, errorFn) {
        var newCollection = new Collection();
        this.forEach(function(event) {
            /* handle a successful event */
            newCollection.acceptEventSucess(successFn(event));
        }, function(event) {
            /* handle an error event */
            if(errorFn) {
                newCollection.acceptEventError(errorFn(event));
            }
        });
        return newCollection;
    };

    Collection.prototype.filter = function(successFn, errorFn) {
        var newCollection = new Collection();
        this.forEach(function(event) {
            /* handle a successful event */
            if(successFn(event)) {
                newCollection.acceptEventSucess(event);
            }
        }, function(event) {
            /* handle an error event */
            if(errorFn) {
                newCollection.acceptEventError(event);
            }
        });
        return newCollection;
    };

    return {
        createFromDomEvent: function($domElement, action, selector) {
            var collection = new Collection();
            var handlerArgs = [];
            handlerArgs.push(action);
            if(selector) {
                handlerArgs.push(selector);
            }
            handlerArgs.push(function(event) {
                collection.acceptEventSucess(event);
            });
            $domElement.on.apply($domElement, handlerArgs);
            return collection;
        },

        createFromAjax: function(ajaxCall) {
            var collection = new Collection()
            ajaxCall.done(function(data) {
                collection.acceptEventSucess(data);
            });
            ajaxCall.fail(function(error) {
                collection.acceptEventError(error);
            });
            return collection;
        }
    }
})();
