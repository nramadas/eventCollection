window.EventCollection = (function() {
    /*
    * Collection represents an event stream
    * @class
    */
    var Collection = function() {
        var successMethods = [],
            errorMethods = [],
            completeMethods = [],
            disabled = false,
            throttleInterval = null,
            debounceInterval = null,
            debounceTimer = null,
            eventQueue = [],
            deconstructor = null;

        /**
        * Given an array of functions, send an event to each function
        * @private
        * @param {Array} fnArray
        * @param {Event} event
        **/
        var sendEvent = function(fnArray, event) {
            for(var i = 0; i < fnArray.length; i++) {
                fnArray[i].call(null, event);
            }
        }

        /**
        * Use a collection to process all the queued events
        * @private
        * @param {Collection} newCollection
        **/
        var processEventQueue = function(newCollection) {
            if (!eventQueue.length) {
                return
            }

            var handleNextEvent = function() {
                eventQueue.shift();
                processEventQueue(newCollection);
            }

            var processQueuedEventsSuccess = function(event) {
                newCollection.acceptEventSucess(event);
                /* process success does not move on to the next QueuedEvent
                   event until the QueuedEvent completes. this allows for
                   flattening multiple Collection streams */
            }

            var processQueuedEventsError = function(event) {
                newCollection.acceptEventError(event);
                handleNextEvent();
            }

            var processQueuedEventsComplete = function(event) {
                newCollection.acceptEventComplete(event);
                handleNextEvent();
            }

            var event = eventQueue[0];
            if (event.type === "queue") {
                event.event.progress(processQueuedEventsSuccess);
                event.event.fail(processQueuedEventsError);
                event.event.done(processQueuedEventsComplete);
            } else {
                newCollection.acceptEventSucess(event.event);
                handleNextEvent();
            }
        }

        /**
        * Pass along a successful event. Throttle or debounce the sending of
        * the event if necessary.
        * @privileged
        * @param {Event} event
        **/
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

        /**
        * Pass along an error event. There is no throttling or debouncing.
        * @privileged
        * @param {Event} event
        **/
        this.acceptEventError = function(event) {
            sendEvent(errorMethods, event);
        }

        /**
        * Pass along an completed event. There is no throttling or debouncing.
        * Dissolve the collection as well.
        * @privileged
        * @param {Event} event
        **/
        this.acceptEventComplete = function(event) {
            sendEvent(completeMethods, event);
            this.dissolve();
        }

        /**
        * Iterate over each event in the collection as they arrive, and apply
        * the functions provided.
        * @privileged
        * @param {function} successFn
        * @param {function=} errorFn
        * @param {function=} completeFn
        **/
        this.forEach = function(successFn, errorFn, completeFn) {
            successMethods.push(successFn);
            if (errorFn) {
                errorMethods.push(errorFn);
            }
            if (completeFn) {
                completeMethods.push(completeFn);
            }
        };

        /**
        * Given a throttle interval, fire successful event *only* at the
        * throttle rate.
        * @privileged
        * @param {number} newThrottleInterval
        * @returns {Collection} this
        **/
        this.throttle = function(newThrottleInterval) {
            throttleInterval = newThrottleInterval;
            return this;
        };

        /**
        * Given a debounce interval, fire the last event to occur after no new
        * events occure during the debounce interval. Everything a new event is
        * fired, the debounce interval is run again.
        * @privileged
        * @param {number} newDebounceInterval
        * @returns {Collection} this
        **/
        this.debounce = function(newDebounceInterval) {
            debounceInterval = newDebounceInterval;
            return this;
        };

        /**
        * For each event, flatten the event if its an array or another
        * collection. In the case of an array, just fire each event in the
        * array. If it's a collection, we want to wait for the collection to
        * complete before we fire the next event to be flattened.
        * @privileged
        * @returns {Collection} newCollection;
        **/
        this.flatten = function() {
            var newCollection = new Collection();
            this.forEach(function(event) {
                if(event instanceof Array) {
                    for(var i = 0; i < event.length; i++) {
                        eventQueue.push({type: "default", event: event[i]});
                    }
                } else if (event instanceof Collection) {
                    var d = $.Deferred();
                    event.forEach(d.notify, d.reject, d.resolve);
                    eventQueue.push({type: "queue", event: new QueuedEvents(d)});
                } else {
                    eventQueue.push({type: "default", event: event});
                }
                processEventQueue(newCollection);
            });
            return newCollection;
        };

        /**
        * Set a function to be called when the Collection is dissolved
        * @privileged
        * @params {function} fn
        **/
        this.setDeconstructor = function(fn) {
            deconstructor = fn;
        };

        /**
        * If a deconstructor function exists, run it.
        * @privileged
        **/
        this.dissolve = function() {
            if (deconstructor) {
                deconstructor();
            }
        }
    };

    /**
    * Return a new collection where the events are modified based on the input
    * map functions
    * @public
    * @param {function} successFn
    * @param {function=} errorFn
    * @param {function=} completeFn
    * @returns {Collection} newCollection
    **/
    Collection.prototype.map = function(successFn, errorFn, completeFn) {
        var newCollection = new Collection();
        this.forEach(function(event) {
            /* handle a successful event */
            newCollection.acceptEventSucess(successFn(event));
        }, function(event) {
            /* handle an error event */
            if(errorFn) {
                newCollection.acceptEventError(errorFn(event));
            }
        }, function(event) {
            /* handle complete event */
            if (completeFn) {
                newCollection.acceptEventComplete(completeFn(event));
            }
        });
        return newCollection;
    };

    /**
    * Return a new collection where the events in the new collection are those
    * that pass the provided filter functions. Filters only apply to successful
    * events.
    * @public
    * @param {function} successFn
    * @param {function=} errorFn
    * @param {function=} completeFn
    * @returns {Collection} newCollection
    **/
    Collection.prototype.filter = function(successFn, errorFn, completeFn) {
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
        }, function(event) {
            /* handle complete event */
            if (completeFn) {
                newCollection.acceptEventComplete(event);
            }
        });
        return newCollection;
    };

    /**
    * Send an "event complete" even when another collection fires a success
    * event
    * @public
    * @param {Collection} stopCollection
    * @returns {Collection} this
    **/
    Collection.prototype.stopWhen = function(stopCollection) {
        var that = this;
        stopCollection.forEach(function(event) {
            that.acceptEventComplete([]);
        });
        return this;
    };

    /**
    * @class
    **/
    var QueuedEvents = function(promise) {
        var queue = [],
            debuffered = false,
            progressCb = null;

        promise.progress(function(event) {
            if (!debuffered) {
                queue.push(event);
            } else if (progressCb) {
                progressCb(event);
            }
        });

        /**
        * For each event in the queue, call the provided progressCb
        * @private
        **/
        var processEventQueue = function() {
            var event = queue.shift();
            progressCb(event);
            if (queue.lenght) {
                processEventQueue();
            }
        };

        /*
        * Set the callback to be called when a success event occurs. If there is
        * a queue already, start processing it. Otherwise, start listening for
        * new events to send immediately.
        * @privileged
        * @param {function} newProgressCb
        */
        this.progress = function(newProgressCb) {
            progressCb = newProgressCb;
            if (queue.length) {
                processEventQueue();
            } else {
                debuffered = true;
            }
        };

        /*
        * Set the callback to be called when the entire queue is processed.
        * @privileged
        * @param {function} resolveCb
        */
        this.done = function(resolveCb) {
            promise.done(function(event) {
                if (queue.length) {
                    processEventQueue();
                }
                resolveCb(event);
            });
        };

        /*
        * Set the callback to be called when there is failure in the queue.
        * @privileged
        * @param {function} failCb
        */
        this.fail = function(failCb) {
            promise.fail(function(event) {
                if (queue.length) {
                    processEventQueue();
                }
                failCb(event);
            });
        };
    };

    return {
        /**
        * Creates an event collection based on a jQuery event
        * @public
        * @param {jQuery object} $domElement
        * @param {String} action
        * @param {String} selector
        * @returns {Collection} collection
        **/
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
            collection.setDeconstructor(function() {
                $domElement.off.apply($domElement, handlerArgs);
            });
            return collection;
        },

        /**
        * Creates an event collection using a jQuery ajax call
        * @public
        * @param {jquery Ajax} ajaxCall
        * @returns {Collection} collection
        **/
        createFromAjax: function(ajaxCall) {
            var collection = new Collection()
            ajaxCall.done(function(data) {
                collection.acceptEventSucess(data);
            });
            ajaxCall.fail(function(error) {
                collection.acceptEventError(error);
            });
            ajaxCall.always(function(event) {
                collection.acceptEventComplete(event);
            });
            return collection;
        }
    }
})();
