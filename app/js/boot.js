(function(){
'use strict';
var Promise = require('bluebird');
var path = require('path');
var child_process = require('child_process');
var request = require('request');
var gui = require('nw.gui');
var _ = require('lodash');

var win = gui.Window.get(), semver = require('semver'), fs = Promise.promisifyAll(require('fs'));

function templateAsString(filename) {
    return fs.readFileAsync(path.join(process.cwd(), 'templates', filename)).then(function (v) {
        return v.toString();
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
            if (confirm('Do you want to close the program?')) {
                process.exit();
            }
        };

        Global.prototype.loaded = function () {
            return this.WalletConfig.loaded;
        };
        Global.$inject = ['WalletConfig', 'Log', '$state', 'NEM'];
        return Global;
    })();
    Controllers.Global = Global;

    var About = (function () {
        function About(NP) {
            this.versions = {
                nis: NP.instance('nis').version,
                ncc: NP.instance('ncc').version
            };
        }
        About.$inject = ['NemProperties'];
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
                    resolve(JSON.parse(total));
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

                    _.forEach(total['price_btc_data'], function (item) {
                        times.btc.push((new Date(item[0])).toLocaleString());
                        btc.push(item[1]);
                    });

                    _.forEach(total['price_usd_data'], function (item) {
                        times.usd.push((new Date(item[0])).toLocaleString());
                        usd.push(item[1]);
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
                                data: btc
                            }
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
                                data: usd
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
            this.$scope = $scope;
            this.$sce = $sce;
            this.Log = Log;
            this.FeedParser = require('feedparser');
            this.loading = true;
            this.load();
        }
        News.prototype.load = function () {
            var _this = this;
            this.$scope.$eval(function () {
                _this.loading = true;
            });
            return this.fetch().then(function (av) {
                _this.$scope.$evalAsync(function () {
                    _this.news = av;
                    _this.loading = false;
                });
            }, function (err) {
                _this.$scope.$evalAsync(function () {
                    _this.loading = false;
                    _this.Log.add(err.message, 'client');
                });
            });
        };

        News.prototype.fetch = function () {
            var _this = this;
            return new Promise(function (resolve, reject) {
                var req = request('https://forum.nemcoin.com/index.php?type=rss;action=.xml'), feedparser = new _this.FeedParser(), items = [];

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
                    var _items = {};
                    _.forEach(items, function (item) {
                        if (!_items[item.title]) {
                            _items[item.title] = {
                                title: item.title,
                                url: item.permalink,
                                summary: item.summary,
                                date: new Date(item.date)
                            };
                        }
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
        function Log(Log, growl) {
            this.Log = Log;
            this.growl = growl;
            this.logs = [];
            this._filterBy = 'none';
            this.labels = {
                'none': 'None',
                'ncc': 'NCC',
                'nis': 'NIS',
                'java': 'Java',
                'client': 'Client'
            };
        }
        Log.prototype.by = function (type) {
            return this.Log.count(type);
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
            } else if (typeof this.Log.logs[this._filterBy] !== 'undefined') {
                _.forEach(this.Log.logs[this._filterBy], function (log) {
                    _this.logs.push(log);
                });
            }

            this.logs.sort(function (a, b) {
                return a.time - b.time;
            });

            return this.logs;
        };
        Log.$inject = ['Log', 'growl'];
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
    var ServerLog = (function () {
        function ServerLog(Log) {
            this.Log = Log;
            this.restrict = 'E';
            this.scope = {};
            this.template = '<div class="well">{{ item.msg }}</div>';
            this.link = function (scope) {
                var nis = null, ncc = null;

                scope.$watch(function () {
                    var last;
                    if (Log.logs['nis'] && Log.logs['nis'][0] !== nis) {
                        nis = Log.logs['nis'][0];
                    }
                    if (Log.logs['ncc'] && Log.logs['ncc'][0] !== ncc) {
                        ncc = Log.logs['ncc'][0];
                    }

                    if (nis && ncc) {
                        if (nis.time > ncc.time) {
                            last = nis;
                        } else {
                            last = ncc;
                        }
                    } else if (nis) {
                        last = nis;
                    } else if (ncc) {
                        last = ncc;
                    }

                    scope['item'] = last;
                });
            };
        }
        ServerLog.instance = function () {
            var _this = this;
            return ['Log', function (Log) {
                    return new _this(Log);
                }];
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
            return [function () {
                    return new _this;
                }];
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
            this.beta = false;
            this.testnet = false;
            this.folder = path.join(process.cwd(), 'nem');
            this.loaded = false;
            this.updating = false;
        }
        WalletConfig.prototype.save = function () {
            localStorage.setItem('wallet', JSON.stringify(this));
            return this;
        };

        WalletConfig.prototype.load = function () {
            var cnf = this;
            try  {
                var obj = JSON.parse(localStorage.getItem('wallet'));

                _.forEach(obj, function (value, key) {
                    if (_.has(cnf, key) && !_.isFunction(cnf[key])) {
                        cnf[key] = value;
                    }
                });
            } catch (e) {
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
            if (typeof data === "undefined") { data = null; }
            this.name = name;
            this.Hogan = require('hogan.js');
            this.template = this.Hogan.compile(templateAsString('nem.properties.mustache'));
            this.config = {};
            this.version = '';
            this.set(data);
        }
        NemConfig.prototype.path = function (more) {
            if (typeof more === "undefined") { more = []; }
            return path.join.apply(path, [this.config.folder, this.name].concat(more));
        };

        NemConfig.prototype.render = function (data) {
            if (typeof data === "undefined") { data = {}; }
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
            if (typeof signal === "undefined") { signal = 'SIGTERM'; }
            if (this.child) {
                this.child.kill(signal);
            }
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
                    }, function () {
                        _this.Log.add('NIS not found, downloading...', 'client');

                        var Download = require('download'), dl = new Download({
                            extract: true,
                            dest: _this.config.folder
                        }).get('http://bob.nem.ninja/nis-ncc-' + _this.NEM.version + '.tgz');

                        dl.run(function (err) {
                            console.log(arguments);
                            if (err) {
                                return reject(err);
                            }
                            _this.Log.add('NEM downloaded', 'client');
                            resolve();
                        });
                    });
                }, reject);
            });
        };

        NemConfig.prototype.run = function () {
            var _this = this;
            return new Promise(function (resolve, reject) {
                _this.child = child_process.spawn('java', ['-cp', '.;./*;../libs/*', 'org.nem.core.deploy.CommonStarter'], {
                    cwd: path.join(_this.config.folder, _this.name),
                    env: process.env
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
                    _this.Log.add(data.toString(), _this.name);
                });

                _this.child.on('close', function (errCode) {
                    var msg = _this.config.shortServerName + ' closed unexpectedly';
                    _this.Log.add(msg, _this.name);
                });

                _this.child.on('error', function (err) {
                    _this.Log.add(err.message, _this.name);
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
            this.$get = [
                'Log', 'NEM', function (Log, NEM) {
                    return {
                        instance: function (instance) {
                            _this.instances[instance].Log = Log;
                            _this.instances[instance].NEM = NEM;
                            return _this.instances[instance];
                        },
                        killAll: function () {
                            _.forEach(_this.instances, function (instance) {
                                instance.kill();
                            });
                        }
                    };
                }];
        }
        NemProperties.prototype.instance = function (name, data) {
            if (typeof data === "undefined") { data = {}; }
            return this.instances[name] = new NemConfig(name, data);
        };
        return NemProperties;
    })();
    Providers.NemProperties = NemProperties;
})(Providers || (Providers = {}));

var Services;
(function (Services) {
    var Log = (function () {
        function Log($timeout) {
            this.$timeout = $timeout;
            this.$inject = ['$timeout'];
            this.logs = {};
        }
        Log.prototype.count = function (type) {
            if (typeof type === "undefined") { type = 'none'; }
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
            if (typeof group === "undefined") { group = 'global'; }
            if (typeof this.logs[group] === 'undefined') {
                this.logs[group] = [];
            }

            this.$timeout(function () {
                _this.logs[group].unshift({ time: Date.now(), msg: msg });
            }, 0);

            return msg;
        };

        Log.prototype.limit = function (limit, start, group) {
            if (typeof limit === "undefined") { limit = 20; }
            if (typeof start === "undefined") { start = 0; }
            if (typeof group === "undefined") { group = 'global'; }
            if (typeof this.logs[group] === 'undefined') {
                return [];
            }
            return this.logs[group].slice(start, limit);
        };
        return Log;
    })();
    Services.Log = Log;

    var Java = (function () {
        function Java(Log) {
            this.Log = Log;
        }
        Java.prototype.downloadAndInstall = function () {
            var _this = this;
            return new Promise(function (resolve, reject) {
                var url;
                if (!(url = _this.getUrl())) {
                    reject(new Error('Could not find suitable OS'));
                }
                var Download = require('download'), dl = new Download({}).get(url);

                dl.run(function (err, files, stream) {
                    if (err) {
                        return reject(err);
                    }
                    var _path = path.join(process.cwd(), 'jre');

                    child_process.execFile(files[0], ['/s', 'WEB_JAVA=0', 'INSTALLDIR=' + _path, '/L java.log'], {
                        cwd: process.cwd(),
                        env: process.env
                    }, function () {
                        resolve(_path);
                    });
                });
            });
        };

        Java.prototype.getUrl = function () {
            var obj;

            if (typeof (obj = Java.javaVersions[process.platform]) === 'object') {
                if (typeof obj[process.arch] === 'string' && !_.isEmpty(obj[process.arch])) {
                    return obj[process.arch];
                }
            }

            return false;
        };

        Java.prototype.decide = function () {
            var _this = this;
            return new Promise(function (resolve, reject) {
                var child = child_process.spawn('java', ['-version'], { env: process.env });

                child.on('error', function (err) {
                    reject(err);
                });

                child.stderr.on('data', function (result) {
                    var version = result.toString().match(Java.versionRegex);

                    if (version && typeof version[1] === 'string') {
                        if (semver.satisfies(version[1], '>=1.8.0')) {
                            _this.javaBin = 'java';
                            resolve(true);
                        } else {
                            reject(new Error('Java version less than 1.8'));
                        }
                    } else {
                        reject(new Error('No Java version found'));
                    }
                });
            });
        };
        Java.$inject = ['Log'];
        Java.javaUrl = 'http://www.oracle.com/technetwork/java/javase/downloads/jre8-downloads-2133155.html';
        Java.jreRegex = 'https?:\/\/download\.oracle\.com\/otn-pub\/java\/jdk\/[^\/]+?\/jre-[^\-]+?-';
        Java.versionRegex = /java version "([\.\d]+)[^"]+"/;
        Java.javaVersions = {
            'darwin': {
                'arm': '',
                'ia32': '',
                'x64': 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97361'
            },
            'freebsd': {
                'arm': '',
                'ia32': '',
                'x64': ''
            },
            'linux': {
                'arm': '',
                'ia32': 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97358',
                'x64': 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97360'
            },
            'sunos': {
                'arm': '',
                'ia32': 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97363',
                'x64': 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97364'
            },
            'win32': {
                'arm': '',
                'ia32': 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=98426',
                'x64': 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=98428'
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
    'angles',
    'ngLocale',
    'angularUtils.directives.dirPagination',
    'ct.ui.router.extras',
    'angular-growl'
]).value('NEM', {
    version: '0.0.0'
}).controller('Global', Controllers.Global).provider('WalletConfig', Providers.WalletConfig).service('Java', Services.Java).service('Log', Services.Log).directive('serverLog', Directives.ServerLog.instance()).provider('NemProperties', Providers.NemProperties).directive('loading', Directives.Loading.instance()).config([
    '$stateProvider', '$locationProvider', '$urlRouterProvider', 'NemPropertiesProvider', 'WalletConfigProvider', 'growlProvider', function ($stateProvider, $locationProvider, $urlRouterProvider, NemPropertiesProvider, WalletConfig, growlProvider) {
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
            useNetworkTime: true
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
    }]).run([
    'Java', 'NemProperties', 'WalletConfig', '$timeout', 'Log', '$state', 'NEM', function (Java, NemProperties, WalletConfig, $timeout, Log, $state, NEM) {
        request.get('http://bob.nem.ninja/version.txt', {}, function (err, res, version) {
            NEM.version = version.match(/(\d\.\d\.\d)/)[1];

            Java.decide().catch(function (err) {
                Log.add(err.message, 'java');

                return Java.downloadAndInstall().then(function (value) {
                    Log.add('Java downloaded and installed', 'java');
                    return true;
                }, function (err) {
                    Log.add(err.message, 'java');
                    return new Error('Failed to download Java, install manually on ' + Services.Java.javaUrl);
                });
            }).catch(function (err) {
                Log.add(err.message, 'java');
            }).then(function () {
                return NemProperties.instance('nis').run();
            }).then(function () {
                return NemProperties.instance('ncc').run();
            }, function (err) {
                Log.add(err.message, 'nis');
                if (err.code === 'ENOENT') {
                    return NemProperties.instance('nis').download().then(function () {
                        return NemProperties.instance('nis').run();
                    }).then(function () {
                        return NemProperties.instance('ncc').run();
                    });
                }
            }).then(function () {
                $timeout(function () {
                    WalletConfig.loaded = true;
                    $state.go('ncc');
                });
            });
        });

        process.on('exit', function () {
            NemProperties.killAll();
        });

        win.on('close', function () {
            win.hide();
            NemProperties.killAll();
            gui.App.quit();
        });

        win.on('new-win-policy', function (frame, url, policy) {
            policy.ignore();
            gui.Shell.openExternal(url);
        });
    }]);
//# sourceMappingURL=boot.js.map

})();