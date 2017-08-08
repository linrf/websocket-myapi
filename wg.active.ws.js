/**
 * websocket api封装
 * @Author   linrunfeng
 * @DateTime 2017/03/07
 */
/**
 调用示例
 var socket = new WS(url, protocols, options);
 */
/**
 * MDN文档参考：https://developer.mozilla.org/zh-CN/docs/Web/API/WebSocket
 */
//支持cmd,amd和直接引入模式
;
(function (global, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        global.WS = factory();
    }
})(this, function () {
    if (!('WebSocket' in window)) {
        return;
    }

    function WS(url, protocols, options) {
        //内部变量
        var self        = this;
        var ws;
        var forcedClose = false;
        var timedOut    = false;
        var eventTarget = document.createElement('div');
        // 默认设置
        var settings    = {
            //是否开启调试模式
            debug               : false,
            //是否自动连接
            automaticOpen       : true,
            //重连延时
            reconnectInterval   : 1000,
            //最大重连延时
            maxReconnectInterval: 30000,
            //等待时间
            reconnectDecay      : 1.5,
            //最大等待时间
            timeoutInterval     : 2000,
            //最大重试次数，不设置一直重试
            maxReconnectAttempts: null,
            //一个字符串表示被传输二进制的内容的类型。取值应当是"blob"或者"arraybuffer"。
            //"blob"表示使用DOMBlob 对象，而"arraybuffer"表示使用 ArrayBuffer 对象。
            binaryType          : 'blob'
        }

        if (!options) {
            options = {};
        }
        for (var key in settings) {
            if (typeof options[key] !== 'undefined') {
                this[key] = options[key];
            } else {
                this[key] = settings[key];
            }
        }

        //链接
        this.url = url;

        //重试次数
        this.reconnectAttempts = 0;

        /**
         * 链接状态
         * WebSocket.CONNECTING, WebSocket.OPEN, WebSocket.CLOSING, WebSocket.CLOSED
         */
        this.readyState = WebSocket.CONNECTING;

        /**
         * 可以是一个单个的协议名字字符串或者包含多个协议名字字符串的数组。这些字符串用来表示子协议，这样做可以让一个服务器实现多种WebSocket子协议（例如你可能希望通过制定不同的协议来处理不同类型的交互）。如果没有制定这个参数，它会默认设为一个空字符串。
         */
        this.protocol = protocols ? protocols : null;

        //处理外部注册的websocket状态变化事件[onopen,onclose,onconnecting,onmessage,onerror]
        eventTarget.addEventListener('open', function (event) {
            if(typeof self.onopen !== 'function')return
            self.onopen(event);
        });
        eventTarget.addEventListener('close', function (event) {
            if(typeof self.onclose !== 'function')return
            self.onclose(event);
        });
        eventTarget.addEventListener('connecting', function (event) {
            if(typeof self.onconnecting !== 'function')return
            self.onconnecting(event);
        });
        eventTarget.addEventListener('message', function (event) {
            if(typeof self.onmessage !== 'function')return
            self.onmessage(event);
        });
        eventTarget.addEventListener('error', function (event) {
            if(typeof self.onerror !== 'function')return
            self.onerror(event);
        });

        //暴露给外部的事件代理接口
        this.on   = this.addEventListener    = eventTarget.addEventListener.bind(eventTarget);
        this.off  = this.removeEventListener = eventTarget.removeEventListener.bind(eventTarget);
        //this.emit = this.dispatchEvent       = eventTarget.dispatchEvent.bind(eventTarget);
        this.dispatchEvent       = eventTarget.dispatchEvent.bind(eventTarget);

        /**
         * 打开链接
         * @param reconnectAttempt 是否重试
         */
        this.open = function (reconnectAttempt) {
            ws            = new WebSocket(self.url, protocols || []);
            ws.binaryType = this.binaryType;

            if (reconnectAttempt) {
                if (this.maxReconnectAttempts && this.reconnectAttempts > this.maxReconnectAttempts) {
                    return;
                }
            } else {
                eventTarget.dispatchEvent(generateEvent('connecting'));
                this.reconnectAttempts = 0;
            }

            if (self.debug || WS.debugAll) {
                console.debug('WS', 'attempt-connect', self.url);
            }

            var localWs = ws;
            var timeout = setTimeout(function () {
                if (self.debug || WS.debugAll) {
                    console.debug('WS', 'connection-timeout', self.url);
                }
                timedOut = true;
                localWs.close();
                timedOut = false;
            }, self.timeoutInterval);

            ws.onopen = function (event) {
                clearTimeout(timeout);
                if (self.debug || WS.debugAll) {
                    console.debug('WS', 'onopen', self.url);
                }
                self.protocol          = ws.protocol;
                self.readyState        = WebSocket.OPEN;
                self.reconnectAttempts = 0;
                var e                  = generateEvent('open');
                e.isReconnect          = reconnectAttempt;
                reconnectAttempt       = false;
                eventTarget.dispatchEvent(e);
            };

            ws.onclose   = function (event) {
                clearTimeout(timeout);
                ws = null;
                if (forcedClose) {
                    self.readyState = WebSocket.CLOSED;
                    eventTarget.dispatchEvent(generateEvent('close'));
                } else {
                    self.readyState = WebSocket.CONNECTING;
                    var e           = generateEvent('connecting');
                    e.code          = event.code;
                    e.reason        = event.reason;
                    e.wasClean      = event.wasClean;
                    eventTarget.dispatchEvent(e);
                    if (!reconnectAttempt && !timedOut) {
                        if (self.debug || WS.debugAll) {
                            console.debug('WS', 'onclose', self.url);
                        }
                        eventTarget.dispatchEvent(generateEvent('close'));
                    }

                    var timeout = self.reconnectInterval * Math.pow(self.reconnectDecay, self.reconnectAttempts);
                    setTimeout(function () {
                        self.reconnectAttempts++;
                        self.open(true);
                    }, timeout > self.maxReconnectInterval ? self.maxReconnectInterval : timeout);
                }
            };
            ws.onmessage = function (event) {
                if (self.debug || WS.debugAll) {
                    console.debug('WS', 'onmessage', self.url, event.data);
                }
                var e  = generateEvent('message');
                e.data = event.data;
                eventTarget.dispatchEvent(e);
                //todo
                //emit
            };
            ws.onerror   = function (event) {
                if (self.debug || WS.debugAll) {
                    console.debug('WS', 'onerror', self.url, event);
                }
                eventTarget.dispatchEvent(generateEvent('error'));
            };
        }

        // 自动连接
        if (this.automaticOpen == true) {
            this.open(false);
        }

        /**
         * 发送消息
         * @param 参数 data 为发消息的内容[string, ArrayBuffer, Blob]
         */
        this.send = function (data) {
            if (ws) {
                if (self.debug || WS.debugAll) {
                    console.debug('WS', 'send', self.url, data);
                }
                return ws.send(data);
            } else {
                throw 'INVALID_STATE_ERR : Pausing to reconnect websocket';
            }
        };

        /**
         * 关闭连接
         * 如果已经关闭了连接，此方法不起作用
         * 错误代码参考：https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent
         * @param 参数 code 为错误代码 1000为正常关闭
         * @param 参数 reason 为错误原因
         */
        this.close = function (code, reason) {
            // 默认返回1000
            if (typeof code == 'undefined') {
                code = 1000;
            }
            forcedClose = true;
            if (ws) {
                ws.close(code, reason);
            }
        };

        //todo
        this.refresh = function () {
            if (ws) {
                ws.close();
            }
        };
    }

    function generateEvent(s, args) {
        var evt = document.createEvent("CustomEvent");
        evt.initCustomEvent(s, false, false, args);
        return evt;
    };

    //挂个属性上去，防止出错
    WS.prototype.onopen       = function (event) {
    };
    WS.prototype.onclose      = function (event) {
    };
    WS.prototype.onconnecting = function (event) {
    };
    WS.prototype.onmessage    = function (event) {
    };
    WS.prototype.onerror      = function (event) {
    };

    // 全局调试参数
    WS.debugAll   = false;
    // websocket链接状态
    WS.CONNECTING = WebSocket.CONNECTING;
    WS.OPEN       = WebSocket.OPEN;
    WS.CLOSING    = WebSocket.CLOSING;
    WS.CLOSED     = WebSocket.CLOSED;

    return WS;
});