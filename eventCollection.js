window.EventCollection = (function() {
    function Collection(type) {
        /* private */
        var successMethods = [],
            errorMethods = [],
            eventSuccessBuffer = [],
            eventErrorBuffer = [];

        if (!type) { type = "default"; }

        var sendEvent = function(fnArray, event) {
            for(var i = 0; i < fnArray.length; i++) {
                fnArray[i].call(null, event);
            }
        }

        /* priveledged */
        this.acceptEventSucess = function(event) {
            sendEvent(successMethods, event);
        }

        this.acceptEventError = function(event) {
            sendEvent(errorMethods, event);
        }

        this.forEach = function(successFn, errorFn) {
            successMethods.push(successFn);
            if (errorFn) { errorMethods.push(errorFn); }
        };

        this.inspect = function() {
            return {
                successMethods: successMethods,
                errorMethods: errorMethods,
                eventSuccessBuffer: eventSuccessBuffer,
                eventErrorBuffer: eventErrorBuffer
            }
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
            if(errorFn) { newCollection.acceptEventError(errorFn(event)); }
        });
        return newCollection;
    };

    Collection.prototype.filter = function(successFn, errorFn) {
        var newCollection = new Collection();
        this.forEach(function(event) {
            /* handle a successful event */
            if(successFn(event)) { newCollection.acceptEventSucess(event); }
        }, function(event) {
            /* handle an error event */
            if(errorFn) { newCollection.acceptEventError(event); }
        });
        return newCollection;
    };

    Collection.prototype.flatten = function() {
        var newCollection = new Collection();
        this.forEach(function(event) {
            /* flatten all successful events */
            if(event instanceof Array) {
                for(var i = 0; i < event.length; i++) {
                    newCollection.acceptEventSucess(event[i]);
                }
            } else if (event instanceof Collection) {
                event.forEach(function(event) {
                    newCollection.acceptEventSucess(event);
                }, function(event) {
                    newCollection.acceptEventError(event);
                });
            } else {
                newCollection.acceptEventSucess(event);
            }
        });
        return newCollection;
    }


    return {
        createFromDomEvent: function($domElement, action, selector) {
            var collection = new Collection();
            var handlerArgs = [];
            handlerArgs.push(action);
            if(selector) { handlerArgs.push(selector); }
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
            ajaxCall.always(function() {
                collection.complete();
            });
            return collection;
        }
    }
})();

var s = EventCollection.createFromDomEvent($(document), "click");

s.map(function(event) {
    return {x: event.offsetX, y: event.offsetY};
}).filter(function(event) {
    return event.x > 500;
}).map(function(event) {
    return EventCollection.createFromAjax($.ajax({url: "/grapes.jpg"}));
}).flatten().forEach(function(event) {
    console.log(event);
});

