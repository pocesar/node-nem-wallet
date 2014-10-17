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
    var About = (function () {
        function About() {
        }
        About.$inject = [];
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
        function Market($scope) {
            var _this = this;
            this.current = 'btc';
            this.config = {
                scaleBeginAtZero: false,
                pointDot: false,
                showScale: true,
                scaleShowGridLines: true,
                datasetFill: false,
                pointDotStrokeWidth: 0,
                pointHitDetectionRadius: 0
            };
            this.fetch().then(function (total) {
                $scope.$apply(function () {
                    var btc = [], usd = [], times = [], limit = 20;

                    _.forEach(total['price_btc_data'], function (item, key) {
                        if (key % 16 === 16) {
                            times.push((new Date(item[0])).toLocaleString());
                        }
                        btc.push(item[1]);
                    });

                    _.forEach(total['price_usd_data'], function (item) {
                        usd.push(item[1]);
                    });

                    _this.usd = {
                        labels: times,
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
                        labels: times,
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
                });
            });
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
        Market.$inject = ['$scope'];
        return Market;
    })();
    Controllers.Market = Market;

    var News = (function () {
        function News($scope, $sce) {
            var _this = this;
            this.$sce = $sce;
            this.FeedParser = require('feedparser');
            this.fetch().then(function (av) {
                $scope.$apply(function () {
                    _this.news = av;
                });
            });
        }
        News.prototype.fetch = function () {
            var _this = this;
            return new Promise(function (resolve, reject) {
                var req = request('https://forum.nemcoin.com/index.php?type=rss;action=.xml'), feedparser = new _this.FeedParser(), items = [];

                req.on('error', function (error) {
                    console.log(error);
                });

                req.on('response', function (res) {
                    var stream = this;

                    if (res.statusCode !== 200) {
                        return this.emit('error', new Error('Bad status code'));
                    }

                    stream.pipe(feedparser);
                });

                feedparser.on('error', function (error) {
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
        News.$inject = ['$scope', '$sce'];
        return News;
    })();
    Controllers.News = News;

    var Log = (function () {
        function Log() {
        }
        Log.$inject = ['Log'];
        return Log;
    })();
    Controllers.Log = Log;

    var Config = (function () {
        function Config() {
        }
        Config.$inject = [];
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
            console.log(this.url);
        }
        NCC.$inject = ['NemProperties', '$sce'];
        return NCC;
    })();
    Controllers.NCC = NCC;
})(Controllers || (Controllers = {}));

var Directives;
(function (Directives) {
    var ServerLog = (function () {
        function ServerLog() {
            this.restrict = 'E';
        }
        ServerLog.instance = function () {
            var _this = this;
            return [function () {
                    return new _this;
                }];
        };
        return ServerLog;
    })();
    Directives.ServerLog = ServerLog;

    var Loading = (function () {
        function Loading() {
            this.template = '<div class="loading_indicator_container"><div class="loading_indicator"><img src="img/loading-bars.svg" /></div></div>';
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
    var NemConfig = (function () {
        function NemConfig(name, data) {
            if (typeof data === "undefined") { data = null; }
            this.name = name;
            this.Hogan = require('hogan.js');
            this.template = this.Hogan.compile(templateAsString('nem.properties.mustache'));
            this.config = {};
            this.set(data);
        }
        NemConfig.prototype.render = function (data) {
            if (typeof data === "undefined") { data = {}; }
            return this.template.render(_.defaults(this.config, data));
        };

        NemConfig.prototype.saveToFile = function () {
            return fs.writeFileAsync(path.join(this.config.folder, 'config.properties'), this.render());
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

        NemConfig.prototype.run = function () {
            this.child = child_process.spawn('java', ['-cp', '.;./*;../libs/*', 'org.nem.core.deploy.CommonStarter'], {
                cwd: path.join(this.config.folder, this.name),
                env: process.env
            });

            this.child.stderr.on('data', function (data) {
                console.log('stderr', data.toString());
            });

            this.child.stdout.on('data', function (data) {
                console.log('stdout', data.toString());
            });

            this.child.on('close', function () {
            });

            this.child.on('error', function () {
            });
        };
        return NemConfig;
    })();
    Providers.NemConfig = NemConfig;

    var NemProperties = (function () {
        function NemProperties() {
            this.instances = {};
        }
        NemProperties.prototype.$get = function () {
            var _this = this;
            return {
                instance: function (instance) {
                    return _this.instances[instance];
                },
                killAll: function () {
                    _.forEach(_this.instances, function (instance) {
                        instance.kill();
                    });
                }
            };
        };

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
        function Log() {
            this.logs = {};
        }
        Log.prototype.add = function (msg, group) {
            if (typeof group === "undefined") { group = 'global'; }
            if (typeof this.logs[group] === 'undefined') {
                this.logs[group] = [];
            }
            this.logs[group].unshift({ time: Date.now(), msg: msg });
            return this;
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
        Java.prototype.getUrl = function () {
            var obj;

            if (typeof (obj = Java.javaVersions[process.platform]) === 'object') {
                if (typeof obj[process.arch] === 'string') {
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

angular.module('app', ['ui.router', 'ngSanitize', 'angles']).service('Java', Services.Java).service('Log', Services.Log).directive('serverLog', Directives.ServerLog.instance()).provider('NemProperties', Providers.NemProperties).directive('loading', Directives.Loading.instance()).config([
    '$stateProvider', '$locationProvider', '$urlRouterProvider', 'NemPropertiesProvider', function ($stateProvider, $locationProvider, $urlRouterProvider, NemPropertiesProvider) {
        NemPropertiesProvider.instance('nis', {
            nis: true,
            folder: path.join(process.cwd(), 'nem'),
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
            folder: path.join(process.cwd(), 'nem'),
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
            url: '/ncc',
            template: '<iframe ng-src="{{ncc.url}}" frameBorder="0" class="ncc-iframe" nwdisable></iframe>',
            controllerAs: 'ncc',
            controller: Controllers.NCC
        });
    }]).run([
    'Java', 'NemProperties', '$templateCache', function (Java, NemProperties, $templateCache) {
        win.on('close', function () {
            NemProperties.killAll();
            process.exit();
        });

        win.on('new-win-policy', function (frame, url, policy) {
            policy.ignore();
            gui.Shell.openExternal(url);
        });
    }]);
//# sourceMappingURL=boot.js.map

})();