var Promise = require('bluebird');
var path = require('path');
var child_process = require('child_process');
var request = require('request');
var gui = require('nw.gui');
var _ = require('lodash');
var semver = require('semver');
var Boot;
(function (Boot) {
    'use strict';
    var win = gui.Window.get(), cwd = process.execPath.indexOf('node_modules') !== -1 ? process.cwd() : path.join(path.dirname(process.execPath), '.'), humanize = require('humanize'), tar = require('tar.gz'), fs = Promise.promisifyAll(require('graceful-fs'));
    function templateAsString(filename) {
        return fs.readFileAsync(path.join(cwd, 'templates', filename)).then(function (v) {
            return v.toString();
        });
    }
    function extract(file, path) {
        return new Promise(function (resolve, reject) {
            (new tar()).extract(file, path, function (err) {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });
    }
    var Controllers;
    (function (Controllers) {
        var Global = (function () {
            function Global(WalletConfig, Log, $state, NEM) {
                this.WalletConfig = WalletConfig;
                this.Log = Log;
                this.$state = $state;
                this.NEM = NEM;
                this.pkg = require('../package.json');
            }
            Global.prototype.shutdown = function () {
                swal({
                    text: 'Do you want to close the program?',
                    title: 'Confirm',
                    type: 'warning',
                    showCancelButton: true,
                    closeOnConfirm: true
                }, function () {
                    process.exit();
                });
            };
            Global.prototype.loaded = function () {
                return this.WalletConfig.loaded;
            };
            Global.$inject = ['WalletConfig', 'Log', '$state', 'NEM'];
            return Global;
        })();
        Controllers.Global = Global;
        var About = (function () {
            function About(NP, java) {
                this.java = java;
                this.versions = {
                    nis: NP.instance('nis').version,
                    ncc: NP.instance('ncc').version
                };
            }
            About.$inject = ['NemProperties', 'Java'];
            return About;
        })();
        Controllers.About = About;
        var Backup = (function () {
            function Backup() {
            }
            Backup.$inject = [];
            return Backup;
        })();
        Controllers.Backup = Backup;
        var Market = (function () {
            function Market($scope, Log) {
                this.$scope = $scope;
                this.Log = Log;
                this.loading = true;
                this.last = {
                    usd: 0,
                    btc: 0
                };
                this.current = 'btc';
                this.config = {
                    responsive: true,
                    scaleBeginAtZero: false,
                    pointDot: false,
                    showScale: false,
                    scaleShowGridLines: true,
                    datasetFill: false,
                    pointDotStrokeWidth: 0,
                    pointHitDetectionRadius: 0
                };
                this.load();
            }
            Market.prototype.fetch = function () {
                return new Promise(function (resolve, reject) {
                    var req = request.get('http://coinmarketcap.com/static/generated_pages/currencies/datapoints/nemstake-1d.json'), total = '';
                    req.on('data', function (res) {
                        total += res.toString();
                    });
                    req.on('error', function (res) {
                        reject(res);
                    });
                    req.on('end', function (res) {
                        try {
                            resolve(JSON.parse(total));
                        }
                        catch (e) {
                            reject(e);
                        }
                    });
                });
            };
            Market.prototype.load = function () {
                var _this = this;
                this.$scope.$eval(function () {
                    _this.loading = true;
                });
                return this.fetch().then(function (total) {
                    _this.$scope.$evalAsync(function () {
                        var btc = [], usd = [], times = { usd: [], btc: [] }, limit = 20;
                        _.forEach(total['price_btc_data'], function (item, index) {
                            if (index % 2 === 0) {
                                times.btc.push((new Date(item[0])).toLocaleString());
                                btc.push(item[1]);
                            }
                        });
                        _.forEach(total['price_usd_data'], function (item, index) {
                            if (index % 2 === 0) {
                                times.usd.push((new Date(item[0])).toLocaleString());
                                usd.push(item[1]);
                            }
                        });
                        _this.last.usd = _.last(usd);
                        _this.last.btc = _.last(btc);
                        _this.usd = {
                            labels: times.usd,
                            datasets: [
                                {
                                    label: 'BTC',
                                    fillColor: 'rgba(220,220,220,0.2)',
                                    strokeColor: 'rgba(220,220,220,1)',
                                    pointColor: 'rgba(220,220,220,1)',
                                    pointStrokeColor: '#fff',
                                    pointHighlightFill: '#fff',
                                    pointHighlightStroke: 'rgba(220,220,220,1)',
                                    data: usd
                                },
                            ]
                        };
                        _this.btc = {
                            labels: times.btc,
                            datasets: [
                                {
                                    label: 'USD',
                                    fillColor: 'rgba(151,187,205,0.2)',
                                    strokeColor: 'rgba(151,187,205,1)',
                                    pointColor: 'rgba(151,187,205,1)',
                                    pointStrokeColor: '#fff',
                                    pointHighlightFill: '#fff',
                                    pointHighlightStroke: 'rgba(151,187,205,1)',
                                    data: btc
                                }
                            ]
                        };
                        _this.loading = false;
                    });
                }, function (err) {
                    _this.$scope.$evalAsync(function () {
                        _this.Log.add(err.message, 'client');
                        _this.loading = false;
                    });
                });
            };
            Market.$inject = ['$scope', 'Log'];
            return Market;
        })();
        Controllers.Market = Market;
        var News = (function () {
            function News($scope, $sce, Log) {
                var _this = this;
                this.$scope = $scope;
                this.$sce = $sce;
                this.Log = Log;
                this.FeedParser = require('feedparser');
                this.states = {
                    'reddit': {
                        url: 'http://www.reddit.com/r/nem/.rss',
                        baseurl: 'http://www.reddit.com/r/nem',
                        loading: true,
                        limit: 4,
                        data: []
                    },
                    'forums': {
                        url: 'https://forum.nemcoin.com/index.php?type=rss;action=.xml',
                        baseurl: 'https://forum.nemcoin.com/index.php',
                        loading: true,
                        limit: -1,
                        data: []
                    },
                    'medium': {
                        url: 'https://medium.com/feed/@xtester',
                        baseurl: 'https://medium.com/@xtester',
                        loading: true,
                        limit: 5,
                        data: []
                    }
                };
                Promise.reduce(_.keys(this.states), function (ac, s) {
                    return _this.load(s);
                }, '');
            }
            News.prototype.loading = function (type, set) {
                if (!_.isUndefined(set)) {
                    this.states[type].loading = set;
                }
                return this.states[type].loading;
            };
            News.prototype.load = function (type) {
                var _this = this;
                this.$scope.$eval(function () {
                    _this.loading(type, true);
                });
                return this.fetch(type).then(function (av) {
                    _this.$scope.$evalAsync(function () {
                        _this.states[type].data = av;
                        _this.loading(type, false);
                    });
                }, function (err) {
                    _this.$scope.$evalAsync(function () {
                        _this.loading(type, false);
                        _this.Log.add(err.message, 'client');
                    });
                });
            };
            News.prototype.fetch = function (type) {
                var _this = this;
                var state = this.states[type];
                return new Promise(function (resolve, reject) {
                    var req = request(state.url), feedparser = new _this.FeedParser(), items = [];
                    req.on('error', function (error) {
                        reject(error);
                    });
                    req.on('response', function (res) {
                        var stream = this;
                        if (res.statusCode !== 200) {
                            return reject(new Error('Bad status code'));
                        }
                        stream.pipe(feedparser);
                    });
                    feedparser.on('error', function (error) {
                        reject(error);
                    });
                    feedparser.on('readable', function () {
                        var stream = this, meta = this.meta, item;
                        while (item = stream.read()) {
                            items.push(item);
                        }
                    });
                    feedparser.on('end', function () {
                        var _items = {}, limit = 0;
                        var addItem = function (item) {
                            _items[item.title] = {
                                title: item.title,
                                url: item.permalink,
                                date: new Date(item.date)
                            };
                        };
                        _.forEach(items, function (item) {
                            if (!_items[item.title]) {
                                if (state.limit !== -1) {
                                    if (limit < state.limit) {
                                        addItem(item);
                                    }
                                }
                                else {
                                    addItem(item);
                                }
                            }
                            limit++;
                        });
                        resolve(_items);
                    });
                });
            };
            News.prototype.getUrl = function (item) {
                return this.$sce.parseAsUrl(item.url);
            };
            News.$inject = ['$scope', '$sce', 'Log'];
            return News;
        })();
        Controllers.News = News;
        var Log = (function () {
            function Log(Log, growl, $timeout) {
                this.Log = Log;
                this.growl = growl;
                this.$timeout = $timeout;
                this.logs = [];
                this._filterBy = 'none';
                this.labels = {
                    'none': 'All',
                    'ncc': 'NCC',
                    'nis': 'NIS',
                    'java': 'Java',
                    'client': 'Client'
                };
            }
            Log.prototype.by = function (type) {
                return this.Log.count(type);
            };
            Log.prototype.clear = function () {
                var _this = this;
                swal({
                    title: 'Confirmation',
                    text: 'Are you sure you want to clear ' + this.labels[this._filterBy] + ' logs?',
                    showCancelButton: true
                }, function () {
                    _this.$timeout(function () {
                        if (_this._filterBy !== 'none') {
                            _this.Log.logs[_this._filterBy].length = 0;
                        }
                        else {
                            _.forEach(_this.Log.logs, function (logs) {
                                logs.length = 0;
                            });
                        }
                    });
                });
            };
            Log.prototype.filterBy = function (type) {
                switch (type) {
                    case 'none':
                    case 'ncc':
                    case 'nis':
                    case 'java':
                    case 'client':
                        this._filterBy = type;
                        break;
                }
            };
            Log.prototype.openSaveAs = function () {
                var _this = this;
                var dialog = $('#fileDialog');
                dialog.one('change', function () {
                    var diag = dialog[0];
                    if (diag.files && diag.files[0] && diag.files[0].path) {
                        var logs = _.map(_this.logs, function (m) {
                            return (new Date(m.time).toLocaleString()) + ': ' + m.msg;
                        });
                        fs.writeFileAsync(diag.files[0].path, logs.join('\n')).then(function () {
                            _this.growl.success(_this.Log.add('File saved to ' + diag.files[0].path, 'client'), { ttl: 3000 });
                        });
                    }
                    diag.files.length = 0;
                });
                dialog.click();
            };
            Log.prototype.filter = function () {
                var _this = this;
                this.logs.length = 0;
                if (this._filterBy === 'none') {
                    _.forEach(this.Log.logs, function (logs) {
                        _.forEach(logs, function (log) {
                            _this.logs.push(log);
                        });
                    });
                }
                else if (typeof this.Log.logs[this._filterBy] !== 'undefined') {
                    _.forEach(this.Log.logs[this._filterBy], function (log) {
                        _this.logs.push(log);
                    });
                }
                this.logs.sort(function (a, b) {
                    return a.time - b.time;
                });
                return this.logs;
            };
            Log.$inject = ['Log', 'growl', '$timeout'];
            return Log;
        })();
        Controllers.Log = Log;
        var Config = (function () {
            function Config(WalletConfig) {
                this.WalletConfig = WalletConfig;
                this.model = {};
                this.model.tray = WalletConfig.tray;
                this.model.beta = WalletConfig.beta;
                this.model.testnet = WalletConfig.testnet;
                this.model.folder = WalletConfig.folder;
            }
            Config.prototype.save = function () {
                var _this = this;
                var config = this.WalletConfig;
                _.forEach(['tray', 'beta', 'testnet', 'folder'], function (key) {
                    config[key] = _this.model[key];
                });
                config.save();
            };
            Config.$inject = ['WalletConfig'];
            return Config;
        })();
        Controllers.Config = Config;
        var Main = (function () {
            function Main($state) {
                this.$state = $state;
            }
            Main.$inject = ['$state'];
            return Main;
        })();
        Controllers.Main = Main;
        var NCC = (function () {
            function NCC(NEM, $sce) {
                var config = NEM.instance('ncc').config;
                this.url = $sce.trustAsResourceUrl(config.protocol + '://' + config.host + ':' + config[config.protocol + 'Port'] + config.homePath);
            }
            NCC.$inject = ['NemProperties', '$sce'];
            return NCC;
        })();
        Controllers.NCC = NCC;
    })(Controllers || (Controllers = {}));
    var Directives;
    (function (Directives) {
        var ProgressBar = (function () {
            function ProgressBar(Downloads) {
                this.restrict = 'A';
                this.scope = {};
                this.template = [
                    '<div class="progress-bar-wrapper shadow-z-2" ng-show="info()">',
                    '<div>Downloading...</div>',
                    '<div ng-click="cancel()" class="progress-cancel"><i class="mdi-navigation-cancel"></i></div>',
                    '<div class="clearfix">',
                    '<div class="progress progress-striped active">',
                    '<div class="progress-bar" ng-style="{width: info().progress + \'%\'}"></div>',
                    '</div>',
                    '</div>',
                    '<div class="progress-bar-label">{{ info().label }} from {{ info().url }}</div>',
                    '</div>'
                ].join('');
                this.link = function (scope) {
                    scope['info'] = function () {
                        return Downloads.current();
                    };
                    scope['cancel'] = function () {
                        var current;
                        if ((current = scope['info']())) {
                            swal({
                                text: 'Cancel the download?',
                                title: 'Confirm',
                                type: 'warning',
                                showCancelButton: true
                            }, function () {
                                current.cancel = true;
                            });
                        }
                    };
                };
            }
            ProgressBar.instance = function () {
                var _this = this;
                return ['Downloads', function (Downloads) { return new _this(Downloads); }];
            };
            return ProgressBar;
        })();
        Directives.ProgressBar = ProgressBar;
        var ServerLog = (function () {
            function ServerLog(Log) {
                this.Log = Log;
                this.restrict = 'E';
                this.scope = {};
                this.template = '<div class="well">{{ item.msg }}</div>';
                this.link = function (scope) {
                    scope.$watch(function () {
                        return Log.last();
                    }, function (item) {
                        if (item && item.group !== 'nis') {
                            scope['item'] = item;
                        }
                    }, true);
                };
            }
            ServerLog.instance = function () {
                var _this = this;
                return ['Log', function (Log) { return new _this(Log); }];
            };
            return ServerLog;
        })();
        Directives.ServerLog = ServerLog;
        var Loading = (function () {
            function Loading() {
                this.template = '<div class="loading_indicator_container"><div class="loading_indicator"><div class="loading"></div></div></div>';
                this.restrict = 'E';
            }
            Loading.instance = function () {
                var _this = this;
                return [function () { return new _this; }];
            };
            return Loading;
        })();
        Directives.Loading = Loading;
    })(Directives || (Directives = {}));
    var Providers;
    (function (Providers) {
        var WalletConfig = (function () {
            function WalletConfig() {
                this.tray = false;
                this.beta = true;
                this.testnet = false;
                this.folder = path.join(cwd, 'nem');
                this.loaded = false;
                this.updating = false;
            }
            WalletConfig.prototype._internalState = function (name) {
                return !_.contains(['loaded', 'updating'], name);
            };
            WalletConfig.prototype.save = function () {
                var self = this;
                localStorage.setItem('wallet', JSON.stringify(_.filter(self, this._internalState, this)));
                return this;
            };
            WalletConfig.prototype.load = function () {
                var _this = this;
                var cnf = this;
                try {
                    var obj = JSON.parse(localStorage.getItem('wallet'));
                    _.forEach(obj, function (value, key) {
                        if (_.has(cnf, key) && !_.isFunction(cnf[key]) && _this._internalState(key)) {
                            cnf[key] = value;
                        }
                    });
                }
                catch (e) {
                    localStorage.setItem('wallet', JSON.stringify(this));
                }
                return this;
            };
            WalletConfig.prototype.$get = function () {
                return this;
            };
            return WalletConfig;
        })();
        Providers.WalletConfig = WalletConfig;
        var NemConfig = (function () {
            function NemConfig(name, data) {
                if (data === void 0) { data = null; }
                this.name = name;
                this.Hogan = require('hogan.js');
                this.template = this.Hogan.compile(templateAsString('nem.properties.mustache'));
                this.config = {};
                this.version = '';
                this.set(data);
            }
            NemConfig.prototype.path = function (more) {
                if (more === void 0) { more = []; }
                return path.join.apply(path, [this.config.folder, 'package', this.name].concat(more));
            };
            NemConfig.prototype.render = function (data) {
                if (data === void 0) { data = {}; }
                return this.template.render(_.defaults(this.config, data));
            };
            NemConfig.prototype.saveToFile = function () {
                return fs.writeFileAsync(this.path(['config.properties']), this.render());
            };
            NemConfig.prototype.set = function (config) {
                if (config) {
                    _.merge(this.config, config);
                }
                return this;
            };
            NemConfig.prototype.kill = function (signal) {
                var _this = this;
                if (signal === void 0) { signal = 'SIGTERM'; }
                return new Promise(function (resolve, reject) {
                    if (_this.child) {
                        if (_this.config.shutdownPath) {
                            request.get(_this.config.shutdownPath, {
                                timeout: 10
                            }, function () {
                                _this.Log.add('Process exited', _this.name);
                                resolve(true);
                            }).on('error', function () {
                                _this.Log.add('Process didn\'t stop in time, killing', _this.name);
                                _this.child.kill(signal);
                                resolve(false);
                            });
                        }
                        else {
                            _this.Log.add('Process don\'t have a shutdownPath, killing', _this.name);
                            _this.child.kill(signal);
                        }
                    }
                    else {
                        resolve(true);
                    }
                });
            };
            NemConfig.prototype.ensurePath = function () {
                var _this = this;
                return new Promise(function (resolve, reject) {
                    var mkdirp = require('mkdirp');
                    mkdirp(_this.config.folder, function (err) {
                        if (err) {
                            return reject(err);
                        }
                        resolve();
                    });
                });
            };
            NemConfig.prototype.download = function () {
                var _this = this;
                return new Promise(function (resolve, reject) {
                    _this.ensurePath().then(function () {
                        fs.statAsync(_this.path()).then(function (stat) {
                            resolve();
                        }).catch(function () {
                            var filename = 'nis-ncc-' + _this.NEM.version + '.tgz', filePath = path.join(cwd, 'temp', filename);
                            fs.statAsync(filePath).catch(function () {
                                return _this.Download.get({
                                    url: 'http://bob.nem.ninja/' + filename,
                                    filename: filePath,
                                    label: filename
                                });
                            }).then(function () {
                                _this.Log.add('NEM is downloaded, extracting...', 'client');
                                extract(filePath, _this.config.folder).then(function () {
                                    _this.Log.add('NEM extracted', 'client');
                                    resolve();
                                }, reject);
                            }, reject);
                        });
                    }, reject);
                });
            };
            NemConfig.prototype.run = function () {
                var _this = this;
                return new Promise(function (resolve, reject) {
                    _this.child = _this.Java.exec(['-Xms512M', '-Xmx1G', '-cp', '.;./*;../libs/*', 'org.nem.core.deploy.CommonStarter'], {
                        cwd: _this.path(),
                        env: process.env,
                        detached: true
                    });
                    _this.child.stderr.on('data', function (data) {
                        if (!data.length) {
                            return;
                        }
                        var str = data.toString();
                        _this.Log.add(str, _this.name);
                        if (!_this.version) {
                            var matches;
                            if ((matches = str.match(/version <([^\>]+?)>/)) && matches[1]) {
                                _this.version = matches[1];
                            }
                        }
                        if (str.indexOf('ready to serve') > 0) {
                            resolve(_this.version);
                        }
                    });
                    _this.child.stdout.on('data', function (data) {
                        var str = data.toString();
                        if (!/(exiting|entering|Mapped)/.test(str) || /(WARNING|ERROR|FATAL)/.test(str)) {
                            _this.Log.add(str, _this.name);
                        }
                    });
                    _this.child.on('close', function (errCode) {
                        if (errCode !== 0) {
                            var msg = _this.config.shortServerName + ' closed unexpectedly';
                            _this.Log.add(msg, _this.name);
                        }
                    });
                    _this.child.on('error', function (err) {
                        if (err['code'] !== 'ENOENT') {
                            _this.Log.add(err.message, _this.name);
                        }
                        reject(err);
                    });
                });
            };
            return NemConfig;
        })();
        Providers.NemConfig = NemConfig;
        var NemProperties = (function () {
            function NemProperties() {
                var _this = this;
                this.instances = {};
                this.$get = ['Log', 'NEM', 'Downloader', 'Java', function (Log, NEM, Download, Java) {
                    return {
                        instance: function (instance) {
                            _this.instances[instance].Log = Log;
                            _this.instances[instance].NEM = NEM;
                            _this.instances[instance].Download = Download;
                            _this.instances[instance].Java = Java;
                            return _this.instances[instance];
                        },
                        killAll: function () {
                            return Promise.reduce(_.keys(_this.instances), function (total, instance) {
                                return _this.instances[instance].kill();
                            }, false);
                        }
                    };
                }];
            }
            NemProperties.prototype.instance = function (name, data) {
                if (data === void 0) { data = {}; }
                if (this.instances[name]) {
                    return this.instances[name];
                }
                else {
                    return this.instances[name] = new NemConfig(name, data);
                }
            };
            return NemProperties;
        })();
        Providers.NemProperties = NemProperties;
    })(Providers || (Providers = {}));
    var Services;
    (function (Services) {
        ;
        ;
        var Downloads = (function () {
            function Downloads() {
                this.queue = [];
            }
            Downloads.prototype.add = function (info) {
                this.queue.push(info);
            };
            Downloads.prototype.remove = function (info) {
                var index;
                if ((index = this.queue.indexOf(info)) !== -1) {
                    this.queue.splice(index, 1);
                }
            };
            Downloads.prototype.current = function () {
                return this.queue[0];
            };
            return Downloads;
        })();
        Services.Downloads = Downloads;
        var Downloader = (function () {
            function Downloader($rootScope, Downloads, Log) {
                this.$rootScope = $rootScope;
                this.Downloads = Downloads;
                this.Log = Log;
            }
            Downloader.prototype.get = function (config) {
                var _this = this;
                var info = {
                    filename: config.filename,
                    url: config.url,
                    progress: 0,
                    label: config.label,
                    cancel: false
                };
                var started = false;
                return new Promise(function (resolve, reject) {
                    var progress = require('request-progress'), fileStream = fs.createWriteStream(config.filename), req = request.get(config.url);
                    progress(req).on('progress', function (state) {
                        if (!started) {
                            started = true;
                            _this.Log.add('Starting download for ' + info.label + ' (' + humanize.filesize(state.total) + ')', 'client');
                            _this.Downloads.add(info);
                        }
                        _this.$rootScope.$applyAsync(function () {
                            if (info.cancel) {
                                req.abort();
                            }
                            else {
                                info.progress = state.percent;
                                info.size = state.total;
                            }
                        });
                    }).on('error', function (error) {
                        _this.$rootScope.$applyAsync(function () {
                            _this.Downloads.remove(info);
                            reject(error);
                        });
                    }).pipe(fileStream).on('error', function (error) {
                        _this.$rootScope.$applyAsync(function () {
                            _this.Downloads.remove(info);
                            reject(error);
                        });
                    }).on('close', function () {
                        _this.$rootScope.$applyAsync(function () {
                            if (info.cancel) {
                                reject(new Error(_this.Log.add('Download canceled for ' + info.label, 'client')));
                            }
                            else {
                                _this.Log.add('File ' + info.label + ' downloaded to ' + info.filename, 'client');
                                resolve();
                            }
                            _this.Downloads.remove(info);
                        });
                    });
                });
            };
            Downloader.$inject = ['$rootScope', 'Downloads', 'Log'];
            return Downloader;
        })();
        Services.Downloader = Downloader;
        var Log = (function () {
            function Log($timeout) {
                this.$timeout = $timeout;
                this.$inject = ['$timeout'];
                this.logs = {};
            }
            Log.prototype.last = function () {
                var lasts = _.map(this.logs, function (logs) {
                    return _.first(logs);
                });
                lasts.sort(function (a, b) {
                    return a.time - b.time;
                });
                return _.last(lasts);
            };
            Log.prototype.count = function (type) {
                if (type === void 0) { type = 'none'; }
                if (type && typeof this.logs[type] !== 'undefined') {
                    return this.logs[type].length;
                }
                if (type === 'none') {
                    return _.reduce(this.logs, function (remainder, logs) {
                        return logs.length + remainder;
                    }, 0);
                }
                return 0;
            };
            Log.prototype.add = function (msg, group) {
                var _this = this;
                if (group === void 0) { group = 'global'; }
                if (typeof this.logs[group] === 'undefined') {
                    this.logs[group] = [];
                }
                this.$timeout(function () {
                    _this.logs[group].unshift({ time: Date.now(), msg: msg, group: group });
                }, 0);
                return msg;
            };
            Log.prototype.limit = function (limit, start, group) {
                if (limit === void 0) { limit = 20; }
                if (start === void 0) { start = 0; }
                if (group === void 0) { group = 'global'; }
                if (typeof this.logs[group] === 'undefined') {
                    return [];
                }
                return this.logs[group].slice(start, limit);
            };
            return Log;
        })();
        Services.Log = Log;
        var Java = (function () {
            function Java(Log, Downloader) {
                var _this = this;
                this.Log = Log;
                this.Downloader = Downloader;
                this.latest = '?';
                this.version = {
                    semver: '?',
                    full: '?'
                };
                this.javaBin = 'java';
                this.jrePath = path.join(cwd, 'jre');
                var exec = this.getUrl().exec;
                fs.statAsync(path.join(this.jrePath, 'bin', exec)).then(function () {
                    _this.javaBin = path.join(_this.jrePath, 'bin', exec);
                }, function () {
                    _this.javaBin = exec;
                });
            }
            Java.prototype.exec = function (command, options) {
                if (command === void 0) { command = []; }
                if (options === void 0) { options = {}; }
                return child_process.spawn(this.javaBin, command, _.defaults({
                    env: process.env
                }, options));
            };
            Java.prototype.downloadAndInstall = function () {
                var _this = this;
                return new Promise(function (resolve, reject) {
                    var url;
                    if (!(url = _this.getUrl())) {
                        return reject(new Error('Could not find suitable OS'));
                    }
                    _this.Log.add('Beginning Java download', 'java');
                    var filename = path.join(cwd, 'temp', url.filename);
                    _this.Downloader.get({
                        label: url.filename,
                        filename: filename,
                        url: url.url
                    }).then(function () {
                        var batch = path.join(cwd, 'temp', url.batch);
                        fs.writeFileAsync(batch, [filename, '/s', 'WEB_JAVA=0', 'INSTALLDIR="' + _this.jrePath + '"', '/L java.log'].join(' ')).then(function () {
                            try {
                                var e = child_process['execFile'];
                                var child = e(batch, {
                                    env: process.env
                                });
                                child.on('error', function (err) {
                                    throw err;
                                });
                                child.on('exit', function () {
                                    _this.version.semver = _this.latest.split('_')[0];
                                    _this.version.full = _this.latest;
                                    _this.javaBin = path.join(_this.jrePath, 'bin', 'java');
                                    resolve();
                                });
                            }
                            catch (e) {
                                reject(new Error('Java couldn\'t be installed automatically, execute the file "install-java" in the temp directory'));
                            }
                        }, reject);
                    }, reject);
                });
            };
            Java.prototype.getUrl = function () {
                var obj;
                if (typeof (obj = Java.javaVersions[process.platform]) === 'object') {
                    if (typeof obj[process.arch] !== 'undefined' && obj[process.arch].url && obj[process.arch].filename) {
                        return obj[process.arch];
                    }
                }
                return null;
            };
            Java.prototype._parseVersion = function (version) {
                var versions = version.split('_'), _vs = versions[0].split('.');
                return {
                    major: _vs[0],
                    minor: _vs[1],
                    patch: _vs[2],
                    revision: versions[1]
                };
            };
            Java.prototype.decide = function () {
                var _this = this;
                return new Promise(function (resolve, reject) {
                    request.get('http://java.com/applet/JreCurrentVersion2.txt', function (err, response, version) {
                        if (err) {
                            _this.Log.add('Couldn\'t fetch latest version', 'java');
                            return reject(err);
                        }
                        _this.Log.add('Latest Java version ' + version, 'java');
                        _this.latest = version;
                        var latest = _this.latest.split('_')[0], revision = parseInt(_this.latest.split('_')[1]), child = _this.exec(['-version']);
                        child.on('error', function (err) {
                            if (err['code'] === 'ENOENT') {
                                _this.Log.add('Java 8 not installed locally', 'java');
                            }
                            else {
                                _this.Log.add(err.message, 'java');
                            }
                            _this.downloadAndInstall().then(function () {
                                _this.Log.add('Java downloaded and installed', 'java');
                                resolve();
                            }, function () {
                                _this.Log.add('Failed to download Java, install manually on ' + Services.Java.javaUrl, 'java');
                                reject();
                            });
                        });
                        var gotFirstLine = false;
                        child.stderr.on('data', function (result) {
                            if (gotFirstLine) {
                                return;
                            }
                            var version = result.toString().match(Java.versionRegex), localrevision;
                            if (version && typeof version[2] === 'string') {
                                gotFirstLine = true;
                                try {
                                    _this.version.semver = version[2];
                                    _this.version.full = version[1];
                                    localrevision = parseInt(version[1].split('_')[1]);
                                    if (semver.gte(version[2], latest, true) && localrevision >= revision) {
                                        resolve();
                                    }
                                    else {
                                        reject(new Error(_this.Log.add('Java is outdated', 'java')));
                                    }
                                }
                                catch (e) {
                                    reject(new Error(_this.Log.add('Could not determine Java version, install manually from ' + _this.getUrl().url, 'java')));
                                }
                            }
                            else {
                                reject(new Error(_this.Log.add('No Java version found', 'java')));
                            }
                        });
                    });
                });
            };
            Java.$inject = ['Log', 'Downloader'];
            Java.javaUrl = 'http://www.oracle.com/technetwork/java/javase/downloads/jre8-downloads-2133155.html';
            Java.jreRegex = 'https?:\/\/download\.oracle\.com\/otn-pub\/java\/jdk\/[^\/]+?\/jre-[^\-]+?-';
            Java.versionRegex = /java version "(([\.\d]+)[^"]+)"/;
            Java.javaVersions = {
                'darwin': {
                    'arm': {
                        url: '',
                        filename: '',
                        exec: ''
                    },
                    'ia32': {
                        url: '',
                        filename: '',
                        exec: ''
                    },
                    'x64': {
                        url: 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97361',
                        filename: 'jre.dmg',
                        batch: 'install-java.sh',
                        exec: 'java'
                    }
                },
                'freebsd': {
                    'arm': {
                        url: '',
                        filename: '',
                        exec: ''
                    },
                    'ia32': {
                        url: '',
                        filename: '',
                        exec: ''
                    },
                    'x64': {
                        url: '',
                        filename: '',
                        exec: ''
                    }
                },
                'linux': {
                    'arm': {
                        url: '',
                        filename: '',
                        exec: ''
                    },
                    'ia32': {
                        url: 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97358',
                        filename: 'jre.tar.gz',
                        batch: 'install-java.sh',
                        exec: 'java'
                    },
                    'x64': {
                        url: 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97360',
                        filename: 'jre.tar.gz',
                        batch: 'install-java.sh',
                        exec: 'java'
                    }
                },
                'sunos': {
                    'arm': {
                        url: '',
                        filename: '',
                        exec: ''
                    },
                    'ia32': {
                        url: 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97363',
                        filename: 'jre.tar.gz',
                        batch: 'install-java.sh',
                        exec: ''
                    },
                    'x64': {
                        url: 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97364',
                        filename: 'jre.tar.gz',
                        batch: 'install-java.sh',
                        exec: ''
                    }
                },
                'win32': {
                    'arm': {
                        url: '',
                        filename: '',
                        exec: ''
                    },
                    'ia32': {
                        url: 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=98426',
                        filename: 'jre.exe',
                        batch: 'install-java.cmd',
                        exec: 'java.exe'
                    },
                    'x64': {
                        url: 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=98428',
                        filename: 'jre.exe',
                        batch: 'install-java.cmd',
                        exec: 'java.exe'
                    }
                }
            };
            return Java;
        })();
        Services.Java = Java;
    })(Services || (Services = {}));
    angular.module('app', [
        'ngAnimate',
        'ui.router',
        'ngSanitize',
        'tc.chartjs',
        'ngLocale',
        'angularUtils.directives.dirPagination',
        'ct.ui.router.extras',
        'angular-growl'
    ]).value('NEM', {
        version: '0.0.0',
        beta: false
    }).controller('Global', Controllers.Global).provider('WalletConfig', Providers.WalletConfig).service('Java', Services.Java).service('Log', Services.Log).service('Downloads', Services.Downloads).service('Downloader', Services.Downloader).directive('serverLog', Directives.ServerLog.instance()).directive('progressBar', Directives.ProgressBar.instance()).provider('NemProperties', Providers.NemProperties).directive('loading', Directives.Loading.instance()).config(['$stateProvider', '$locationProvider', '$urlRouterProvider', 'NemPropertiesProvider', 'WalletConfigProvider', 'growlProvider', function ($stateProvider, $locationProvider, $urlRouterProvider, NemPropertiesProvider, WalletConfig, growlProvider) {
        growlProvider.globalPosition('bottom-right');
        WalletConfig.load();
        NemPropertiesProvider.instance('nis', {
            nis: true,
            folder: WalletConfig.folder,
            shortServerName: 'Nis',
            maxThreads: 500,
            protocol: 'http',
            host: '127.0.0.1',
            httpPort: 7890,
            httpsPort: 7891,
            useDosFilter: true,
            nodeLimit: 20,
            bootWithoutAck: false,
            useBinaryTransport: true,
            useNetworkTime: true,
            ipDetectionMode: 'AutoRequired',
            nonAuditedApiPaths: '/heartbeat|/status|/chain/height',
            maxTransactions: 10000,
            additionalLocalIps: '',
            shutdownPath: '/shutdown'
        });
        NemPropertiesProvider.instance('ncc', {
            shortServerName: 'Ncc',
            folder: WalletConfig.folder,
            maxThreads: 50,
            protocol: 'http',
            host: '127.0.0.1',
            httpPort: 8989,
            httpsPort: 9090,
            webContext: '/ncc/web',
            apiContext: '/ncc/api',
            homePath: '/index.html',
            shutdownPath: '/shutdown',
            useDosFilter: false
        });
        $urlRouterProvider.otherwise('/');
        $locationProvider.html5Mode(false);
        $stateProvider.state('main', {
            url: '/',
            controller: Controllers.Main,
            controllerAs: 'main',
            template: templateAsString('main.html')
        });
        $stateProvider.state('config', {
            url: '/config',
            controller: Controllers.Config,
            controllerAs: 'config',
            template: templateAsString('config.html')
        });
        $stateProvider.state('log', {
            url: '/log',
            controller: Controllers.Log,
            controllerAs: 'log',
            template: templateAsString('log.html')
        });
        $stateProvider.state('news', {
            url: '/news',
            controller: Controllers.News,
            controllerAs: 'news',
            template: templateAsString('news.html')
        });
        $stateProvider.state('about', {
            url: '/about',
            controller: Controllers.About,
            controllerAs: 'about',
            template: templateAsString('about.html')
        });
        $stateProvider.state('market', {
            url: '/market',
            controller: Controllers.Market,
            controllerAs: 'market',
            template: templateAsString('market.html')
        });
        $stateProvider.state('services', {
            url: '/services',
            controller: Controllers.Market,
            controllerAs: 'services',
            template: templateAsString('services.html')
        });
        $stateProvider.state('backup', {
            url: '/backup',
            controller: Controllers.Backup,
            controllerAs: 'backup',
            template: templateAsString('backup.html')
        });
        $stateProvider.state('ncc', {
            sticky: true,
            views: {
                'wallet': {
                    template: '<iframe ng-src="{{ncc.url}}" frameBorder="0" class="ncc-iframe" nwdisable></iframe>',
                    controllerAs: 'ncc',
                    controller: Controllers.NCC
                }
            }
        });
    }]).run(['Java', 'NemProperties', 'WalletConfig', '$timeout', 'Log', '$state', 'NEM', function (Java, NemProperties, WalletConfig, $timeout, Log, $state, NEM) {
        request.get('http://bob.nem.ninja/version.txt', {}, function (err, res, version) {
            var v = version.match(/([\d]+\.[\d]+\.[\d]+)-?([A-Z]+)/);
            NEM.version = v[1];
            NEM.beta = typeof v[2] !== 'undefined' && v[2] === 'BETA';
            Log.add('Latest NEM version is ' + NEM.version + (NEM.beta ? ' (BETA)' : ''), 'client');
            Java.decide().then(function () {
                return NemProperties.instance('nis').download().then(function () {
                    return NemProperties.instance('nis').run();
                }).then(function () {
                    return NemProperties.instance('ncc').run();
                });
            }).then(function () {
                $timeout(function () {
                    WalletConfig.loaded = true;
                    $state.go('ncc');
                });
            });
        });
        function killAll() {
            NemProperties.killAll().then(function () {
                process.exit();
            });
        }
        process.on('exit', killAll).on('SIGTERM', function () {
            NemProperties.killAll().then(killAll);
        }).on('SIGINT', function () {
            NemProperties.killAll().then(killAll);
        });
        win.on('close', function () {
            NemProperties.killAll().then(function () {
                win.hide();
                gui.App.quit();
            });
        });
        win.on('new-win-policy', function (frame, url, policy) {
            policy.ignore();
            gui.Shell.openExternal(url);
        });
    }]);
})(Boot || (Boot = {}));
//# sourceMappingURL=boot.js.map